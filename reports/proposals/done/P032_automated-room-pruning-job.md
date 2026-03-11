# P032 – Automated Inactive Room Pruning via a Scheduled Job

## Title
Invoke `pruneInactiveRooms` on a Recurring Schedule to Prevent Unbounded Database Growth

## Brief Summary
`lib/db/roomRepository.ts` already contains a `pruneInactiveRooms(days)` function that deletes rooms which have had no activity for the specified number of days. However, this function is never called anywhere in the codebase. Rooms created by anonymous users who never return, test rooms from development sessions, and abandoned collaboration sessions accumulate indefinitely, growing the database with orphaned data that is never reclaimed. Adding a lightweight scheduled invocation at server startup closes this gap with minimal new code.

## Current Situation
The cleanup function exists and is correct:
```typescript
// lib/db/roomRepository.ts
export async function pruneInactiveRooms(days = 30): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.room.deleteMany({
    where: { updatedAt: { lt: cutoff } },
  });
  return result.count;
}
```
It cascades correctly because the Prisma schema defines `onDelete: Cascade` on every child model (`Commit`, `Branch`, `RoomMembership`, `RoomState`). A single call removes the room and all its associated data atomically.

The function is exported but has **zero call sites** in the application code. It exists only as a dead export.

There is no background job, cron schedule, external trigger, or admin API endpoint that invokes it.

## Problem with Current Situation
1. **Unbounded database growth**: Every anonymous user who opens the app creates a new room. With the default public URL distribution and no cleanup, the `Room`, `Commit`, and related tables grow without bound.
2. **Storage cost**: A moderately active app with 100 new rooms per day, each with 10 commits averaging 50 KB of canvas JSON, accumulates ~50 MB of raw canvas data per day. After one year without cleanup: ~18 GB.
3. **Query performance degradation**: The `RoomMembership`, `Branch`, and `Commit` indices cover active data efficiently. As orphaned rows pile up, index scans become slower and background `VACUUM` jobs take longer.
4. **Dead code**: `pruneInactiveRooms` is exported but never called, which violates the principle that exported functions should be called. Static analysis tools may flag it as dead code, and developers may be confused about whether it is tested or relied upon.

## Goal to Achieve
1. Invoke `pruneInactiveRooms` automatically on a recurring schedule (default: once per day).
2. Log the number of rooms pruned and any errors using the existing pino logger.
3. Make the retention period and schedule interval configurable via environment variables.
4. Ensure the pruning job does not interfere with active WebSocket connections (it only deletes rooms with no recent activity, which by definition have no active clients).
5. Add tests for the scheduling logic (mock the timer and the repository function).

## What Needs to Be Done

### 1. Add environment variables for pruning configuration
In `lib/env.ts`, add two optional variables:
```typescript
PRUNE_INACTIVE_ROOMS_DAYS: z.coerce.number().int().min(1).default(30),
PRUNE_INTERVAL_HOURS:      z.coerce.number().int().min(1).default(24),
```
This allows operators to adjust retention without redeploying.

### 2. Implement `startPruningJob` in `server.ts`
```typescript
function startPruningJob(
  intervalMs: number,
  retentionDays: number,
): NodeJS.Timeout {
  let running = false; // prevent overlapping executions if the DB is slow
  return setInterval(async () => {
    if (running) {
      logger.warn("pruning: previous job still running, skipping this interval");
      return;
    }
    running = true;
    try {
      const { pruneInactiveRooms } = await import('./lib/db/roomRepository.js');
      const count = await pruneInactiveRooms(retentionDays);
      if (count > 0) {
        logger.info({ count, retentionDays }, "pruning: removed inactive rooms");
      }
    } catch (err) {
      logger.error({ err }, "pruning: failed to prune inactive rooms");
    } finally {
      running = false;
    }
  }, intervalMs);
}
```
The `running` flag prevents concurrent invocations — for example, if database slowdowns cause a pruning job to take longer than the configured interval. While unlikely at 24-hour intervals under normal conditions, it is important to guard against this during database degradation or when the interval is intentionally set short for testing.

