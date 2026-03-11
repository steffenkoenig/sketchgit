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
 * P012 – Optional Redis Pub/Sub for horizontal scalability across multiple
 *         server instances.  When REDIS_URL is set, every WebSocket message is
 *         published to `sketchgit:room:<roomId>` so that peer instances can
 *         relay it to their locally-connected clients.  When REDIS_URL is
 *         absent the server operates in single-process mode (existing behaviour).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { PrismaClient, CommitStorageType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pino from "pino";
import { validateEnv } from "./lib/env.js";
import type { WsMessage } from "./lib/sketchgit/types.js";
import { createRoomSnapshotCache } from "./lib/cache/roomSnapshotCache.js";
import { InboundWsMessageSchema } from "./lib/api/wsSchemas.js";
import { pruneInactiveRooms, checkRoomAccess, type ClientRole } from "./lib/db/roomRepository.js";
import { computeCanvasDelta, replayCanvasDelta, type CanvasDelta } from "./lib/sketchgit/git/canvasDelta.js";

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
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  log: ["warn", "error"],
});

// ─── P012: Redis Pub/Sub (optional) ──────────────────────────────────────────
// Two separate ioredis connections are required: one for publishing and one for
// subscribing (a connection that has called SUBSCRIBE cannot issue other commands).
// Both clients are null when REDIS_URL is absent; in that case all traffic stays
// local-only (existing single-instance behaviour).

/** Prefix for all room channels to avoid collisions with other Redis users. */
const REDIS_CHANNEL_PREFIX = "sketchgit:room:";

/** P035: Prefix for per-room presence hashes. */
const REDIS_PRESENCE_PREFIX = "sketchgit:presence:";

/**
 * Unique identifier for this server instance.
 * Embedded in every Redis envelope so that the pmessage subscriber can
 * recognise and skip messages it published itself, preventing local clients
 * from receiving duplicate delivery (once from the local broadcast and once
 * from the Redis relay).
 */
const SERVER_INSTANCE_ID = randomUUID();

type RedisClient = import("ioredis").default;

let redisPub: RedisClient | null = null;
let redisSub: RedisClient | null = null;

/** True once the Redis subscriber is connected and listening. */
let redisReady = false;

async function initRedis(): Promise<void> {
  if (!env.REDIS_URL) return; // optional feature – skip when not configured

  const { default: Redis } = await import("ioredis");

  const redisOpts = {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: (times: number) => Math.min(times * 200, 5_000),
  };

  redisPub = new Redis(env.REDIS_URL, redisOpts);
  redisSub = new Redis(env.REDIS_URL, redisOpts);

  redisPub.on("error", (err) => logger.error({ err }, "redis: pub connection error"));
  redisSub.on("error", (err) => logger.error({ err }, "redis: sub connection error"));

  await Promise.all([redisPub.connect(), redisSub.connect()]);

  // Subscribe to all room channels using a wildcard pattern.
  // When a peer instance publishes a message we receive it here and relay it
  // to locally-connected WebSocket clients.
  await redisSub.psubscribe(`${REDIS_CHANNEL_PREFIX}*`);

  redisSub.on("pmessage", (_pattern: string, channel: string, data: string) => {
    const roomId = channel.slice(REDIS_CHANNEL_PREFIX.length);
    let envelope: { from: string; instanceId: string; payload: WsMessage };
    try {
      envelope = JSON.parse(data) as { from: string; instanceId: string; payload: WsMessage };
    } catch {
      logger.warn({ channel }, "redis: failed to parse pmessage payload");
      return;
    }
    // Skip messages this instance published itself – those clients already
    // received the message via the synchronous local broadcast in broadcastRoom().
    if (envelope.instanceId === SERVER_INSTANCE_ID) return;
    // Relay to locally-connected clients only (excluding the original sender
    // whose clientId is embedded in the envelope to prevent echo-loops).
    broadcastLocalRoom(roomId, envelope.payload, envelope.from);
  });

  redisReady = true;
  logger.info("redis: pub/sub connected and ready");
}

// ─── In-memory state ──────────────────────────────────────────────────────────

