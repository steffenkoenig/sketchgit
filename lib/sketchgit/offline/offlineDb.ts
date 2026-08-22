/**
 * offlineDb – IndexedDB-backed durable queue for actions made while offline (P092).
 *
 * Stores pending draw/commit REST payloads so they survive a page reload
 * while the user is disconnected, and can be replayed once connectivity
 * returns. IndexedDB (not localStorage) per the proposal: async, doesn't
 * block the main thread, and isn't subject to localStorage's ~5MB cap
 * (canvas snapshots can be large).
 *
 * Isolation: IndexedDB is already same-origin-isolated by the browser — a
 * page on another origin cannot read this store. That's the same isolation
 * boundary every other client-side storage mechanism in this app relies on
 * (see userPreferences.ts's localStorage usage); no additional encryption
 * is applied here, consistent with that existing precedent.
 */
import { logger } from '../logger';

const DB_NAME = 'sketchgit-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pendingActions';

/** The two REST paths queued for offline replay — see collaborationManager.ts's _postEvent(). */
export type OfflineActionPath = 'draw' | 'commits';

export interface PendingAction {
  /** Client-generated id (crypto.randomUUID) — used as the IndexedDB key. */
  id: string;
  roomId: string;
  path: OfflineActionPath;
  body: Record<string, unknown>;
  /** Timestamp the action was queued, ms since epoch — for display/ordering only. */
  ts: number;
}

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('roomId', 'roomId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Persist an action to the offline queue. No-ops (logs a warning) when
 * IndexedDB isn't available — e.g. Safari private browsing, or a browser
 * without IndexedDB support — since the offline queue is a resilience
 * feature, not a hard requirement; degrading to "changes made while
 * offline are lost" (the pre-P092 behaviour) is an acceptable fallback.
 */
export async function enqueueAction(action: PendingAction): Promise<void> {
  if (!isIndexedDbAvailable()) {
    logger.warn('[offlineDb] IndexedDB unavailable — action not queued');
    return;
  }
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(action);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    logger.warn(`[offlineDb] Failed to enqueue action: ${String(err)}`);
  }
}

/** Returns all queued actions for a room, oldest-first (ts ascending). */
export async function getQueuedActions(roomId: string): Promise<PendingAction[]> {
  if (!isIndexedDbAvailable()) return [];
  try {
    const db = await openDb();
    const actions = await new Promise<PendingAction[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const index = tx.objectStore(STORE_NAME).index('roomId');
      const req = index.getAll(IDBKeyRange.only(roomId));
      req.onsuccess = () => resolve(req.result as PendingAction[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return actions.sort((a, b) => a.ts - b.ts);
  } catch (err) {
    logger.warn(`[offlineDb] Failed to read queue: ${String(err)}`);
    return [];
  }
}

/** Removes a single action from the queue (called after a successful replay). */
export async function removeAction(id: string): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    logger.warn(`[offlineDb] Failed to remove action ${id}: ${String(err)}`);
  }
}

/**
 * P092 GDPR requirement – clears all queued offline actions across every
 * room. Called on logout and account deletion so no locally-cached pending
 * writes survive the session that created them.
 */
export async function clearAllActions(): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    logger.warn(`[offlineDb] Failed to clear queue: ${String(err)}`);
  }
}
