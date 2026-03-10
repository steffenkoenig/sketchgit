/**
 * SketchGit custom Node.js server.
 *
 * Combines the Next.js request handler with a WebSocket room server.
 *
 * P013 – migrated from server.mjs to TypeScript for full type safety.
 * P015 – per-IP WebSocket connection limiting to prevent resource exhaustion.
 * P027 – environment variables validated at startup via validateEnv().
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { PrismaClient } from "@prisma/client";
import pino from "pino";
import { validateEnv } from "./lib/env.js";
import type { WsMessage } from "./lib/sketchgit/types.js";

// ─── Startup env validation ───────────────────────────────────────────────────
const env = validateEnv();

const dev = env.NODE_ENV !== "production";
const host = "0.0.0.0";
const port = env.PORT;

// ─── Structured logger ────────────────────────────────────────────────────────
const logger = pino({
  level: env.LOG_LEVEL,
  transport: dev ? { target: "pino-pretty", options: { colorize: true } } : undefined,
});

const app = next({ dev, hostname: host, port });
const handle = app.getRequestHandler();

// ─── Database ────────────────────────────────────────────────────────────────
// DATABASE_URL is guaranteed to be present (validated above).
const prisma = new PrismaClient({ log: ["warn", "error"] });

// ─── In-memory state ──────────────────────────────────────────────────────────

type ClientState = WebSocket & {
  clientId: string;
  roomId: string;
  userId: string | null;
  displayName: string;
  displayColor: string;
  /** Internal: user id resolved during WebSocket upgrade */
  _userId?: string | null;
  /** Internal: remote IP captured during the HTTP upgrade */
  _ip: string;
};

const rooms = new Map<string, Map<string, ClientState>>();

// Track pending cleanup timers so that a reconnecting client cancels the timer.
const roomCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

// P015 – per-IP WebSocket connection counter
const connectionsPerIp = new Map<string, number>();
const MAX_CONNECTIONS_PER_IP = 20;

// How long (ms) to keep an empty room alive in case clients reconnect.
const ROOM_CLEANUP_DELAY_MS = 60_000;

// Server-side heartbeat: broadcast a ping to all clients every 25 s.
const PING_INTERVAL_MS = 25_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeRoomId(value: string | null): string {
  const trimmed = (value ?? "default").trim().slice(0, 40);
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, "-") || "default";
}

function safeName(value: string | null): string {
  return (value ?? "User").trim().slice(0, 24) || "User";
}

function safeColor(value: string | null): string {
  const c = (value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#7c6eff";
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const part of (cookieHeader ?? "").split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      map[key] = decodeURIComponent(val);
    } catch {
      map[key] = val;
    }
  }
  return map;
}

function getRoom(roomId: string): Map<string, ClientState> {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId)!;
}

function sendTo(ws: WebSocket, payload: WsMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoom(
  roomId: string,
  payload: WsMessage,
  excludeClientId: string | null = null,
): void {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const [clientId, client] of room.entries()) {
    if (excludeClientId && clientId === excludeClientId) continue;
    sendTo(client, payload);
  }
}

function pushPresence(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  const clients = [];
  for (const [clientId, client] of room.entries()) {
    clients.push({
      clientId,
      name: client.displayName,
      color: client.displayColor,
      userId: client.userId ?? null,
    });
  }
  broadcastRoom(roomId, { type: "presence", roomId, clients });
}

// ─── Session parsing ──────────────────────────────────────────────────────────

