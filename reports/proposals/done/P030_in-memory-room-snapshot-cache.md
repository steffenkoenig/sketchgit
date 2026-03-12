# P030 – In-Memory Room State Cache on the WebSocket Server

## Title
Add an LRU In-Memory Cache for Room Snapshots to Avoid Repeated Database Loads on Reconnect

## Brief Summary
Every time the first WebSocket client connects to a previously-empty room, the server executes a full database round-trip to load up to 100 commits, all branches, and the room state. For rooms where clients disconnect and reconnect frequently (mobile users, page refreshes, brief network interruptions), this pattern fires a database query on every reconnect cycle even when the underlying state has not changed. A bounded, time-aware in-memory cache keyed by room ID would serve the majority of reconnects from memory and reduce database load by an order of magnitude for active rooms.

## Current Situation
When the first client joins a room, `server.ts` executes:
```typescript
if (room.size === 1) {
  // Only client in the room – load from DB
  const snapshot = await dbLoadSnapshot(roomId);
  if (snapshot) {
    sendTo(client, { type: 'fullsync', ...snapshot });
  }
}
```
`dbLoadSnapshot` calls `prisma.commit.findMany(...)` unconditionally on every cold-join. There is no caching layer between the WebSocket connection handler and the database.

The in-memory `rooms` Map already caches the *connected-client list* per room, but it is completely separate from the *data snapshot* (commits, branches, HEAD). When all clients leave and one returns, the `rooms` map entry is cleared after the room cleanup timer fires (default 5 s), so the next join always hits the database.

## Problem with Current Situation
1. **Redundant DB queries on reconnect**: A user refreshing the browser tab triggers a disconnect → cleanup timer → reconnect cycle. Each such cycle executes up to three parallel database queries.
2. **No benefit from connection locality**: In a single-instance deployment with 50 active rooms, 50 rapid reconnects across those rooms generate 50 concurrent database round-trips even if no commit was made in between.
3. **Cold-start penalty compounds with room growth**: As commit histories grow, the payload returned by `dbLoadSnapshot` grows (up to 100 commits × 100 KB each = 10 MB per room load). Without caching this cost is paid on every cold-join.
4. **Missed optimisation opportunity**: The data is inherently stable between commits. Once a room's snapshot is loaded, it is valid until a new commit arrives. This is a textbook case for write-through caching.

## Goal to Achieve
1. Serve room snapshot requests from an in-memory LRU cache when the cached entry is still valid (i.e. no commit has been made since the last cache fill).
2. Invalidate the cache entry for a room whenever a new commit is persisted (write-through invalidation).
3. Cap total memory usage by evicting the least-recently-used entries when the cache exceeds a configurable size (default: 200 rooms).
4. Preserve correctness: cache misses always fall through to the database; the cache is never the authoritative state store.
5. Add metrics to the `/api/health` response so operators can observe hit rate.

## What Needs to Be Done

### 1. Implement a typed LRU cache module
Create `lib/cache/roomSnapshotCache.ts`. The **recommended implementation** is to use the well-tested [`lru-cache`](https://www.npmjs.com/package/lru-cache) npm package (already in the Node.js ecosystem, zero DOM dependencies, full TypeScript support) rather than writing a custom doubly-linked-list implementation. A custom implementation is a viable alternative but adds a non-trivial surface area for bugs (pointer management, edge cases at size 1, etc.).

```typescript
import { LRUCache } from 'lru-cache';
import type { RoomSnapshot } from '../db/roomRepository';

export interface RoomSnapshotCacheStats {
  size: number;
  hits: number;
  misses: number;
}

export interface RoomSnapshotCache {
  get(roomId: string): RoomSnapshot | undefined;
  set(roomId: string, snapshot: RoomSnapshot): void;
  invalidate(roomId: string): void;
  stats(): RoomSnapshotCacheStats;
}

export function createRoomSnapshotCache(maxSize = 200): RoomSnapshotCache {
  const cache = new LRUCache<string, RoomSnapshot>({ max: maxSize });
  let hits = 0;
  let misses = 0;
  return {
    get(roomId) {
      const v = cache.get(roomId);
      if (v !== undefined) { hits++; } else { misses++; }
      return v;
    },
    set(roomId, snapshot) { cache.set(roomId, snapshot); },
    invalidate(roomId) { cache.delete(roomId); },
    stats() { return { size: cache.size, hits, misses }; },
  };
}
```

Key design decisions:
- `maxSize` is a room count (not a byte limit); a byte-aware `sizeCalculation` option from `lru-cache` can be added as a future enhancement.
- Cache entries have no TTL by default; they are only invalidated on new commits. An optional `ttl` (in ms) passed to `LRUCache` can be added for correctness in multi-instance deployments where Redis Pub/Sub is unavailable.
- The cache is created once at server startup and shared across all connection handlers.

### 2. Integrate cache into the connection handler in `server.ts`
Replace the unconditional `dbLoadSnapshot` call:
```typescript
// Before:
const snapshot = await dbLoadSnapshot(roomId);

// After:
let snapshot = roomCache.get(roomId);
if (!snapshot) {
  snapshot = await dbLoadSnapshot(roomId);
  if (snapshot) roomCache.set(roomId, snapshot);
}
```

### 3. Invalidate cache on new commit
In the `commit` message handler, after `dbSaveCommit` succeeds, call `roomCache.invalidate(roomId)`. This ensures subsequent cold-joins load fresh state.
```typescript
await dbSaveCommit(roomId, sha, commitData, client.userId);
roomCache.invalidate(roomId);
```

### 4. Expose cache metrics in `/api/health`
```json
{
  "cache": { "size": 42, "hits": 1840, "misses": 61 }
}
```

### 5. Write unit tests
`lib/cache/roomSnapshotCache.test.ts`:
- Stores and retrieves a snapshot.
- Evicts LRU entry when `maxSize` is exceeded.
- Returns `undefined` after `invalidate`.
- Stats track hits/misses correctly.

## Components Affected
| Component | Change |
|-----------|--------|
| `server.ts` | Use cache in connection handler; invalidate after commit |
| `lib/cache/roomSnapshotCache.ts` | **New file** – LRU cache implementation |
| `lib/cache/roomSnapshotCache.test.ts` | **New file** – unit tests |
| `app/api/health` (inline in `server.ts`) | Add `cache` metrics to health response |

## Data & Database Model
No schema changes. The cache operates entirely in application memory and is not persisted.

## Testing Requirements
- LRU eviction: fill cache to `maxSize + 1`, verify oldest entry is evicted.
- Write-through invalidation: set entry → invalidate → `get` returns `undefined`.
- Hit/miss counters: make two gets for same key → 1 miss + 1 hit.
- Integration: mock `dbLoadSnapshot` to count calls; verify second cold-join for same room does not call it again.

## Linting and Type Requirements
- The cache module is a plain TypeScript class with no external DOM or Node APIs.
- `RoomSnapshot` type imported from `lib/db/roomRepository.ts` (no circular dependency).
- `maxSize` and optional `ttlMs` are validated at construction time with runtime guards.

## Dependency Map
- Depends on: P011 ✅ (bounded query keeps cache entries safe to hold in memory), P023 ✅ (health endpoint exists to extend)
- Benefits from: P029 (consistent pagination makes snapshot size predictable)
- Orthogonal to: P012 ✅ (Redis handles cross-instance *delivery*, the cache handles per-instance *load reduction*; both can be active simultaneously)
