import { LRUCache } from "lru-cache";
import type { RoomSnapshot } from "../db/roomRepository";
import { cacheHitCounter, cacheMissCounter } from "../server/metrics";

export interface RoomSnapshotCacheStats {
  size: number;
  hits: number;
  misses: number;
}

export interface RoomSnapshotCacheInterface {
  get(roomId: string): RoomSnapshot | undefined;
  set(roomId: string, snapshot: RoomSnapshot): void;
  invalidate(roomId: string): void;
  stats(): RoomSnapshotCacheStats;
}

export function createRoomSnapshotCache(maxSize = 200): RoomSnapshotCacheInterface {
  const cache = new LRUCache<string, RoomSnapshot>({ max: maxSize });
  let hits = 0;
  let misses = 0;
  return {
    get(roomId) {
      const v = cache.get(roomId);
      if (v !== undefined) { hits++; cacheHitCounter.add(1); } else { misses++; cacheMissCounter.add(1); }
      return v;
    },
    set(roomId, snapshot) { cache.set(roomId, snapshot); },
    invalidate(roomId) { cache.delete(roomId); },
    stats() { return { size: cache.size, hits, misses }; },
  };
}
