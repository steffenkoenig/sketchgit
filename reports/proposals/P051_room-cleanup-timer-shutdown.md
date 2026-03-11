# P051 – Clear `roomCleanupTimers` in the Graceful Shutdown Handler

## Title
Cancel Pending Room-cleanup Timers During Graceful Shutdown to Prevent Post-shutdown Errors

## Brief Summary
The graceful shutdown handler (P023) carefully clears the server-side ping interval (`clearInterval(pingInterval)`) before closing Redis and Prisma connections. However, it does not clear the `roomCleanupTimers` Map, which holds one `setTimeout` per recently-emptied room. These timers are set to fire 60 seconds after the last client disconnects and attempt to delete the room's in-memory entry from the `rooms` Map. If a SIGTERM arrives while any of these timers are pending, the timer callbacks will fire after `prisma.$disconnect()` has been called — potentially after the Node.js process has already called `process.exit(0)`. In practice the race is narrow (most timers fire before shutdown completes), but the window is real and the fix is a two-line change. As a secondary benefit, clearing these timers makes the shutdown sequence deterministic: the process exits as soon as the explicit shutdown steps finish, rather than waiting for lingering timers to be garbage-collected by the event loop.

## Current Situation
In `server.ts`, the `roomCleanupTimers` Map and its usage:
```typescript
// Line 139:
const roomCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

// In wss.on('connection') – when a client re-joins, cancel the cleanup timer:
if (roomCleanupTimers.has(roomId)) {
  clearTimeout(roomCleanupTimers.get(roomId)!);
  roomCleanupTimers.delete(roomId);
}

// In client.on('close') – when a room becomes empty, schedule cleanup:
const timer = setTimeout(() => {
  if (rooms.get(roomId)?.size === 0) {
    rooms.delete(roomId);  // ← accesses rooms Map, which may be partially cleaned up
  }
  roomCleanupTimers.delete(roomId);
}, ROOM_CLEANUP_DELAY_MS);  // 60,000 ms
roomCleanupTimers.set(roomId, timer);
```

The graceful shutdown handler clears `pingInterval` but NOT `roomCleanupTimers`:
```typescript
const shutdown = async (signal: string) => {
  // …
  // 3. Clear timers
  clearInterval(pingInterval);  // ← pingInterval is cleared
  // roomCleanupTimers NOT cleared ← gap
  // …
  await prisma.$disconnect();
  process.exit(0);
};
```

## Problem with Current Situation
1. **Post-shutdown timer callbacks**: If a room became empty 30 seconds before SIGTERM, its cleanup timer fires 30 seconds into the shutdown sequence — after `process.exit(0)` in the best case, or during Redis/Prisma teardown in the worst case. The callback's `rooms.delete(roomId)` accesses the `rooms` Map, which is being iterated by the shutdown WebSocket close loop.
2. **Non-deterministic exit timing**: Even when `process.exit(0)` is not reached (e.g., the shutdown takes longer than the cleanup delay), the open timers keep the Node.js event loop alive. Without `unref()` on the timers (which they currently lack), they prevent the process from exiting naturally if `process.exit()` is not explicitly called.
3. **Misleading log output**: `logger.info("Graceful shutdown complete")` fires before the cleanup timer callbacks run. If a callback logs anything (e.g., via `logger.info("room cleaned up")`), the output appears after the "shutdown complete" message, which is confusing.
4. **Inconsistency**: `pingInterval` is explicitly cleared. The absence of equivalent cleanup for `roomCleanupTimers` is not intentional — it is an oversight. The same cleanup pattern should apply to all timers.
5. **P043 interaction**: When P043 (shutdown drain window) is implemented, the drain window sends `shutdown-warning` messages and waits for in-flight writes to complete. If room cleanup timers fire during this window, they delete in-memory room state while the drain is waiting for WebSocket messages. Clients in those rooms cannot complete their in-flight writes because the room entry has been deleted.

## Goal to Achieve
1. In the shutdown handler, iterate `roomCleanupTimers` and call `clearTimeout` on every pending timer before the WebSocket close step.
2. Clear the `roomCleanupTimers` Map itself to release references.
3. Optionally add `.unref()` to all room cleanup timer handles so that — if graceful shutdown somehow fails to run (e.g. unhandled exception before SIGTERM registration) — the timers do not prevent the process from exiting naturally.
4. Add a log line: `"shutdown: cleared N room cleanup timers"` for operational visibility.