async function resolveUserId(req: IncomingMessage): Promise<string | null> {
  try {
    const { decode } = await import("@auth/core/jwt");
    const cookies = parseCookies(req.headers["cookie"]);
    const tokenName =
      env.NODE_ENV === "production"
        ? "__Secure-authjs.session-token"
        : "authjs.session-token";
    const token = cookies[tokenName];
    if (!token) return null;
    const decoded = await decode({
      token,
      secret: env.AUTH_SECRET,
      salt: tokenName,
    });
    return (decoded as { sub?: string } | null)?.sub ?? null;
  } catch {
    return null;
  }
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

async function dbEnsureRoom(roomId: string, ownerId: string | null): Promise<void> {
  try {
    await prisma.room.upsert({
      where: { id: roomId },
      create: { id: roomId, ownerId: ownerId ?? null },
      update: {},
    });
  } catch (err) {
    logger.error({ roomId, err }, "db.ensureRoom failed");
  }
}

interface CommitData {
  parent?: string | null;
  parents?: string[];
  branch: string;
  message: string;
  canvas: string;
  isMerge?: boolean;
}

async function dbSaveCommit(
  roomId: string,
  sha: string,
  commitData: CommitData,
  userId: string | null,
): Promise<void> {
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
          authorId: userId ?? null,
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

interface RoomSnapshot {
  commits: Record<string, unknown>;
  branches: Record<string, string>;
  HEAD: string;
  detached: string | null;
}

async function dbLoadSnapshot(roomId: string): Promise<RoomSnapshot | null> {
  try {
    const [commits, branches, state] = await Promise.all([
      prisma.commit.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } }),
      prisma.branch.findMany({ where: { roomId } }),
      prisma.roomState.findUnique({ where: { roomId } }),
    ]);

    if (commits.length === 0) return null;

    const commitsMap: Record<string, unknown> = {};
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
    const branchesMap: Record<string, string> = {};
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
  const server = createServer((req: IncomingMessage, res: ServerResponse) =>
    handle(req, res),
  );
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: true });

  server.on("upgrade", async (req: IncomingMessage, socket, head) => {
    const reqUrl = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (reqUrl.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    // P015 – check per-IP connection limit before accepting the upgrade
    const ip = (req.socket.remoteAddress ?? "unknown").replace(/^::ffff:/, "");
    const currentCount = connectionsPerIp.get(ip) ?? 0;
    if (currentCount >= MAX_CONNECTIONS_PER_IP) {
      logger.warn({ ip }, "ws: connection limit reached, rejecting upgrade");
      socket.write("HTTP/1.1 429 Too Many Connections\r\n\r\n");
      socket.destroy();
      return;
    }

    // Resolve the authenticated user id from the NextAuth session cookie (may be null)
    const userId = await resolveUserId(req);

    wss.handleUpgrade(req, socket, head, (ws) => {
      const typedWs = ws as ClientState;
      typedWs._userId = userId;
      typedWs._ip = ip;
      wss.emit("connection", ws, reqUrl);
    });
  });

  wss.on("connection", async (ws: WebSocket, reqUrl: URL) => {
    const client = ws as ClientState;
    const roomId = safeRoomId(reqUrl.searchParams.get("room"));
    const clientId = randomUUID().slice(0, 8);

    client.clientId = clientId;
    client.roomId = roomId;
    client.userId = client._userId ?? null;
    client.displayName = safeName(reqUrl.searchParams.get("name"));
    client.displayColor = safeColor(reqUrl.searchParams.get("color"));

    // P015 – increment per-IP connection counter
    const ip = client._ip ?? "unknown";
    connectionsPerIp.set(ip, (connectionsPerIp.get(ip) ?? 0) + 1);

    const room = getRoom(roomId);
    room.set(clientId, client);

    // Cancel any pending cleanup timer for this room (a client just rejoined)
    if (roomCleanupTimers.has(roomId)) {
      clearTimeout(roomCleanupTimers.get(roomId)!);
      roomCleanupTimers.delete(roomId);
    }

    // Ensure the room is registered in the database
    await dbEnsureRoom(roomId, client.userId);

    logger.info({ clientId, roomId, userId: client.userId ?? null }, "ws: client connected");

    sendTo(client, { type: "welcome", roomId, clientId });
    pushPresence(roomId);

    // If this is the only client in the room, serve historical state from DB
    if (room.size === 1) {
      const snapshot = await dbLoadSnapshot(roomId);
      if (snapshot) {
        sendTo(client, {
          type: "fullsync",
          targetId: clientId,
          commits: snapshot.commits,
          branches: snapshot.branches,
          HEAD: snapshot.HEAD,
          detached: snapshot.detached,
        });
      }
    }

    client.on("message", async (raw) => {
      let message: WsMessage;
      try {
        const parsed: unknown = JSON.parse(raw.toString());
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          typeof (parsed as Record<string, unknown>).type !== "string"
        ) {
          logger.warn({ clientId, roomId }, "ws: received message without type field");
          return;
        }
        message = parsed as WsMessage;
      } catch {
        logger.warn({ clientId, roomId }, "ws: failed to parse message");
        return;
      }

      if (message.type === "profile") {
        client.displayName = safeName((message.name as string | null) ?? null);
        client.displayColor = safeColor((message.color as string | null) ?? null);
        pushPresence(roomId);
        return;
      }

      // Drop ping/pong before any further processing – heartbeat only
      if (message.type === "ping" || message.type === "pong") return;

      // Persist commit messages to the database
      if (message.type === "commit" && message.sha && message.commit) {
        logger.info({ clientId, roomId, sha: message.sha }, "ws: commit received");
        await dbSaveCommit(
          roomId,
          message.sha as string,
          message.commit as CommitData,
          client.userId,
        );
      }

      // Relay to peers
      const relay: WsMessage = {
        ...message,
        senderId: client.clientId,
        senderName: client.displayName,
        senderColor: client.displayColor,
        roomId,
      };
      broadcastRoom(roomId, relay, client.clientId);
    });

    client.on("close", () => {
      logger.info({ clientId, roomId }, "ws: client disconnected");

      // P015 – decrement per-IP connection counter
      const remaining = (connectionsPerIp.get(ip) ?? 1) - 1;
      remaining > 0
        ? connectionsPerIp.set(ip, remaining)
        : connectionsPerIp.delete(ip);

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
  setInterval(() => {
    for (const room of rooms.values()) {
      for (const clientState of room.values()) {
        sendTo(clientState, { type: "ping" });
      }
    }
  }, PING_INTERVAL_MS);

  // ─── Graceful shutdown (P023) ──────────────────────────────────────────────
  const shutdown = async () => {
    logger.info("Shutting down SketchGit server…");
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
});
