import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { PrismaClient } from "@prisma/client";
import pino from "pino";

const dev = process.env.NODE_ENV !== "production";
const host = "0.0.0.0";
const port = Number(process.env.PORT || 3000);

// ─── Structured logger ────────────────────────────────────────────────────────
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: dev ? { target: "pino-pretty", options: { colorize: true } } : undefined,
});

const app = next({ dev, hostname: host, port });
const handle = app.getRequestHandler();

// ─── Database ────────────────────────────────────────────────────────────────
// Prisma client is only used when DATABASE_URL is configured.
let prisma = null;
if (process.env.DATABASE_URL) {
  prisma = new PrismaClient({ log: ["warn", "error"] });
} else {
  logger.warn(
    "DATABASE_URL is not set – running without persistence. " +
    "Copy .env.example to .env and start a PostgreSQL instance to enable it."
  );
}

// ─── In-memory state ──────────────────────────────────────────────────────────
const rooms = new Map(); // roomId → Map<clientId, ws>

// Track pending cleanup timers so that a reconnecting client cancels the timer.
const roomCleanupTimers = new Map(); // roomId → timeout handle

// How long (ms) to keep an empty room alive in case clients reconnect.
const ROOM_CLEANUP_DELAY_MS = 60_000;

// Server-side heartbeat: broadcast a ping to all clients every 25 s.
const PING_INTERVAL_MS = 25_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeRoomId(value) {
  const trimmed = (value || "default").trim().slice(0, 40);
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, "-") || "default";
}

function safeName(value) {
  return (value || "User").trim().slice(0, 24) || "User";
}

function safeColor(value) {
  const c = (value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#7c6eff";
}

function parseCookies(cookieHeader) {
  const map = {};
  for (const part of (cookieHeader || "").split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try { map[key] = decodeURIComponent(val); } catch { map[key] = val; }
  }
  return map;
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId);
}

function sendTo(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoom(roomId, payload, excludeClientId = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const [clientId, client] of room.entries()) {
    if (excludeClientId && clientId === excludeClientId) continue;
    sendTo(client, payload);
  }
}

function pushPresence(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const clients = [];
  for (const [clientId, client] of room.entries()) {
    clients.push({
      clientId,
      name: client.displayName,
      color: client.displayColor,
      userId: client.userId || null,
    });
  }
  broadcastRoom(roomId, { type: "presence", roomId, clients });
}

// ─── Session parsing ──────────────────────────────────────────────────────────
// Read the NextAuth JWT from the request cookies and return the user id if valid.
// Falls back gracefully if AUTH_SECRET is not configured.

async function resolveUserId(req) {
  if (!process.env.AUTH_SECRET) return null;
  try {
    const { decode } = await import("@auth/core/jwt");
    const cookies = parseCookies(req.headers["cookie"]);
    const tokenName =
      process.env.NODE_ENV === "production"
        ? "__Secure-authjs.session-token"
        : "authjs.session-token";
    const token = cookies[tokenName];
    if (!token) return null;
    const decoded = await decode({
      token,
      secret: process.env.AUTH_SECRET,
      salt: tokenName,
    });
    return decoded?.sub ?? null;
  } catch {
    return null;
  }
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

async function dbEnsureRoom(roomId, ownerId) {
  if (!prisma) return;
  try {
    await prisma.room.upsert({
      where: { id: roomId },
      create: { id: roomId, ownerId: ownerId || null },
      update: {},
    });
  } catch (err) {
    logger.error({ roomId, err }, "db.ensureRoom failed");
  }
}

async function dbSaveCommit(roomId, sha, commitData, userId) {
  if (!prisma) return;
  try {
    await prisma.$transaction([
      prisma.commit.upsert({
        where: { sha },
        create: {
          sha,
          roomId,
          parentSha: commitData.parent ?? null,
          parents: commitData.parents ?? [],
          branch: commitData.branch,
          message: commitData.message,
          canvasJson: commitData.canvas,
          isMerge: commitData.isMerge ?? false,
          authorId: userId || null,
        },
        update: {},
      }),
      prisma.branch.upsert({
        where: { roomId_name: { roomId, name: commitData.branch } },
        create: { roomId, name: commitData.branch, headSha: sha },
        update: { headSha: sha },
      }),
      prisma.roomState.upsert({
        where: { roomId },
        create: {
          roomId,
          headSha: sha,
          headBranch: commitData.branch,
          isDetached: false,
        },
        update: { headSha: sha, headBranch: commitData.branch },
      }),
    ]);
  } catch (err) {
    logger.error({ roomId, sha, err }, "db.saveCommit failed");
  }
}

async function dbLoadSnapshot(roomId) {
  if (!prisma) return null;
  try {
    const [commits, branches, state] = await Promise.all([
      prisma.commit.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } }),
      prisma.branch.findMany({ where: { roomId } }),
      prisma.roomState.findUnique({ where: { roomId } }),
    ]);

    if (commits.length === 0) return null;

    const commitsMap = {};
    for (const c of commits) {
      commitsMap[c.sha] = {
        sha: c.sha,
        parent: c.parentSha,
        parents: c.parents,
        message: c.message,
        ts: c.createdAt.getTime(),
        canvas: c.canvasJson,
        branch: c.branch,
        isMerge: c.isMerge,
      };
    }
    const branchesMap = {};
    for (const b of branches) branchesMap[b.name] = b.headSha;

    return {
      commits: commitsMap,
      branches: branchesMap,
      HEAD: state?.headBranch ?? "main",
      detached: state?.isDetached && state.headSha ? state.headSha : null,
    };
  } catch (err) {
    logger.error({ roomId, err }, "db.loadSnapshot failed");
    return null;
  }
}