type ClientState = WebSocket & {
  clientId: string;
  roomId: string;
  userId: string | null;
  /** P034: resolved access role for this client (set after checkRoomAccess) */
  role: ClientRole;
  displayName: string;
  displayColor: string;
  /** Internal: user id resolved during WebSocket upgrade */
  _userId?: string | null;
  /** Internal: remote IP captured during the HTTP upgrade */
  _ip: string;
};

const rooms = new Map<string, Map<string, ClientState>>();

// P030 – LRU snapshot cache to avoid re-loading DB state on every connection.
const roomCache = createRoomSnapshotCache();

// Track pending cleanup timers so that a reconnecting client cancels the timer.
const roomCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

// P044 – per-room debounce timers for presence broadcasts.
const presenceDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

// P044 – configurable debounce window; expose via env: PRESENCE_DEBOUNCE_MS (default: 80).
const PRESENCE_DEBOUNCE_MS = env.PRESENCE_DEBOUNCE_MS;

// P015 – per-IP WebSocket connection counter
const connectionsPerIp = new Map<string, number>();
const MAX_CONNECTIONS_PER_IP = 20;

// How long (ms) to keep an empty room alive in case clients reconnect.
const ROOM_CLEANUP_DELAY_MS = 60_000;

// P043 – Drain window for in-flight DB writes before shutdown.
const SHUTDOWN_DRAIN_MS = env.SHUTDOWN_DRAIN_MS;

/** Count of database write operations currently in progress. */
let inFlightWrites = 0;

/** Resolvers waiting for in-flight writes to reach zero (used during shutdown). */
const drainWaiters: Array<() => void> = [];

function beginWrite(): void {
  inFlightWrites++;
}

function endWrite(): void {
  inFlightWrites--;
  if (inFlightWrites <= 0) {
    inFlightWrites = 0;
    drainWaiters.splice(0).forEach((resolve) => resolve());
  }
}

