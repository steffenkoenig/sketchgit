/**
 * offlineSync – replays the offline action queue once connectivity returns (P092).
 *
 * Queued draw/commit actions are POSTed to the exact same REST endpoints
 * (`/api/rooms/[roomId]/draw`, `/api/rooms/[roomId]/commits`) a live client
 * would use — the server validates every payload with the same Zod schemas
 * either way, so there is no separate "offline payload" validation path to
 * build or trust differently.
 *
 * Conflict resolution: this app already has a full three-way-merge/conflict
 * UI (lib/sketchgit/git/mergeEngine.ts, coordinators/mergeCoordinator.ts) for
 * when a client's local branch has diverged from the server's. A queued
 * offline commit is just a normal commit on the client's local branch —
 * replaying it after reconnecting hits the exact same divergence-detection
 * path a live commit would if two peers committed concurrently. P092
 * deliberately does not add a second, offline-specific conflict system.
 */
import { getQueuedActions, removeAction, type PendingAction } from './offlineDb';
import { logger } from '../logger';

export interface DrainResult {
  synced: number;
  /** True when draining stopped early because a request failed (network still down, or the server rejected it). */
  stoppedEarly: boolean;
  remaining: number;
}

/**
 * Replays every queued action for `roomId` in the order it was queued
 * (oldest first — draw deltas and commits are order-sensitive). Stops at
 * the first failure rather than skipping it, so a genuinely offline
 * connection (or one bad payload) doesn't silently drop everything queued
 * after it — the remaining items stay queued for the next sync attempt.
 */
export async function drainOfflineQueue(
  roomId: string,
  onProgress?: (synced: number, total: number) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<DrainResult> {
  const actions = await getQueuedActions(roomId);
  let synced = 0;

  for (const action of actions) {
    const ok = await replayAction(action, fetchImpl);
    if (!ok) {
      return { synced, stoppedEarly: true, remaining: actions.length - synced };
    }
    await removeAction(action.id);
    synced++;
    onProgress?.(synced, actions.length);
  }

  return { synced, stoppedEarly: false, remaining: 0 };
}

async function replayAction(action: PendingAction, fetchImpl: typeof fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`/api/rooms/${encodeURIComponent(action.roomId)}/${action.path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action.body),
    });
    if (!res.ok) {
      logger.warn(`[offlineSync] Replay rejected (${res.status}) for queued ${action.path} action`);
      return false;
    }
    return true;
  } catch (err) {
    logger.warn(`[offlineSync] Replay failed for queued ${action.path} action: ${String(err)}`);
    return false;
  }
}
