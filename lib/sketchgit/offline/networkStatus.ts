/**
 * networkStatus – browser online/offline detection (P092).
 *
 * Wraps `navigator.onLine` and the `online`/`offline` window events. This is
 * deliberately independent of WsClient's own WebSocket-level reconnection
 * logic (lib/sketchgit/realtime/wsClient.ts) — that already handles WS
 * disconnects with backoff/polling-fallback. This module answers a
 * different question: is the *browser's network interface* down, which is
 * what determines whether REST POSTs (draw/commit) should be queued locally
 * instead of attempted.
 *
 * `navigator.onLine` has known false positives (it can report `true` on a
 * network with no real internet access) but no false negatives in practice
 * (browsers only report `offline` when the OS/interface is genuinely down),
 * so it's used as the fast pre-check before attempting a request; a request
 * that still fails with a network-level error despite `navigator.onLine`
 * being `true` is treated as offline too (see offlineSync.ts).
 */

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/**
 * Subscribes to browser online/offline transitions. Returns an unsubscribe
 * function. Safe to call in non-browser environments (SSR/tests) — becomes
 * a no-op that never fires.
 */
export function onNetworkStatusChange(cb: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handleOnline = () => cb(true);
  const handleOffline = () => cb(false);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