/** Resolve when in-flight writes reach zero, or after `timeoutMs`. */
function waitForDrain(timeoutMs: number): Promise<void> {
  if (inFlightWrites === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      const idx = drainWaiters.indexOf(resolve);
      if (idx !== -1) drainWaiters.splice(idx, 1);
      resolve();
    }, timeoutMs);
    drainWaiters.push(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// Server-side heartbeat: broadcast a ping to all clients every 25 s.
const PING_INTERVAL_MS = 25_000;

// P019 – allowed WebSocket origins (CSRF protection)
// Browsers always send the Origin header on WebSocket upgrades.
// Server-to-server / CLI tools typically omit it (we allow those through).
// Origins are normalised via `new URL(...).origin` so that trailing slashes
// or differences in case do not cause legitimate upgrades to be rejected.
const ALLOWED_ORIGINS: Set<string> = (() => {
  // Treat an empty/whitespace-only WS_ALLOWED_ORIGINS as unset so we always
  // fall back to NEXTAUTH_URL rather than producing an empty allow-list that
  // would reject all browser upgrades.
  const raw = process.env.WS_ALLOWED_ORIGINS?.trim() || env.NEXTAUTH_URL;
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

/**
 * Broadcast a message to all locally-connected clients in a room.
 * This is the inner function; use `broadcastRoom` for normal use (which also
 * publishes to Redis so peer instances can relay the message).
 */
function broadcastLocalRoom(
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

/**
 * P012: Broadcast a message to all clients in a room.
 *  - Local delivery is synchronous (sub-millisecond).
 *  - When Redis is available the message is also published to the room channel
 *    so that peer server instances relay it to their locally-connected clients.
 *    The `excludeClientId` is embedded in the envelope so that receiving
 *    instances can exclude the originating client and avoid echo-loops.
 */
function broadcastRoom(
  roomId: string,
  payload: WsMessage,
  excludeClientId: string | null = null,
): void {
  // 1. Local broadcast (always, immediate)
  broadcastLocalRoom(roomId, payload, excludeClientId);

  // 2. Cross-instance broadcast via Redis (when available)
  if (redisPub && redisReady) {
    const envelope = JSON.stringify({ from: excludeClientId ?? "", instanceId: SERVER_INSTANCE_ID, payload });
    redisPub.publish(`${REDIS_CHANNEL_PREFIX}${roomId}`, envelope).catch((err) => {
      logger.warn({ roomId, err }, "redis: publish failed");
    });
  }
}

/** P035: TTL in seconds for the per-room presence Hash in Redis (2× heartbeat cycle). */
const REDIS_PRESENCE_TTL_SECONDS = 30;

/**
 * P035 – Return the merged list of clients from all server instances for a room.
 * Falls back to the local client list when Redis is unavailable.
 */
async function getGlobalPresence(
  roomId: string,
  localClients: Array<{ clientId: string; name: string; color: string; userId: string | null }>,
): Promise<Array<{ clientId: string; name: string; color: string; userId: string | null }>> {
  if (!redisPub || !redisReady) return localClients;

  try {
    const key = `${REDIS_PRESENCE_PREFIX}${roomId}`;
    const allFields = await redisPub.hgetall(key);
    if (!allFields) return localClients;

    const seen = new Set<string>();
    const merged: Array<{ clientId: string; name: string; color: string; userId: string | null }> = [];
    for (const value of Object.values(allFields)) {
      const clients = JSON.parse(value) as Array<{ clientId: string; name: string; color: string; userId: string | null }>;
      for (const c of clients) {
        if (!seen.has(c.clientId)) {
          seen.add(c.clientId);
          merged.push(c);
        }
      }
    }
    return merged;
  } catch (err) {
    logger.warn({ roomId, err }, "redis: getGlobalPresence failed, falling back to local");
    return localClients;
  }
}

function pushPresence(roomId: string): void {
  const room = rooms.get(roomId);
  // Compute local client list regardless of Redis availability
  const localClients: Array<{ clientId: string; name: string; color: string; userId: string | null }> = [];
  if (room) {
    for (const [clientId, client] of room.entries()) {
      localClients.push({
        clientId,
        name: client.displayName,
        color: client.displayColor,
        userId: client.userId ?? null,
      });
    }
  }

  if (redisPub && redisReady) {
    // P035: Publish this instance's client list to Redis atomically (HSET + EXPIRE
    // in a pipeline to prevent the Hash from outliving a crashed instance).
    const key = `${REDIS_PRESENCE_PREFIX}${roomId}`;
    const pipeline = redisPub.pipeline();
    pipeline.hset(key, SERVER_INSTANCE_ID, JSON.stringify(localClients));
    pipeline.expire(key, REDIS_PRESENCE_TTL_SECONDS);
    // Fetch global merged list, then broadcast
    void pipeline.exec().then(() =>
      getGlobalPresence(roomId, localClients).then((clients) => {
        broadcastLocalRoom(roomId, { type: "presence", roomId, clients });
      }).catch((err) => {
        logger.warn({ roomId, err }, "redis: presence merge failed");
        broadcastLocalRoom(roomId, { type: "presence", roomId, clients: localClients });
      }),
    );
  } else {
    // Single-instance: broadcast local-only presence immediately
    broadcastLocalRoom(roomId, { type: "presence", roomId, clients: localClients });
  }
}

/**
 * P044 – Schedule a debounced presence broadcast for the given room.
 * Multiple calls within PRESENCE_DEBOUNCE_MS are coalesced into a single
 * broadcast, which reflects the stable room state after a burst of joins or
 * disconnects.  Immediate welcome delivery is unaffected (no delay on "welcome").
 */
function schedulePushPresence(roomId: string): void {
  const existing = presenceDebounceTimers.get(roomId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    presenceDebounceTimers.delete(roomId);
    pushPresence(roomId);
  }, PRESENCE_DEBOUNCE_MS);

  presenceDebounceTimers.set(roomId, timer);
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

  // P033: attempt delta compression when there's a parent commit stored as SNAPSHOT
  let storageType: CommitStorageType = CommitStorageType.SNAPSHOT;
  let canvasToStore: object = canvasObj;

  if (commitData.parent) {
    try {
      const parentCommit = await prisma.commit.findUnique({ where: { sha: commitData.parent } });
      if (parentCommit && parentCommit.storageType === CommitStorageType.SNAPSHOT) {
        const parentCanvas = JSON.stringify(parentCommit.canvasJson);
        const delta = computeCanvasDelta(parentCanvas, commitData.canvas);
        const deltaStr = JSON.stringify(delta);
        if (deltaStr.length < commitData.canvas.length * 0.9) {
          canvasToStore = delta as unknown as object;
          storageType = CommitStorageType.DELTA;
        }
      }
    } catch {
      // Fall back to SNAPSHOT on any error
    }
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
          // P033: may be a delta object if storageType is DELTA.
          canvasJson: canvasToStore,
          isMerge: commitData.isMerge ?? false,
          storageType,
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

    // P033: reconstruct DELTA commits by replaying against parent canvas
    const canvasCache = new Map<string, string>();
    const commitsMap: Record<string, unknown> = {};
    for (const c of commits) {
      let canvasStr: string;
      if (c.storageType === CommitStorageType.SNAPSHOT || !c.parentSha) {
        try { canvasStr = JSON.stringify(c.canvasJson); }
        catch { canvasStr = '{"objects":[]}'; }
      } else {
        const parentCanvas = canvasCache.get(c.parentSha) ?? '{"objects":[]}';
        try {
          canvasStr = replayCanvasDelta(parentCanvas, c.canvasJson as CanvasDelta);
        } catch {
          try { canvasStr = JSON.stringify(c.canvasJson); }
          catch { canvasStr = '{"objects":[]}'; }
        }
      }
      canvasCache.set(c.sha, canvasStr);
      commitsMap[c.sha] = {
        sha: c.sha,
        parent: c.parentSha,
        parents: c.parents,
        message: c.message,
        ts: c.createdAt.getTime(),
        canvas: canvasStr,
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

// P012: Start Redis connection before the HTTP server so the pub/sub channel
// is ready when the first WebSocket client connects.  Redis failure is
// non-fatal: the server continues in local-only mode.
void initRedis().catch((err) =>
  logger.error({ err }, "redis: initRedis failed – running in local-only mode"),
);

// P032 – periodic room pruning job
function startPruningJob(intervalMs: number, retentionDays: number): ReturnType<typeof setInterval> {
  let running = false;
  const timer = setInterval(() => {
    if (running) {
      logger.warn("pruning: previous job still running, skipping this interval");
      return;
    }
    running = true;
    const activeRoomIds = [...rooms.keys()];
    pruneInactiveRooms(retentionDays, activeRoomIds)
      .then((count) => {
        if (count > 0) {
          logger.info({ count, retentionDays }, "pruning: removed inactive rooms");
        }
      })
      .catch((err: unknown) => {
        logger.error({ err }, "pruning: failed to prune inactive rooms");
      })
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref();
  return timer;
}

let pruneJobTimer: ReturnType<typeof setInterval> | null = null;
pruneJobTimer = startPruningJob(
  env.PRUNE_INTERVAL_HOURS * 60 * 60 * 1000,
  env.PRUNE_INACTIVE_ROOMS_DAYS,
);

/**
 * P042 – Helper to wrap an async event-handler in a synchronous callback.
 * Catches any rejection from the async body and logs it, preventing unhandled
 * promise rejections from silently crashing the server.
 */
function asyncHandler<T extends unknown[]>(
  label: string,
  fn: (...args: T) => Promise<void>,
): (...args: T) => void {
  return (...args: T) => {
    fn(...args).catch((err: unknown) => {
      logger.error({ err }, `${label}: unhandled error`);
    });
  };
}

void app.prepare()
  .then(() => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      void (async () => {
        // P023 – liveness probe: always returns 200 as long as the process is alive.
        // Orchestrators use this to decide whether to restart the container; a DB
        // outage should NOT trigger a restart (the process itself is healthy).
        if (req.url === "/api/health") {
          const dbOk = await checkDbHealth();
          const payload = JSON.stringify({
            status: "ok",
            uptime: process.uptime(),
            rooms: rooms.size,
            clients: wss.clients.size,
            database: dbOk ? "ok" : "unreachable",
            // P012: include Redis status for ops visibility
            redis: env.REDIS_URL ? (redisReady ? "ok" : "connecting") : "disabled",
            // P030: snapshot cache stats
            cache: roomCache.stats(),
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(payload);
          return;
        }

        // P023 – readiness probe: 503 until the HTTP server is listening AND the
        // database is reachable.  Only then is the instance ready for traffic.
        if (req.url === "/api/ready") {
          const canAcceptTraffic = isReady && (await checkDbHealth());
          res.writeHead(canAcceptTraffic ? 200 : 503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ready: canAcceptTraffic }));
          return;
        }

        await handle(req, res);
      })().catch((err: unknown) => {
        logger.error({ err }, "http: unhandled request error");
        if (!res.headersSent) {
          res.writeHead(500);
          res.end();
        }
      });
    });
    const wss = new WebSocketServer({ noServer: true, perMessageDeflate: true });

    server.on("upgrade", (req: IncomingMessage, socket, head) => {
      void (async () => {
        // Reject immediately if the Host header is absent – without it we cannot
        // construct a valid URL, and a missing Host is itself a malformed request.
        if (!req.headers.host) {
          logger.warn("ws: rejected upgrade – missing Host header");
          socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
          socket.destroy();
          return;
        }

        // Guard against a malformed URL that would cause URL() to throw.
        let reqUrl: URL;
        try {
          reqUrl = new URL(req.url ?? "/", `http://${req.headers.host}`);
        } catch {
          logger.warn({ url: req.url }, "ws: rejected upgrade – invalid request URL");
          socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
          socket.destroy();
          return;
        }

        if (reqUrl.pathname !== "/ws") {
          socket.destroy();
          return;
        }

        // P019 – reject upgrades from disallowed origins (CSWSH prevention).
        // Browsers always set Origin; server-side tools typically omit it (allowed).
        // Normalize the incoming header via new URL().origin to match the allow-list
        // (which was also normalized) and avoid false rejections from trailing slashes.
        const rawOrigin = req.headers["origin"];
        if (rawOrigin) {
          let normalizedOrigin: string;
          try {
            normalizedOrigin = new URL(rawOrigin).origin;
          } catch {
            normalizedOrigin = rawOrigin;
          }
          if (!ALLOWED_ORIGINS.has(normalizedOrigin)) {
            logger.warn({ origin: rawOrigin }, "ws: rejected upgrade from disallowed origin");
            socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
            socket.destroy();
            return;
          }
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
      })().catch((err: unknown) => {
        logger.error({ err }, "ws: unhandled upgrade error");
        socket.destroy(err instanceof Error ? err : new Error(String(err)));
      });
    });

    wss.on("connection", asyncHandler("ws:connection", async (ws: WebSocket, reqUrl: URL) => {
      const client = ws as ClientState;
      const roomId = safeRoomId(reqUrl.searchParams.get("room"));
      const clientId = randomUUID().slice(0, 8);

      client.clientId = clientId;
      client.roomId = roomId;
      client.userId = client._userId ?? null;
      client.displayName = safeName(reqUrl.searchParams.get("name"));
      client.displayColor = safeColor(reqUrl.searchParams.get("color"));

      // P034 – Enforce room access control before adding the client to the room.
      const access = await checkRoomAccess(roomId, client.userId);
      if (!access.allowed) {
        logger.warn({ roomId, userId: client.userId, reason: access.reason }, "ws: access denied");
        sendTo(client, { type: "error", code: "ACCESS_DENIED", reason: access.reason });
        ws.close(1008, "Access denied");
        return;
      }
      client.role = access.role;

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
      schedulePushPresence(roomId);

      // Serve historical state from DB (or cache). Always send to each connecting
      // client so they get the latest committed state even when rejoining a room.
      let snapshot = roomCache.get(roomId);
      if (!snapshot) {
        snapshot = await dbLoadSnapshot(roomId);
        if (snapshot) roomCache.set(roomId, snapshot);
      }
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

      client.on("message", asyncHandler("ws:message", async (raw) => {
        const rawStr = raw.toString();
        if (rawStr.length > env.MAX_WS_PAYLOAD_BYTES) {
          logger.warn({ clientId, roomId, size: rawStr.length }, "ws: message exceeds size limit");
          sendTo(client, { type: "error", code: "PAYLOAD_TOO_LARGE" });
          client.close(1009, "Message too large");
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(rawStr);
        } catch {
          logger.warn({ clientId, roomId }, "ws: failed to parse message");
          return;
        }

        const validated = InboundWsMessageSchema.safeParse(parsed);
        if (!validated.success) {
          logger.warn({ clientId, roomId, errors: validated.error.errors }, "ws: invalid message schema");
          sendTo(client, { type: "error", code: "INVALID_PAYLOAD" });
          return;
        }
        const message = validated.data as unknown as WsMessage;

        if (message.type === "profile") {
          // Guard against non-string values from malicious clients; safeName/safeColor
          // call .trim() internally and would throw on numbers/objects.
          client.displayName = safeName(
            typeof message.name === "string" ? message.name : null,
          );
          client.displayColor = safeColor(
            typeof message.color === "string" ? message.color : null,
          );
          schedulePushPresence(roomId);
          return;
        }

        // Drop ping/pong before any further processing – heartbeat only
        if (message.type === "ping" || message.type === "pong") return;

        // P034 – Enforce write permissions: VIEWER and ANONYMOUS roles cannot
        // modify shared canvas state. Silently drop such messages and respond
        // with a structured error so the client can surface a helpful message.
        if (
          (message.type === "draw" ||
            message.type === "draw-delta" ||
            message.type === "commit") &&
          (client.role === "VIEWER" || client.role === "ANONYMOUS")
        ) {
          sendTo(client, { type: "error", code: "FORBIDDEN", detail: "Read-only access" });
          return;
        }

        // Persist commit messages to the database
        if (message.type === "commit" && message.sha && message.commit) {
          logger.info({ clientId, roomId, sha: message.sha }, "ws: commit received");
          // P043 – Track in-flight DB writes so graceful shutdown can drain them.
          beginWrite();
          try {
            await dbSaveCommit(
              roomId,
              message.sha as string,
              message.commit as CommitData,
              client.userId,
            );
          } finally {
            endWrite();
          }
          // P030: invalidate cached snapshot so next connection loads fresh state
          roomCache.invalidate(roomId);
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
      }));

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

        schedulePushPresence(roomId);
        broadcastRoom(roomId, { type: "user-left", clientId }, clientId);
      });
    }));

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

    // P043 – 0a. Notify connected clients that shutdown is imminent.
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        sendTo(ws as ClientState, {
          type: "shutdown-warning",
          remainingMs: SHUTDOWN_DRAIN_MS,
        } as unknown as WsMessage);
      }
    });

    // P043 – 0b. Wait for in-flight DB writes to complete (or timeout).
    const drainStart = Date.now();
    await waitForDrain(SHUTDOWN_DRAIN_MS);
    const drained = inFlightWrites === 0;
    logger.info(
      { drained, elapsedMs: Date.now() - drainStart, remaining: inFlightWrites },
      "shutdown: drain complete",
    );

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
    // P032 – stop pruning job
    if (pruneJobTimer) clearInterval(pruneJobTimer);
    // P044 – cancel any pending presence-debounce timers so they don't fire
    // after the server has begun shutting down.
    presenceDebounceTimers.forEach((timer) => clearTimeout(timer));
    presenceDebounceTimers.clear();

    // 4. P012: Disconnect from Redis before the DB to avoid losing in-flight publishes
    if (redisPub || redisSub) {
      // P035: Remove this instance's presence entries from all presence hashes
      // so that clients on other instances don't see stale data after shutdown.
      if (redisPub && redisReady && rooms.size > 0) {
        try {
          const pipeline = redisPub.pipeline();
          for (const roomId of rooms.keys()) {
            pipeline.hdel(`${REDIS_PRESENCE_PREFIX}${roomId}`, SERVER_INSTANCE_ID);
          }
          await pipeline.exec();
        } catch (err) {
          logger.warn({ err }, "redis: failed to clean up presence hashes on shutdown");
        }
      }
      await Promise.all([
        redisPub?.quit().catch(() => {}),
        redisSub?.quit().catch(() => {}),
      ]);
      redisReady = false;
      logger.info("redis: connections closed");
    }

    // 5. Disconnect from the database
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
})
.catch((err: unknown) => {
  console.error("server: startup failed", err);
  process.exit(1);
});
