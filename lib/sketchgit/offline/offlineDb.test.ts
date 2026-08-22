/**
 * Tests for offlineDb.ts (P092) — uses fake-indexeddb, a spec-compliant
 * in-memory IndexedDB implementation, so these exercise the real IndexedDB
 * transaction/cursor/index API surface rather than a hand-rolled mock.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { enqueueAction, getQueuedActions, removeAction, clearAllActions, type PendingAction } from './offlineDb';

function makeAction(overrides: Partial<PendingAction> = {}): PendingAction {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    roomId: overrides.roomId ?? 'room-1',
    path: overrides.path ?? 'draw',
    body: overrides.body ?? { type: 'draw', canvas: '{}' },
    ts: overrides.ts ?? Date.now(),
  };
}

describe('offlineDb', () => {
  beforeEach(async () => {
    // fake-indexeddb persists across tests within the same process; clear
    // between tests so each starts from an empty queue.
    await clearAllActions();
  });

  describe('enqueueAction / getQueuedActions', () => {
    it('returns an empty array when nothing is queued', async () => {
      expect(await getQueuedActions('room-1')).toEqual([]);
    });

    it('persists and retrieves a queued action', async () => {
      const action = makeAction({ id: 'a1' });
      await enqueueAction(action);
      const queued = await getQueuedActions('room-1');
      expect(queued).toHaveLength(1);
      expect(queued[0]).toEqual(action);
    });

    it('only returns actions for the requested roomId', async () => {
      await enqueueAction(makeAction({ id: 'a1', roomId: 'room-1' }));
      await enqueueAction(makeAction({ id: 'a2', roomId: 'room-2' }));
      expect(await getQueuedActions('room-1')).toHaveLength(1);
      expect(await getQueuedActions('room-2')).toHaveLength(1);
      expect((await getQueuedActions('room-1'))[0].id).toBe('a1');
    });

    it('returns actions ordered oldest-first by timestamp', async () => {
      await enqueueAction(makeAction({ id: 'newer', ts: 2000 }));
      await enqueueAction(makeAction({ id: 'older', ts: 1000 }));
      const queued = await getQueuedActions('room-1');
      expect(queued.map((a) => a.id)).toEqual(['older', 'newer']);
    });

    it('preserves both draw and commits action shapes', async () => {
      await enqueueAction(makeAction({ id: 'd1', path: 'draw', body: { type: 'draw-delta', added: [], modified: [], removed: [] } }));
      await enqueueAction(makeAction({ id: 'c1', path: 'commits', body: { type: 'commit', sha: 'abc', commit: {} } }));
      const queued = await getQueuedActions('room-1');
      expect(queued.find((a) => a.id === 'd1')?.path).toBe('draw');
      expect(queued.find((a) => a.id === 'c1')?.path).toBe('commits');
    });
  });

  describe('removeAction', () => {
    it('removes a single action by id, leaving others intact', async () => {
      await enqueueAction(makeAction({ id: 'a1' }));
      await enqueueAction(makeAction({ id: 'a2' }));
      await removeAction('a1');
      const queued = await getQueuedActions('room-1');
      expect(queued).toHaveLength(1);
      expect(queued[0].id).toBe('a2');
    });

    it('is a no-op when the id does not exist', async () => {
      await enqueueAction(makeAction({ id: 'a1' }));
      await removeAction('does-not-exist');
      expect(await getQueuedActions('room-1')).toHaveLength(1);
    });
  });

  describe('clearAllActions', () => {
    it('clears queued actions across all rooms', async () => {
      await enqueueAction(makeAction({ id: 'a1', roomId: 'room-1' }));
      await enqueueAction(makeAction({ id: 'a2', roomId: 'room-2' }));
      await clearAllActions();
      expect(await getQueuedActions('room-1')).toEqual([]);
      expect(await getQueuedActions('room-2')).toEqual([]);
    });
  });

  describe('enqueueAction overwrite semantics', () => {
    it('overwrites an existing action with the same id (idempotent re-enqueue)', async () => {
      await enqueueAction(makeAction({ id: 'a1', body: { v: 1 } }));
      await enqueueAction(makeAction({ id: 'a1', body: { v: 2 } }));
      const queued = await getQueuedActions('room-1');
      expect(queued).toHaveLength(1);
      expect(queued[0].body).toEqual({ v: 2 });
    });
  });
});
