# BUG-008 – `CollaborationManager.destroy()` leaks lock-expire timers and presenter interval

| Field | Value |
|---|---|
| **ID** | BUG-008 |
| **Severity** | Low |
| **Category** | Resource leak / Cleanup |
| **Status** | Open |

## Summary

`CollaborationManager.destroy()` does not cancel the per-peer lock-expire timers stored in `lockExpireTimers` nor stop the presenter-mode view-sync interval stored in `viewSyncTimer`. If either is active at destroy time, both will continue to fire after the object is logically destroyed — potentially calling into already-torn-down callbacks.

## Affected File

| File | Lines | Missing cleanup |
|---|---|---|
| `lib/sketchgit/realtime/collaborationManager.ts` | 687–699 | `lockExpireTimers` not cancelled; `_stopPresenting()` not called |

## Root Cause

```ts
// collaborationManager.ts lines 687–699 — INCOMPLETE
destroy(): void {
  // Cancel any pending draw-delta flush timer.  ← DONE
  if (this.drawFlushTimer !== null) {
    clearTimeout(this.drawFlushTimer);
    this.drawFlushTimer = null;
  }
  // Remove all remote cursor DOM elements.      ← DONE
  for (const elId of Object.values(this.remoteCursors)) {
    document.getElementById(elId)?.remove();
  }
  this.remoteCursors = {};
  this.lastBroadcastSnapshot = {};
  // lockExpireTimers NOT cancelled              ← MISSING
  // _stopPresenting() / viewSyncTimer NOT stopped ← MISSING
}
```

### What the timers do after `destroy()`

**Lock expire timers** (`lockExpireTimers`): Each fires after 5 seconds and calls:
```ts
this.cb.clearRemoteLock?.(senderId);
this.lockExpireTimers.delete(senderId);
```
`cb.clearRemoteLock` delegates to `canvas.clearRemoteLock(clientId)`, which guards against a null canvas (`if (!this.canvas) return`). So the callback is safe *only because* `canvas.destroy()` sets `this.canvas = null` before the timer can fire. This relies on a fragile implicit assumption about destruction ordering.

**Presenter view-sync interval** (`viewSyncTimer`): Fires every 125 ms and calls:
```ts
const vpt = this.cb.getViewport?.();
this.ws.sendBatched({ type: 'view-sync', … });
```
After `destroy()` the WebSocket is disconnected (`ws.disconnect()` is called before `collab.destroy()` in `app.ts`). `sendBatched` will see `socket?.readyState !== WebSocket.OPEN` and fall through to the individual queue, queuing messages that are never sent. No crash, but wasted allocations.

### Why the bug is currently latent

In `app.ts`, the destruction order is:
```ts
ws.disconnect();    // → triggers handleStatusChange('offline')
collab.destroy();   // → too late, handleStatusChange already cleaned up
canvas.destroy();
```

`ws.disconnect()` synchronously calls `_setStatus('offline')`, which calls `handleStatusChange('offline')`, which **does** cancel `lockExpireTimers` and calls `_stopPresenting()`. This means in practice the timers are always cleared before `destroy()` is called.

However, this relies on an undocumented invariant: `destroy()` must be called only after `ws.disconnect()`. Any future refactoring that changes the call order, or any code path that calls `collab.destroy()` without first disconnecting the WebSocket, will create a real timer leak or spurious callback after destroy.

## Impact

- Currently latent due to the implicit ordering in `app.ts`.
- Future refactoring risk: if `destroy()` is called without a prior `ws.disconnect()`, lock timers and the presenter interval will fire against a destroyed manager.
- Minor violation of the RAII principle: `destroy()` should be self-contained.

## Suggested Fix

Add explicit cleanup of `lockExpireTimers` and the presenter interval to `destroy()`:

```ts
// collaborationManager.ts — CORRECT
destroy(): void {
  // Cancel pending draw-delta flush timer.
  if (this.drawFlushTimer !== null) {
    clearTimeout(this.drawFlushTimer);
    this.drawFlushTimer = null;
  }
  // Cancel all lock-expire timers.
  for (const timer of this.lockExpireTimers.values()) {
    clearTimeout(timer);
  }
  this.lockExpireTimers.clear();
  // Stop presenter interval if active.
  this._stopPresenting();
  // Remove all remote cursor DOM elements.
  for (const elId of Object.values(this.remoteCursors)) {
    document.getElementById(elId)?.remove();
  }
  this.remoteCursors = {};
  this.lastBroadcastSnapshot = {};
}
```
