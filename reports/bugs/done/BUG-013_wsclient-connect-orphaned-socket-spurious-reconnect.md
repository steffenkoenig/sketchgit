# BUG-013 – `WsClient.connect()` orphans the old socket, causing spurious reconnects

**ID**: BUG-013  
**Severity**: High  
**File**: `lib/sketchgit/realtime/wsClient.ts`  
**Reported**: 2026-03-12

---

## Summary

`WsClient.connect()` is documented as "safe to call multiple times" but it does **not** close the existing WebSocket before opening a new one. When the old socket eventually closes (due to server-side teardown or TCP timeout), its `onclose` handler still fires against the live `WsClient` instance, finds `intentionalClose === false`, and calls `_scheduleReconnect()`. This creates a third (and potentially fourth, fifth …) socket and corrupts the reconnect counter, causing an uncontrolled cascade of spurious reconnection attempts.

A secondary effect is that the old socket's `onclose` handler calls `this._clearHeartbeat()`, which cancels the **new** socket's heartbeat timeout, briefly disabling the zombie-connection detection for the current session.

---

## Affected Code

```typescript
// lib/sketchgit/realtime/wsClient.ts  lines 67-73
connect(roomId: string, myName: string, myColor: string): void {
  this.roomId = roomId;
  this.myName = myName;
  this.myColor = myColor;
  this.retryCount = 0;
  this.intentionalClose = false;
  this._openSocket();          // ← creates a NEW socket; old socket is NOT closed
}
```

```typescript
// lib/sketchgit/realtime/wsClient.ts  lines 152-212
private _openSocket(): void {
  this._clearTimers();          // ← cancels timers but does NOT close old this.socket
  ...
  const ws = new WebSocket(this._buildUrl());
  this.socket = ws;             // ← overwrites the reference; old socket is now orphaned
  ...
  ws.addEventListener('close', (ev) => {
    this._clearHeartbeat();     // ← operates on this.heartbeatTimer (now the NEW socket's)
    ...
    if (this.intentionalClose) return;
    this._scheduleReconnect(ev.code);  // ← fires even for the orphaned old socket
  });
}
```

---

## How to Reproduce

1. Open the canvas app — WebSocket A connects to room `default`.
2. In the collaboration panel, type a different room name (e.g. `roomB`) and click **Connect**.
3. `WsClient.connect('roomB', …)` is called. WebSocket B is opened; WebSocket A is still open and running.
4. The server closes the WebSocket A connection after detecting that the client is now in room B (or after the TCP keepalive expires).
5. WebSocket A's `onclose` handler fires.
   - `this.intentionalClose` is `false` (it was reset to `false` by `connect()`).
   - `_scheduleReconnect()` is called.
   - **Expected**: nothing — A was not the current connection.
   - **Actual**: after the backoff delay, `_openSocket()` creates WebSocket C, overwriting `this.socket` (dropping WebSocket B).

---

## Root Cause

The `close` event listener captures `this` (the `WsClient` instance), not the specific `WebSocket` object it was added to. When `connect()` replaces `this.socket` with a new WebSocket, all outstanding close handlers from previous sockets still share the same `this.intentionalClose` flag and `_scheduleReconnect` method. Since `connect()` sets `intentionalClose = false` before calling `_openSocket()`, any stale close handler that fires afterwards will bypass the guard and trigger a reconnect.

---

## Fix

Close the old socket intentionally (using a temporary flag) before creating the new one:

```typescript
connect(roomId: string, myName: string, myColor: string): void {
  // Close any existing socket without triggering a reconnect.
  // We use a generation counter so stale close handlers can identify
  // themselves as belonging to a superseded socket.
  if (this.socket) {
    const old = this.socket;
    this.socket = null;
    this.intentionalClose = true;      // suppress reconnect from old close handler
    try { old.close(1000, 'room-switch'); } catch { /* ignore */ }
    this.intentionalClose = false;     // reset before the new connection
  }
  this._clearTimers();
  this.roomId = roomId;
  this.myName = myName;
  this.myColor = myColor;
  this.retryCount = 0;
  this.intentionalClose = false;
  this._openSocket();
}
```

A more robust alternative is to add a `_connectionId` counter and include it in each close handler closure, ignoring the event if the ID doesn't match the current connection.

---

## Impact

- Every room switch creates a growing set of orphaned WebSocket close handlers.
- After the old socket closes, a spurious `_scheduleReconnect()` call overwrites `this.socket`, dropping the live connection and creating yet another socket.
- `retryCount` is corrupted (reset to 0 by `connect()` then immediately incremented by the stale handler), which can exhaust the retry budget prematurely.
- The new socket's heartbeat monitor is silently cancelled by the old socket's close handler (`_clearHeartbeat()` is called on the shared `this.heartbeatTimer`), temporarily disabling zombie-connection detection.