// ─── Server ───────────────────────────────────────────────────────────────────

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: true });

  server.on("upgrade", async (req, socket, head) => {
    const reqUrl = new URL(req.url || "/", `http://${req.headers.host}`);
    if (reqUrl.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    // Resolve the authenticated user id from the NextAuth session cookie (may be null)
    const userId = await resolveUserId(req);

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws._userId = userId;
      wss.emit("connection", ws, reqUrl);
    });
  });

  wss.on("connection", async (ws, reqUrl) => {
    const roomId = safeRoomId(reqUrl.searchParams.get("room"));
    const clientId = randomUUID().slice(0, 8);

    ws.clientId = clientId;
    ws.roomId = roomId;
    ws.userId = ws._userId ?? null;
    ws.displayName = safeName(reqUrl.searchParams.get("name"));
    ws.displayColor = safeColor(reqUrl.searchParams.get("color"));

    const room = getRoom(roomId);
    room.set(clientId, ws);

    // Cancel any pending cleanup timer for this room (a client just rejoined)
    if (roomCleanupTimers.has(roomId)) {
      clearTimeout(roomCleanupTimers.get(roomId));
      roomCleanupTimers.delete(roomId);
    }

    // Ensure the room is registered in the database
    await dbEnsureRoom(roomId, ws.userId);

    logger.info({ clientId, roomId, userId: ws.userId || null }, "ws: client connected");

    sendTo(ws, { type: "welcome", roomId, clientId });
    pushPresence(roomId);

    // If this is the only client in the room, serve historical state from DB
    if (room.size === 1) {
      const snapshot = await dbLoadSnapshot(roomId);
      if (snapshot) {
        sendTo(ws, {
          type: "fullsync",
          targetId: clientId,
          commits: snapshot.commits,
          branches: snapshot.branches,
          HEAD: snapshot.HEAD,
          detached: snapshot.detached,
        });
      }
    }

    ws.on("message", async (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        logger.warn({ clientId, roomId }, "ws: failed to parse message");
        return;
      }

      if (!message || typeof message.type !== "string") return;

      if (message.type === "profile") {
        ws.displayName = safeName(message.name);
        ws.displayColor = safeColor(message.color);
        pushPresence(roomId);
        return;
      }

      // Drop ping/pong before any further processing – heartbeat only
      if (message.type === "ping" || message.type === "pong") return;

      // Persist commit messages to the database
      if (message.type === "commit" && message.sha && message.commit) {
        logger.info({ clientId, roomId, sha: message.sha }, "ws: commit received");
        await dbSaveCommit(roomId, message.sha, message.commit, ws.userId);
      }

      // Relay to peers
      const relay = {
        ...message,
        senderId: ws.clientId,
        senderName: ws.displayName,
        senderColor: ws.displayColor,
        roomId,
      };
      broadcastRoom(roomId, relay, ws.clientId);
    });

    ws.on("close", () => {
      logger.info({ clientId, roomId }, "ws: client disconnected");
      const currentRoom = rooms.get(roomId);
      if (!currentRoom) return;

      currentRoom.delete(clientId);

      if (currentRoom.size === 0) {
        // Delay teardown – reconnecting clients can still receive a fullsync.
        const timer = setTimeout(() => {
          if (rooms.get(roomId)?.size === 0) {
            rooms.delete(roomId);
          }
          roomCleanupTimers.delete(roomId);
        }, ROOM_CLEANUP_DELAY_MS);
        roomCleanupTimers.set(roomId, timer);
        return;
      }

      pushPresence(roomId);
      broadcastRoom(roomId, { type: "user-left", clientId }, clientId);
    });
  });

  server.listen(port, host, () => {
    logger.info({ host, port }, "SketchGit server listening");
  });

  // ─── Server-side heartbeat ─────────────────────────────────────────────────
  // Broadcast a `ping` to every connected client every 25 seconds so that
  // clients can detect stale TCP connections (zombie sockets).
  setInterval(() => {
    for (const room of rooms.values()) {
      for (const client of room.values()) {
        sendTo(client, { type: "ping" });
      }
    }
  }, PING_INTERVAL_MS);
});