## What Needs to Be Done

### 1. Update the shutdown handler in `server.ts`
```typescript
const shutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  isReady = false;
  logger.info({ signal }, "Graceful shutdown initiated");

  // 1. Send close frames to all connected WebSocket clients
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.close(1001, "Server is shutting down");
    }
  });

  // 2. Stop accepting new connections
  await Promise.all([
    new Promise<void>((resolve) => wss.close(() => resolve())),
    new Promise<void>((resolve) => server.close(() => resolve())),
  ]);

  // 3. Clear ALL timers (ping interval + room cleanup timers)
  clearInterval(pingInterval);

  // P051 – Cancel pending room-cleanup timers to prevent post-shutdown callbacks.
  const timerCount = roomCleanupTimers.size;
  roomCleanupTimers.forEach((timer) => clearTimeout(timer));
  roomCleanupTimers.clear();
  if (timerCount > 0) {
    logger.info({ timerCount }, "shutdown: cleared pending room cleanup timers");
  }

  // 4. Disconnect from Redis
  // … (existing)

  // 5. Disconnect from DB
  await prisma.$disconnect();

  logger.info("Graceful shutdown complete");
  process.exit(0);
};
```

### 2. Add `.unref()` to room cleanup timer handles (defence-in-depth)
```typescript
// In client.on('close') handler:
const timer = setTimeout(() => {
  if (rooms.get(roomId)?.size === 0) {
    rooms.delete(roomId);
  }
  roomCleanupTimers.delete(roomId);
}, ROOM_CLEANUP_DELAY_MS);
timer.unref(); // ← NEW: don't prevent process exit if no other work is pending
roomCleanupTimers.set(roomId, timer);
```

`timer.unref()` tells Node.js: "if I am the only thing keeping the event loop alive, exit anyway." This is a best-practice for cleanup timers that have no I/O dependency.

### 3. Tests
- Unit: Trigger shutdown with 3 rooms in `roomCleanupTimers` → all 3 timers are cleared, none fire after shutdown.
- Unit: `timer.unref()` — simulate process-exit scenario; verify cleanup timer does not delay exit.
- Unit: Room cleanup timer with `isShuttingDown = true` fires after the shutdown guard — the `rooms.delete()` call is safe because `rooms` still exists (Map is in-process).
- Unit (regression): Normal operation — room becomes empty → timer fires after 60s → room deleted from Map. Shutdown guard not triggered.

## Components Affected
| Component | Change |
|-----------|--------|
| `server.ts` | Add `roomCleanupTimers.forEach(clearTimeout); roomCleanupTimers.clear();` in shutdown handler; add `.unref()` to timer creation |

This is a **two-line fix** plus an optional one-line `.unref()` enhancement — total code change is under 10 lines.

## Data & Database Model
No changes. This is a timer lifecycle fix only.

## Testing Requirements
- Shutdown with N pending timers: all N are cleared; none fire after `prisma.$disconnect()`.
- Shutdown log includes `"cleared N room cleanup timers"` when `timerCount > 0`.
- Normal operation (no shutdown): room cleanup timer fires correctly after 60s.
- `ROOM_CLEANUP_DELAY_MS` reduced to 0 in test setup for fast timeout verification.

## Linting and Type Requirements
- `roomCleanupTimers.forEach(clearTimeout)` — `clearTimeout` accepts `ReturnType<typeof setTimeout>` which matches the Map's value type. No cast needed.
- `timer.unref()` — `ReturnType<typeof setTimeout>` in Node.js has an `.unref()` method; the TypeScript type `NodeJS.Timeout` exposes it. Ensure `@types/node` is imported correctly in `server.ts`.
- This change is purely additive to the existing shutdown sequence; no existing lines are removed.

## Estimated Effort
**Trivial** (15 minutes):
- 2 lines: `roomCleanupTimers.forEach(clearTimeout); roomCleanupTimers.clear()`
- 1 line: `timer.unref()`
- 1 line: log message
- 15–30 minutes: add tests

## Dependency Map
- Depends on: P023 ✅ (graceful shutdown handler exists)
- Complements: P043 (shutdown drain window — timers cleared before drain starts)
- Fully independent: can be merged in isolation as a one-commit bugfix PR
