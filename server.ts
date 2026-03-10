/**
 * SketchGit custom Node.js server.
 *
 * Combines the Next.js request handler with a WebSocket room server.
 *
 * P013 – migrated from server.mjs to TypeScript for full type safety.
 * P015 – per-IP WebSocket connection limiting to prevent resource exhaustion.
 * P019 – WebSocket Origin validation (cross-site WebSocket hijacking prevention).
 * P023 – /api/health and /api/ready endpoints; graceful SIGTERM shutdown.
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

// P019 – allowed WebSocket origins (CSRF protection)
// Browsers always send the Origin header on WebSocket upgrades.
// Server-to-server / CLI tools typically omit it (we allow those through).
// Origins are normalised via `new URL(...).origin` so that trailing slashes
// or differences in case do not cause legitimate upgrades to be rejected.
const ALLOWED_ORIGINS: Set<string> = (() => {
  const raw = process.env.WS_ALLOWED_ORIGINS ?? env.NEXTAUTH_URL;
  return new Set(
    raw
      .split(",")
      .map((o) => {
        const trimmed = o.trim();
        try {
          return new URL(trimmed).origin;
        } catch {
          return trimmed;
        }
      })
      .filter(Boolean),
  );
})();

// P023 – readiness flag: false until the HTTP server is fully listening
let isReady = false;
let isShuttingDown = false;

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

// P023 – lightweight DB health probe (SELECT 1)
async function checkDbHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
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
  // Validate canvas JSON before entering the transaction. An invalid payload
  // means the commit is unrenderable – log and skip rather than persisting
  // a silent empty fallback that would confuse clients.
  let canvasObj: object;
  try {
    canvasObj = JSON.parse(commitData.canvas) as object;
  } catch (err) {
    logger.warn({ roomId, sha, err }, "db.saveCommit: invalid canvas JSON; skipping persistence");
    return;
  }

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
          // P011: canvasJson is now Json (JSONB) – pass a parsed object, not a string.
          canvasJson: canvasObj,
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
      // P011: Load the 100 most-recent commits (DESC) then reverse so clients
      // receive them in chronological order for correct parent-chain replay.
      // Rooms with >100 commits will serve only recent history; full history
      // can be fetched via GET /api/rooms/:id/commits?cursor=<sha>.
      prisma.commit.findMany({
        where: { roomId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.branch.findMany({ where: { roomId } }),
      prisma.roomState.findUnique({ where: { roomId } }),
    ]);

    if (commits.length === 0) return null;

    // Reverse to restore chronological (oldest-first) order for client replay.
    commits.reverse();

    const commitsMap: Record<string, unknown> = {};
    for (const c of commits) {
      commitsMap[c.sha] = {
        sha: c.sha,
        parent: c.parentSha,
        parents: c.parents,
        message: c.message,
        ts: c.createdAt.getTime(),
        // P011: canvasJson is now a parsed object from JSONB – re-stringify for
        // the client-side git model which expects a JSON string.
        canvas: (() => {
          try { return JSON.stringify(c.canvasJson); }
          catch { return '{"objects":[]}'; }
        })(),
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
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // P023 – liveness probe: is the process alive and not deadlocked?
    if (req.url === "/api/health") {
      const dbOk = await checkDbHealth();
      const payload = JSON.stringify({
        status: dbOk ? "ok" : "degraded",
        uptime: process.uptime(),
        rooms: rooms.size,
        clients: wss.clients.size,
        database: dbOk ? "ok" : "unreachable",
      });
      res.writeHead(dbOk ? 200 : 503, { "Content-Type": "application/json" });
      res.end(payload);
      return;
    }

    // P023 – readiness probe: is the server ready to accept traffic?
    if (req.url === "/api/ready") {
      res.writeHead(isReady ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ready: isReady }));
      return;
    }

    handle(req, res);
  });
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: true });

  server.on("upgrade", async (req: IncomingMessage, socket, head) => {
    const reqUrl = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (reqUrl.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    // P019 – reject upgrades from disallowed origins (CSWSH prevention).
    // Browsers always set Origin; server-side tools typically omit it (allowed).
    const origin = req.headers["origin"];
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      logger.warn({ origin }, "ws: rejected upgrade from disallowed origin");
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
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
    isReady = true; // P023 – mark server as ready to serve traffic
    logger.info({ host, port }, "SketchGit server listening");
  });

  // ─── Server-side heartbeat ─────────────────────────────────────────────────
  const pingInterval = setInterval(() => {
    for (const room of rooms.values()) {
      for (const clientState of room.values()) {
        sendTo(clientState, { type: "ping" });
      }
    }
  }, PING_INTERVAL_MS);

  // ─── Graceful shutdown (P023) ──────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    isReady = false; // stop accepting new traffic via /api/ready
    logger.info({ signal }, "Graceful shutdown initiated");

    // 1. Send close frames to all connected WebSocket clients (code 1001 = Going Away)
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1001, "Server is shutting down");
      }
    });

    // 2. Stop accepting new WebSocket upgrades and HTTP requests
    await Promise.all([
      new Promise<void>((resolve) => wss.close(() => resolve())),
      new Promise<void>((resolve) => server.close(() => resolve())),
    ]);

    // 3. Clear timers
    clearInterval(pingInterval);

    // 4. Disconnect from the database
    await prisma.$disconnect();

    logger.info("Graceful shutdown complete");
    process.exit(0);
  };

  // Force-exit if graceful shutdown takes longer than 10 seconds.
  // Exit code 2 differentiates a timeout from a clean (0) or error (1) shutdown.
  const registerShutdown = (signal: string) => {
    process.once(signal, () => {
      setTimeout(() => {
        logger.error("Graceful shutdown timed out; forcing exit with code 2");
        process.exit(2);
      }, 10_000).unref();
      void shutdown(signal);
    });
  };
  registerShutdown("SIGTERM");
  registerShutdown("SIGINT");
});
