import { describe, it, expect } from 'vitest';
import { createRoomSnapshotCache } from './roomSnapshotCache';
import type { RoomSnapshot } from '../db/roomRepository';

const makeSnapshot = (id: string): RoomSnapshot => ({
  commits: { [id]: { sha: id, parent: null, parents: [], message: 'test', ts: 0, canvas: '{}', branch: 'main', isMerge: false } },
  branches: { main: id },
  HEAD: 'main',
  detached: null,
});

describe('createRoomSnapshotCache', () => {
  it('returns undefined for a cache miss and increments misses', () => {
    const cache = createRoomSnapshotCache();
    expect(cache.get('room-1')).toBeUndefined();
    expect(cache.stats().misses).toBe(1);
    expect(cache.stats().hits).toBe(0);
  });

  it('returns cached snapshot on hit and increments hits', () => {
    const cache = createRoomSnapshotCache();
    const snap = makeSnapshot('sha1');
    cache.set('room-1', snap);
    expect(cache.get('room-1')).toBe(snap);
    expect(cache.stats().hits).toBe(1);
    expect(cache.stats().misses).toBe(0);
  });

  it('invalidate removes entry from cache', () => {
    const cache = createRoomSnapshotCache();
    cache.set('room-1', makeSnapshot('sha1'));
    cache.invalidate('room-1');
    expect(cache.get('room-1')).toBeUndefined();
    expect(cache.stats().size).toBe(0);
  });

  it('stats reflects correct size', () => {
    const cache = createRoomSnapshotCache();
    cache.set('r1', makeSnapshot('a'));
    cache.set('r2', makeSnapshot('b'));
    expect(cache.stats().size).toBe(2);
  });

  it('evicts least-recently-used entry when maxSize is exceeded', () => {
    const cache = createRoomSnapshotCache(2);
    cache.set('r1', makeSnapshot('a'));
    cache.set('r2', makeSnapshot('b'));
    cache.set('r3', makeSnapshot('c')); // should evict r1 (LRU)
    expect(cache.stats().size).toBe(2);
    expect(cache.get('r1')).toBeUndefined();
    expect(cache.get('r2')).toBeDefined();
    expect(cache.get('r3')).toBeDefined();
  });

  it('accumulates hits and misses across multiple calls', () => {
    const cache = createRoomSnapshotCache();
    cache.set('r1', makeSnapshot('a'));
    cache.get('r1'); // hit
    cache.get('r1'); // hit
    cache.get('r2'); // miss
    const s = cache.stats();
    expect(s.hits).toBe(2);
    expect(s.misses).toBe(1);
  });
});
