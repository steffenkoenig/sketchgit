# P043 – Graceful Shutdown Drain Window for In-Flight WebSocket Writes

## Title
Add a Drain Window Before Closing WebSocket Connections During Graceful Shutdown to Prevent Commit Data Loss

## Brief Summary
The current graceful shutdown handler (P023) sends close frames to all WebSocket clients immediately on SIGTERM, then closes the `http.Server` and disconnects from the database. If a `commit` message is mid-flight through the database transaction (`dbSaveCommit`) at the moment SIGTERM arrives, the `prisma.$transaction()` call may be interrupted, leaving the commit partially written or silently dropped. Adding a short drain window — waiting for in-flight database writes to complete before closing WebSocket connections — eliminates this race without significantly increasing the shutdown time.

## Current Situation
```typescript
const shutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  isReady = false;

  // 1. Immediately send close frames to ALL connected WebSocket clients
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.close(1001, "Server is shutting down");  // ← no drain period
    }
  });

  // 2. Stop accepting new connections
  await Promise.all([
    new Promise<void>((resolve) => wss.close(() => resolve())),
    new Promise<void>((resolve) => server.close(() => resolve())),
  ]);

  // 3. Clear timers
  clearInterval(pingInterval);

  // 4. Disconnect from Redis
  // …

  // 5. Disconnect from DB
  await prisma.$disconnect();
};
```

The critical race: the `message` event handler processes a `commit` message asynchronously:
```typescript
ws.on("message", async (data) => {
  // …
  await dbSaveCommit(roomId, sha, commitData, client.userId); // ← async DB write
});
```

There is no tracking of in-flight `dbSaveCommit` calls. Step 1 of shutdown closes the client before the DB write finishes. Step 5 calls `prisma.$disconnect()` which immediately terminates the connection pool, aborting any running transaction.

## Problem with Current Situation
1. **Commit data loss**: A user who commits just before a rolling deployment (or a pod eviction in Kubernetes) may lose that commit silently. The client receives `1001 Going Away`, retries (if reconnection logic fires), and the commit appears to be missing.
2. **No feedback to the user**: The client-side WebSocket client (P004) will attempt reconnection, but the commit is already lost on the server side. There is no mechanism to re-send the commit on reconnect.
3. **Database connection pool interrupted**: `prisma.$disconnect()` without waiting for active queries is equivalent to `pg.Pool.end()` — Prisma will attempt to drain the pool but running queries may be aborted mid-transaction.
4. **K8s `terminationGracePeriodSeconds` not fully utilised**: Kubernetes provides 30 seconds by default for graceful termination. The server currently uses less than 1 second of this window (close + shutdown completes near-instantly), wasting an opportunity to drain writes safely.

## Goal to Achieve
1. Track the count of in-flight asynchronous database writes per message handler.
2. In the shutdown handler, after setting `isReady = false` and `isShuttingDown = true`, wait up to a configurable drain window (default: 5 seconds) for in-flight writes to complete before sending close frames.
3. Notify connected clients with a `{ type: "shutdown-warning", remainingMs: 5000 }` message so they can queue or retry locally during the drain.
4. After the drain window (or when in-flight count reaches zero), proceed with the existing close sequence.
5. Log the drain result (how many writes completed vs. were interrupted).

## What Needs to Be Done

### 1. Add an in-flight write tracker to `server.ts`
```typescript
/** Count of database write operations currently in progress. */
let inFlightWrites = 0;

/** Resolvers waiting for in-flight writes to reach zero (used during shutdown). */
const drainWaiters: Array<() => void> = [];

function beginWrite(): void {
  inFlightWrites++;
}

function endWrite(): void {
  inFlightWrites--;
  if (inFlightWrites === 0) {
    drainWaiters.forEach((resolve) => resolve());
    drainWaiters.length = 0;
  }
}

/** Resolve when in-flight writes reach zero, or after `timeoutMs`. */
function waitForDrain(timeoutMs: number): Promise<void> {
  if (inFlightWrites === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      // Timeout: remove our waiter and resolve anyway
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
```

### 2. Wrap `dbSaveCommit` calls with `beginWrite`/`endWrite`

The wrapping must be applied to each individual async DB operation within the message
handler rather than around the entire switch, because different message types have
different async operations and only DB writes need to be tracked.

