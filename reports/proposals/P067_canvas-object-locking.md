# P067 – Canvas Object Selection and Locking (Optimistic Object Reservation)

## Title
Prevent Conflicting Concurrent Edits on the Same Canvas Object by Broadcasting Per-Object Lock Reservations Between Peers

## Brief Summary
When two collaborators simultaneously select and move the same canvas object, both clients apply their local changes and the last `draw-delta` or `canvas-sync` message wins, silently discarding the other user's edit. A lightweight "object reservation" protocol—where selecting an object broadcasts a `lock` message to peers, and peers visually indicate and optionally prevent editing of reserved objects—eliminates this silent data loss while maintaining the low-latency feel of optimistic local updates.

## Current Situation
The `collaborationManager.ts` (P006) sends `draw-delta` messages whenever canvas objects are modified:
```typescript
// _flushDrawDelta in collaborationManager.ts
this.ws.send({ type: 'draw-delta', delta: patches, senderId: this.wsClientId });
```
There is no coordination between peers about which objects each peer is currently editing. The last `draw-delta` or `canvas-sync` message to arrive at any given peer wins.

In `canvasEngine.ts`, the `selection:created` event fires when a user selects one or more objects, but this event is not broadcast to peers:
```typescript
this.canvas.on('selection:created', () => {
  this.isDirty = false; // only local state change
});
```

### Conflict scenario
1. Peer A selects rectangle `obj-001` and starts moving it left.
2. Peer B, simultaneously, selects the same rectangle and moves it up.
3. Both peers' `draw-delta` messages propagate to each other.
4. The final position of `obj-001` depends on message arrival order: whichever `draw-delta` arrives last is applied, silently overwriting the other peer's edit.

## Problem with Current Situation
1. **Silent data loss**: Neither peer sees an error; one user's edit is silently discarded without any indication. This is a core reliability issue in the collaborative editing experience.
2. **No visual indication of concurrent selection**: Users have no way to know that another peer is currently editing an object they are about to edit. Remote cursor positions (already implemented) do not convey object selection intent.
3. **Merge conflicts for individual objects**: The existing merge engine (P006, three-way merge in `mergeEngine.ts`) resolves conflicts at the **commit** level, not at the **real-time editing** level. Delta-mode conflicts during active drawing are not surfaced.
4. **Inconsistency between peers**: After conflicting `draw-delta` messages, peers may end up with different canvas states that only converge on the next commit (when `canvas-sync` provides a single authoritative snapshot).

