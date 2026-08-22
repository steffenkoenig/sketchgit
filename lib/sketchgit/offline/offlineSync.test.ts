import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drainOfflineQueue } from './offlineSync';
import { enqueueAction, getQueuedActions, clearAllActions, type PendingAction } from './offlineDb';

function makeAction(overrides: Partial<PendingAction> = {}): PendingAction {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    roomId: overrides.roomId ?? 'room-1',
    path: overrides.path ?? 'draw',
    body: overrides.body ?? { type: 'draw', canvas: '{}' },
    ts: overrides.ts ?? Date.now(),
  };
}

function fakeFetch(responses: (Response | Error)[]): typeof fetch {
  let i = 0;
  return vi.fn(async () => {
    const next = responses[Math.min(i, responses.length - 1)];
    i++;
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
}

describe('drainOfflineQueue', () => {
  beforeEach(async () => {
    await clearAllActions();
  });

  it('returns synced:0 when the queue is empty', async () => {
    const result = await drainOfflineQueue('room-1', undefined, fakeFetch([]));
    expect(result).toEqual({ synced: 0, stoppedEarly: false, remaining: 0 });
  });

  it('replays every queued action in order and removes each on success', async () => {
    await enqueueAction(makeAction({ id: 'a1', ts: 1 }));
    await enqueueAction(makeAction({ id: 'a2', ts: 2 }));

    const fetchImpl = fakeFetch([new Response(null, { status: 200 })]);
    const result = await drainOfflineQueue('room-1', undefined, fetchImpl);

    expect(result).toEqual({ synced: 2, stoppedEarly: false, remaining: 0 });
    expect(await getQueuedActions('room-1')).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('POSTs to the correct room-scoped REST endpoint for each action path', async () => {
    await enqueueAction(makeAction({ id: 'a1', path: 'draw', roomId: 'room-42' }));
    const fetchImpl = fakeFetch([new Response(null, { status: 200 })]);
    await drainOfflineQueue('room-42', undefined, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/rooms/room-42/draw',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('stops draining (does not skip) on the first non-ok response, leaving it and the rest queued', async () => {
    await enqueueAction(makeAction({ id: 'a1', ts: 1 }));
    await enqueueAction(makeAction({ id: 'a2', ts: 2 }));

    const fetchImpl = fakeFetch([new Response(null, { status: 422 })]);
    const result = await drainOfflineQueue('room-1', undefined, fetchImpl);

    expect(result).toEqual({ synced: 0, stoppedEarly: true, remaining: 2 });
    expect(await getQueuedActions('room-1')).toHaveLength(2);
  });

  it('stops draining on a network error (still offline), leaving remaining items queued', async () => {
    await enqueueAction(makeAction({ id: 'a1', ts: 1 }));
    await enqueueAction(makeAction({ id: 'a2', ts: 2 }));

    const fetchImpl = fakeFetch([new TypeError('Failed to fetch')]);
    const result = await drainOfflineQueue('room-1', undefined, fetchImpl);

    expect(result.stoppedEarly).toBe(true);
    expect(result.synced).toBe(0);
    expect(await getQueuedActions('room-1')).toHaveLength(2);
  });

  it('syncs items before a failure, then stops at the failing one', async () => {
    await enqueueAction(makeAction({ id: 'a1', ts: 1 }));
    await enqueueAction(makeAction({ id: 'a2', ts: 2 }));
    await enqueueAction(makeAction({ id: 'a3', ts: 3 }));

    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call++;
      if (call <= 1) return new Response(null, { status: 200 });
      return new Response(null, { status: 500 });
    }) as unknown as typeof fetch;

    const result = await drainOfflineQueue('room-1', undefined, fetchImpl);
    expect(result.synced).toBe(1);
    expect(result.stoppedEarly).toBe(true);
    expect(result.remaining).toBe(2);
    const remainingIds = (await getQueuedActions('room-1')).map((a) => a.id);
    expect(remainingIds).toEqual(['a2', 'a3']);
  });

  it('calls onProgress after each successful replay', async () => {
    await enqueueAction(makeAction({ id: 'a1', ts: 1 }));
    await enqueueAction(makeAction({ id: 'a2', ts: 2 }));
    const onProgress = vi.fn();
    const fetchImpl = fakeFetch([new Response(null, { status: 200 })]);
    await drainOfflineQueue('room-1', onProgress, fetchImpl);
    expect(onProgress).toHaveBeenCalledWith(1, 2);
    expect(onProgress).toHaveBeenCalledWith(2, 2);
  });

  it('does not touch actions queued for a different room', async () => {
    await enqueueAction(makeAction({ id: 'a1', roomId: 'room-1' }));
    await enqueueAction(makeAction({ id: 'b1', roomId: 'room-2' }));
    const fetchImpl = fakeFetch([new Response(null, { status: 200 })]);
    await drainOfflineQueue('room-1', undefined, fetchImpl);
    expect(await getQueuedActions('room-1')).toEqual([]);
    expect(await getQueuedActions('room-2')).toHaveLength(1);
  });
});