```typescript
// In the 'commit' message handler (the entire relevant section of ws.on('message')):
client.on("message", async (raw) => {
  let message: WsMessage;
  try {
    message = JSON.parse(raw.toString()) as WsMessage;
  } catch {
    return;
  }

  // Drop heartbeat frames
  if (message.type === "ping" || message.type === "pong") return;

  // Persist commit messages – wrapped so shutdown drain waits for completion
  if (message.type === "commit" && message.sha && message.commit) {
    beginWrite();          // ← increment drain counter before async work
    try {
      await dbSaveCommit(
        roomId,
        message.sha as string,
        message.commit as CommitData,
        client.userId,
      );
    } finally {
      endWrite();          // ← always decrement, even if dbSaveCommit throws
    }
  }

  // Relay to peers (synchronous – no beginWrite needed)
  const relay: WsMessage = { ...message, senderId: client.clientId, roomId };
  broadcastRoom(roomId, relay, client.clientId);
});
```

The `try/finally` guarantees `endWrite()` is called even when `dbSaveCommit` throws,
preventing the drain counter from leaking and causing the shutdown to hang indefinitely.

### 3. Update the shutdown handler to drain before closing
```typescript
const DRAIN_TIMEOUT_MS = 5_000; // configurable via env: SHUTDOWN_DRAIN_MS

const shutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  isReady = false;
  logger.info({ signal }, "Graceful shutdown initiated");

  // 0. Notify clients that shutdown is imminent (gives them time to save locally)
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      sendTo(client as ClientState, {
        type: 'shutdown-warning',
        remainingMs: DRAIN_TIMEOUT_MS,
      } as unknown as WsMessage);
    }
  });

  // 0b. Wait for in-flight DB writes to complete
  const drainStart = Date.now();
  await waitForDrain(DRAIN_TIMEOUT_MS);
  const drained = inFlightWrites === 0;
  logger.info(
    { drained, elapsedMs: Date.now() - drainStart, remaining: inFlightWrites },
    "shutdown: drain complete",
  );

  // 1. Now close WebSocket connections (all writes are done or timed out)
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.close(1001, "Server is shutting down");
    }
  });

  // … rest of existing shutdown unchanged …
};
```

### 4. Add `SHUTDOWN_DRAIN_MS` environment variable
In `lib/env.ts`:
```typescript
SHUTDOWN_DRAIN_MS: z.coerce.number().int().min(0).max(30_000).default(5_000),
```

### 5. Handle `shutdown-warning` on the client side (`wsClient.ts`)
When the client receives `shutdown-warning`, it can:
- Stop sending new messages (optional — the server is still accepting during drain).
- Surface a brief toast notification ("Server restarting, reconnecting in a moment…").
This is a progressive enhancement; the reconnection logic already handles the `1001` close code.

### 6. Tests
- Unit: `beginWrite` increments counter; `endWrite` decrements; reaching zero resolves `waitForDrain`.
- Unit: `waitForDrain` resolves after timeout even if counter > 0.
- Unit: multiple simultaneous `beginWrite`/`endWrite` calls are handled correctly.
- Integration: mock a slow `dbSaveCommit` (200ms delay); trigger shutdown; verify shutdown waits for the write before proceeding.

## Components Affected
| Component | Change |
|-----------|--------|
| `server.ts` | Add `inFlightWrites` tracker, `beginWrite`/`endWrite`/`waitForDrain` helpers; update shutdown handler |
| `lib/env.ts` | Add `SHUTDOWN_DRAIN_MS` env var (optional, default 5000) |
| `lib/sketchgit/realtime/wsClient.ts` | Handle `shutdown-warning` message type (toast + no new sends) |
| `lib/sketchgit/types.ts` | Add `shutdown-warning` to `WsMessageType` union |
| `.env.example` | Document `SHUTDOWN_DRAIN_MS` |

## Data & Database Model
No schema changes. The drain window is a runtime behaviour change only.

## Testing Requirements
- Counter is thread-safe (JavaScript is single-threaded; no mutex needed, but verify sequential increment/decrement is correct for concurrent async handlers).
- `waitForDrain(0)` resolves immediately when `inFlightWrites === 0`.
- `waitForDrain(100)` resolves after 100ms even if a write is stuck.
- Shutdown log correctly reports `drained: false` when timeout is exceeded.

## Linting and Type Requirements
- `beginWrite`/`endWrite` are module-level functions, not methods, to keep the caller code simple.
- `SHUTDOWN_DRAIN_MS` validated in `validateEnv()` so misconfiguration fails fast.
- `shutdown-warning` added to the `WsMessageType` literal union to preserve discriminant exhaustiveness checks in client code.

## Dependency Map
- Depends on: P023 ✅ (graceful shutdown handler exists), P027 ✅ (env validation)
- Complements: P031 (WS message validation ensures commit messages are well-formed before `beginWrite`)
- Reduces risk from: any rolling deployment, Kubernetes pod eviction, or scale-down event