## Goal to Achieve
1. Add a new WebSocket message type `object-lock` / `object-unlock` that a client sends when selecting / deselecting canvas objects.
2. Propagate these lock messages to all peers in the room.
3. In `canvasEngine.ts` and `collaborationManager.ts`, visually indicate which objects are locked by remote peers (e.g., a colored border matching the peer's presence color).
4. Optionally: prevent a local user from selecting an object that is locked by a remote peer (soft lock). Default: warn but allow (no hard lock, to avoid UX friction).
5. Auto-expire locks after 5 seconds without an update, in case a peer disconnects without sending `object-unlock`.

## What Needs to Be Done

### 1. Add `object-lock` and `object-unlock` to `WsMessage` types
In `lib/sketchgit/types.ts`:
```typescript
export type WsMessage =
  | // … existing types …
  | { type: 'object-lock';   senderId: string; objectIds: string[]; color: string }
  | { type: 'object-unlock'; senderId: string; objectIds: string[] }
```

Add corresponding Zod schemas in `lib/api/wsSchemas.ts`.

### 2. Broadcast selection events in `canvasEngine.ts`
```typescript
this.canvas.on('selection:created', (e) => {
  const objectIds = (e.selected ?? [])
    .map((obj) => obj._id as string)
    .filter(Boolean);
  if (objectIds.length > 0) {
    this.onBroadcastLock(objectIds);
  }
});

this.canvas.on('selection:cleared', () => {
  this.onBroadcastUnlock();
});
```
Add `onBroadcastLock` and `onBroadcastUnlock` callbacks to `CanvasEngine`'s constructor interface, similar to the existing `onBroadcastDraw` and `onBroadcastCursor`.

### 3. Handle incoming `object-lock` in `collaborationManager.ts`
```typescript
case 'object-lock': {
  const { senderId, objectIds, color } = data;
  this._applyRemoteLock(senderId, objectIds, color);
  break;
}
case 'object-unlock': {
  const { senderId } = data;
  this._clearRemoteLock(senderId);
  break;
}
```

### 4. Implement lock rendering in `canvasEngine.ts`
```typescript
/** Map from clientId to { objectIds, color } for active remote locks. */
private remoteLocks: Map<string, { objectIds: Set<string>; color: string }> = new Map();

/** Apply a colored overlay border to objects locked by a remote peer. */
applyRemoteLock(clientId: string, objectIds: string[], color: string): void {
  this.clearRemoteLock(clientId);
  const objects = this.canvas?.getObjects() ?? [];
  const lockedSet = new Set(objectIds);
  this.remoteLocks.set(clientId, { objectIds: lockedSet, color });
  for (const obj of objects) {
    if (lockedSet.has((obj as FabricObject & { _id?: string })._id ?? '')) {
      obj.set({ stroke: color, strokeWidth: 2, strokeDashArray: [4, 4] });
    }
  }
  this.canvas?.requestRenderAll();
}

clearRemoteLock(clientId: string): void {
  // Restore original styles for previously locked objects
  // … restore stroke/strokeWidth/strokeDashArray from saved state …
  this.remoteLocks.delete(clientId);
}
```

### 5. Auto-expire locks
In `collaborationManager.ts`, maintain a timer per peer that clears the lock after 5 seconds without a renewal:
```typescript
private lockExpireTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

private _applyRemoteLock(senderId: string, objectIds: string[], color: string): void {
  clearTimeout(this.lockExpireTimers.get(senderId));
  // … apply lock visually …
  const timer = setTimeout(() => this._clearRemoteLock(senderId), 5_000);
  this.lockExpireTimers.set(senderId, timer);
}
```

### 6. Cleanup on disconnect
In the `presence` message handler (which fires when a peer leaves), clear their lock:
```typescript
case 'presence': {
  // … existing presence handling …
  const leftClients = previousClients.filter(c => !newClients.find(n => n.id === c.id));
  for (const c of leftClients) this._clearRemoteLock(c.id);
}
```

### 7. Soft-lock warning UI
When a user attempts to select an object already locked by a remote peer, show a brief toast:
```typescript
// In canvasEngine.ts selection handler:
if (alreadyLockedBy) {
  showToast(`⚠ ${alreadyLockedBy.name} is editing this object`);
}
```
Do not block selection (soft lock); allow the user to proceed.

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `lib/sketchgit/types.ts` | Add `object-lock`, `object-unlock` message types |
| `lib/api/wsSchemas.ts` | Add Zod schemas for new message types |
| `lib/sketchgit/canvas/canvasEngine.ts` | Broadcast selection; apply/clear remote lock visuals |
| `lib/sketchgit/realtime/collaborationManager.ts` | Handle `object-lock`/`object-unlock`; auto-expire timers |
| `server.ts` | Relay `object-lock`/`object-unlock` messages (same as other broadcast types) |

## Additional Considerations

### Performance impact
`object-lock` messages are small (< 200 bytes) and infrequent (only on selection change, not during drag). They do not require the P006 throttling applied to `draw-delta` messages.

### Multiple-object selection
A user can select multiple objects at once. All selected object IDs are included in the `object-lock` message. Peers display the lock indicator on all of them.

### Conflict resolution vs. prevention
This proposal does not prevent conflicts at the final `canvas-sync`/commit level—that is handled by the existing three-way merge engine (P006). The object-lock protocol provides a UX hint during real-time editing to reduce the frequency of conflicts, not to eliminate them entirely.

### Accessibility
The visual lock indicator (dashed colored border) should also be announced to screen readers using an ARIA live region: "Alice is editing rectangle #abc123."

## Testing Requirements
- `canvasEngine.ts` emits `object-lock` with the correct object IDs when an object is selected.
- `canvasEngine.ts` emits `object-unlock` when selection is cleared.
- `collaborationManager.ts` applies the lock visual when an `object-lock` message is received.
- Lock auto-expires after 5 seconds without renewal (timer test with fake timers).
- Lock is cleared when the peer sends `object-unlock`.
- Lock is cleared when the peer leaves (presence update removes the peer).
- Lock timer is cancelled on `destroy()` (no memory leaks, P020 pattern).

## Dependency Map
- Builds on: P001 ✅ (module decomposition), P006 ✅ (real-time collaboration throughput), P020 ✅ (resource cleanup), P025 ✅ (accessibility)
- Complements: P031 ✅ (WebSocket message validation — new message types need Zod schemas), P044 ✅ (presence debouncing)
- Independent of: Redis, database, auth