The interval reference should be stored so it can be cleared during graceful shutdown (P023 pattern):
```typescript
let pruneJobTimer: NodeJS.Timeout | null = null;
// …
pruneJobTimer = startPruningJob(
  env.PRUNE_INTERVAL_HOURS * 3_600_000,
  env.PRUNE_INACTIVE_ROOMS_DAYS,
);
// …
// In shutdown handler:
if (pruneJobTimer) clearInterval(pruneJobTimer);
```

### 3. Protect active rooms
The `pruneInactiveRooms` condition (`updatedAt < cutoff`) is safe because:
- `Room.updatedAt` is updated by Prisma's `@updatedAt` directive on any model update, including child commits.
- An active room (one with a connected WebSocket client) will have had at least one commit or `ensureRoom` upsert recently, keeping `updatedAt` fresh.
- Even a room with connected clients but no commits is guarded: `dbEnsureRoom` (called on every connection) performs an `upsert` which sets `updatedAt`.

As an additional safeguard, skip rooms with at least one currently-connected client by filtering out room IDs present in the in-memory `rooms` Map:
```typescript
const activeRoomIds = [...rooms.keys()];
const count = await pruneInactiveRooms(retentionDays, activeRoomIds);
```
Update `pruneInactiveRooms` signature accordingly:
```typescript
export async function pruneInactiveRooms(
  days = 30,
  excludeRoomIds: string[] = [],
): Promise<number>
```

### 4. Add a manual trigger endpoint (optional but recommended)
```
POST /api/admin/prune-rooms
Authorization: Bearer <ADMIN_TOKEN>
```
Allows operations teams to trigger pruning on demand without restarting the server. Guarded by a new `ADMIN_TOKEN` environment variable.

### 5. Tests
`lib/db/roomRepository.test.ts`:
- `pruneInactiveRooms` with `excludeRoomIds` – rooms in the exclusion list are preserved even if past the retention cutoff.

`server.test.ts` or a new `lib/jobs/pruneJob.test.ts`:
- `startPruningJob`: mock `setInterval`; verify the callback calls `pruneInactiveRooms` with the correct retention period.
- Error in `pruneInactiveRooms` is caught and logged; the job continues on the next interval.

## Components Affected
| Component | Change |
|-----------|--------|
| `lib/db/roomRepository.ts` | Add `excludeRoomIds` parameter to `pruneInactiveRooms` |
| `lib/env.ts` | Add `PRUNE_INACTIVE_ROOMS_DAYS` and `PRUNE_INTERVAL_HOURS` env vars |
| `server.ts` | Add `startPruningJob`; clear timer in shutdown handler |
| `.env.example` | Document new env vars |
| `lib/db/roomRepository.test.ts` | New tests for `excludeRoomIds` behaviour |
| `lib/jobs/pruneJob.test.ts` | **New file** – unit tests for the scheduling logic |

## Data & Database Model
No schema changes. The existing cascade delete rules handle all child record removal. The `Room.updatedAt` field (already present) is the signal used by the pruning filter.

## Testing Requirements
- Unit: pruning with `days=0` deletes all non-excluded rooms.
- Unit: rooms with `updatedAt` within the retention window are preserved.
- Unit: rooms in `excludeRoomIds` are never deleted regardless of age.
- Unit: timer is cleared on graceful shutdown.

## Linting and Type Requirements
- `pruneInactiveRooms` must have an explicit return type (`Promise<number>`).
- The `setInterval` return value must be typed as `NodeJS.Timeout | null` to satisfy TypeScript strict null checks.

## Dependency Map
- Depends on: P003 ✅ (Prisma), P023 ✅ (graceful shutdown exists to extend), P027 ✅ (env validation)
- Complements: P029 (paginated load), P030 (cache TTL can be shortened once pruning keeps the table lean)
