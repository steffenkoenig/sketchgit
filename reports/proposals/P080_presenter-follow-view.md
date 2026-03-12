# P080 – Presenter Mode: Ask Peers to Follow Your View

## Title
Add a Presenter Mode That Lets a User Broadcast a "Follow My View" Request, Synchronising Followers' Canvas Viewport and Branch in Real Time

## Brief Summary
During collaborative sessions, a user often wants to guide others through their work — showing a specific area of the canvas, demonstrating a drawing technique, or walking the team through different branches. Currently every participant sees an independent viewport; there is no way to say "look at what I'm looking at right now." Adding a **Presenter Mode** allows one user to send a `follow-request` to all room peers. Peers who accept have their canvas viewport (zoom + pan position) continuously synchronised to the presenter's view in real time. If the presenter switches branches, followers are prompted to follow. Any follower interaction (draw, zoom, pan) automatically exits follow mode. The presenter can stop presenting at any time.

## Current Situation

### Viewport API (`lib/sketchgit/canvas/canvasEngine.ts`)
Fabric.js exposes the full viewport as a 6-element affine transform matrix:
```typescript
canvas.viewportTransform   // [scaleX, skewY, skewX, scaleY, translateX, translateY]
canvas.getZoom()           // scalar zoom level (shorthand for viewportTransform[0])
canvas.setZoom(n)          // set zoom only
canvas.setViewportTransform(vpt)  // set full transform (pan + zoom)
canvas.requestRenderAll()  // re-render after transform change
```
There is no `getViewport()` or `applyViewport()` method on `CanvasEngine`; viewport read/write is only used internally for zoom controls.

### Presence messages (`server.ts` + `collaborationManager.ts`)
The `presence` message broadcasts the room's client list. There is no leader/follower relationship tracked on either the server or the client. The `profile` message updates display name, colour, and (after P079) branch.

### Collab panel DOM (`collaborationManager.ts`)
```typescript
// updateCollabUI() renders:
// - #connectedList  ← one row per peer (name + colour dot)
// - #avatarRow      ← avatar stack in the topbar
// No buttons or actions per peer beyond static display
```

### No presenter-mode concept
There is no `follow-request`, `follow-accept`, `follow-stop`, or `view-sync` message type. The `WsMessageType` union in `types.ts` contains 15 types, none related to presentation.

## Problem with Current Situation
1. **No guided viewing**: When a designer wants to walk the team through their work, every participant has an independent viewport. There is no way to bring everyone to the same part of the canvas simultaneously.
2. **High friction for screen-sharing alternatives**: Users resort to external screen sharing (Zoom, Teams) to show their canvas view, creating a disjointed experience alongside the collaborative tool.
3. **No viewport synchronisation**: Even users who want to observe the same area have to manually navigate there, often missing transient activity (a quick zoom to a corner, a drawn arrow pointing at something).
4. **Branch-switching during demos is invisible**: When a presenter switches to a different branch to show a previous version, followers see the branch name in the branch modal (after P079) but their canvas remains on the old branch until they manually switch.
5. **No signal that a peer is presenting**: There is no UI affordance to announce "I want to show everyone something" without leaving the application.

## Goal to Achieve
1. **Presenter broadcasts a follow request**: A "Present to everyone" button in the collab panel sends a `follow-request` to all room peers. The presenter enters an active presenter state (visual indicator, stop button).
2. **Peers receive a non-blocking notification**: Each peer receives a toast notification — "[Name] is presenting. Follow their view? [Follow] [Dismiss]" — and can opt in or out.
3. **Follower viewport syncs in real time**: Followers who accept receive `view-sync` messages from the presenter (throttled to 8 Hz) and have their canvas viewport automatically updated to match.
4. **Branch prompt on presenter branch switch**: When the presenter switches branches, followers who are on a different branch receive a targeted notification: "Presenter switched to ⎇ [branch]. [Switch] [Stay]".
5. **Auto-exit on follower interaction**: Any drawing, zooming, or panning by a follower automatically exits follow mode, restoring independent navigation.
6. **Clean stop**: The presenter can click "Stop Presenting" to broadcast `follow-stop`, dismissing all followers. Followers can also manually unfollow at any time.

## What Needs to Be Done

### 1. Add new message types to `lib/sketchgit/types.ts`
```typescript
export type WsMessageType =
  | "welcome"
  | "presence"
  | "profile"
  | "draw"
  | "draw-delta"
  | "commit"
  | "cursor"
  | "ping"
  | "pong"
  | "fullsync-request"
  | "fullsync"
  | "user-left"
  | "error"
  | "shutdown-warning"
  | "branch-update"
  | "follow-request"   // ← new: presenter asks all peers to follow
  | "follow-accept"    // ← new: a peer accepts the follow request (broadcast by server; presenter filters by senderId)
  | "follow-stop"      // ← new: presenter stops presenting OR follower unfollows
  | "view-sync";       // ← new: presenter broadcasts viewport state to followers
```

Add a viewport interface:
```typescript
/** Fabric.js canvas viewport transform: [scaleX, skewY, skewX, scaleY, tx, ty] */
export type ViewportTransform = [number, number, number, number, number, number];

/** Payload for a view-sync message */
export interface ViewSyncPayload {
  /** The 6-element affine transform matrix from canvas.viewportTransform */
  vpt: ViewportTransform;
  /** Presenter's current branch (included so followers can detect a branch mismatch) */
  branch?: string;
  /** Presenter's current HEAD SHA (used to offer branch switch to followers) */
  headSha?: string | null;
}
```

### 2. Add `view-sync` fields to the Zod schema in `lib/api/wsSchemas.ts` (P031)
```typescript
z.object({
  type: z.literal('view-sync'),
  // vpt: 6-element affine transform [scaleX, skewY, skewX, scaleY, tx, ty]
  vpt: z.tuple([
    z.number(), z.number(), z.number(),
    z.number(), z.number(), z.number(),
  ]),
  branch: z.string().max(100).optional(),
  headSha: z.string().max(64).nullish(),
}),
z.object({ type: z.literal('follow-request') }),
z.object({ type: z.literal('follow-accept') }),
z.object({ type: z.literal('follow-stop') }),
```

### 3. Add `getViewport()` and `applyViewport()` to `CanvasEngine`
```typescript
// lib/sketchgit/canvas/canvasEngine.ts

/**
 * Return the current viewport transform and zoom for serialisation.
 * Used by CollaborationManager to build view-sync payloads.
 */
getViewport(): ViewportTransform {
  const vpt = this.canvas?.viewportTransform;
  if (!vpt || vpt.length < 6) return [1, 0, 0, 1, 0, 0];
  return [vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]] as ViewportTransform;
}

/**
 * Apply a remote viewport transform received from a presenter.
 * Skips the update if the canvas is not initialised.
 * Does NOT trigger onBroadcastDraw — viewport changes are display-only.
 */
applyViewport(vpt: ViewportTransform): void {
  if (!this.canvas) return;
  this.canvas.setViewportTransform(vpt);
  this.canvas.requestRenderAll();
}
```

### 4. Add presenter/follower state to `CollaborationManager`
```typescript
// lib/sketchgit/realtime/collaborationManager.ts

// ─── Presenter state ──────────────────────────────────────────────────────

/** clientId of the peer this client is currently following (null = not following) */
private followingClientId: string | null = null;

/** true while this client is in active presenter mode */
private _isPresenting = false;

/** Timer handle for periodic view-sync broadcasts */
private viewSyncTimer: ReturnType<typeof setInterval> | null = null;

/** Throttle: ms between view-sync broadcasts (≈8 Hz) */
private readonly VIEW_SYNC_INTERVAL_MS = 125;
```

### 5. Add `startPresenting()` and `stopPresenting()` to `CollaborationManager`
```typescript
startPresenting(): void {
  if (this._isPresenting) return;
  this._isPresenting = true;
  // Broadcast the follow-request to all room peers
  this.ws.send({ type: 'follow-request' });
  // Begin periodic view-sync broadcasts
  this.viewSyncTimer = setInterval(() => {
    if (!this._isPresenting) return;
    const vpt = this.callbacks.getViewport();
    const gitState = this.callbacks.getGitState();
    this.ws.send({
      type: 'view-sync',
      vpt,
      // gitState.detached is the commit SHA when in detached HEAD, or null when on a branch.
      // When detached, suppress the branch name (undefined) so followers are not prompted
      // to switch to a branch that doesn't contain this exact SHA.
      branch: gitState.detached ? undefined : gitState.HEAD,
      // headSha is the detached SHA itself, or the tip of the current named branch.
      headSha: gitState.detached ?? gitState.branches[gitState.HEAD] ?? null,
    } as WsMessage);
  }, this.VIEW_SYNC_INTERVAL_MS);

  // Update UI: show presenter indicator and "Stop Presenting" button
  this._updatePresenterUI();
  showToast('📡 You are now presenting. Peers can follow your view.');
}

stopPresenting(): void {
  if (!this._isPresenting) return;
  this._isPresenting = false;
  if (this.viewSyncTimer !== null) {
    clearInterval(this.viewSyncTimer);
    this.viewSyncTimer = null;
  }
  this.ws.send({ type: 'follow-stop' });
  this._updatePresenterUI();
  showToast('Presentation stopped.');
}
```

### 6. Add `followPresenter()` and `unfollowPresenter()` to `CollaborationManager`
```typescript
followPresenter(leaderId: string): void {
  this.followingClientId = leaderId;
  this._updateFollowerUI();
  const leader = this.presenceClients.find((c) => c.clientId === leaderId);
  showToast(`👁 Following ${(leader?.name || 'Presenter').slice(0, 20)}`);
}

unfollowPresenter(): void {
  if (!this.followingClientId) return;
  this.followingClientId = null;
  this.ws.send({ type: 'follow-stop' });
  this._updateFollowerUI();
  showToast('Stopped following.');
}
```

### 7. Handle new message types in the `onMessage` switch (`collaborationManager.ts`)
```typescript
case 'follow-request': {
  // A peer is asking everyone to follow their view.
  const leaderId = data.senderId as string;
  const leader = this.presenceClients.find((c) => c.clientId === leaderId);
  const leaderName = (leader?.name || 'A peer').slice(0, 20);

  // Show a non-blocking toast with Accept / Dismiss buttons.
  this._showFollowRequestToast(leaderName, leaderId);
  break;
}

case 'follow-stop': {
  // Presenter stopped, or a follower sent their own stop (we ignore peer stops).
  const senderId = data.senderId as string;
  if (this.followingClientId === senderId) {
    // The person we're following stopped presenting.
    this.followingClientId = null;
    this._updateFollowerUI();
    showToast('📡 Presenter has stopped sharing their view.');
  }
  break;
}

case 'view-sync': {
  // Only apply if we are currently following this sender.
  if (data.senderId !== this.followingClientId) break;

  const vpt = data.vpt as ViewportTransform;
  if (Array.isArray(vpt) && vpt.length === 6) {
    this.callbacks.applyViewport(vpt);
  }

  // If the presenter is on a different branch, prompt the follower to switch.
  const presenterBranch = data.branch as string | undefined;
  if (presenterBranch) {
    const gitState = this.callbacks.getGitState();
    const myBranch = gitState.HEAD;
    if (presenterBranch !== myBranch && presenterBranch !== this._lastPromptedBranch) {
      this._lastPromptedBranch = presenterBranch;
      this._showBranchFollowToast(presenterBranch, data.headSha as string | null);
    }
  }
  break;
}
```

### 8. Auto-exit follow mode on local interaction in `CollaborationManager`
Register a check for follower interaction. The cleanest place is in `CanvasEngine`'s interaction callbacks, which are already passed through `onBroadcastDraw`. Add an `onFollowerInteraction` callback:

```typescript
// In CanvasEngine constructor, add optional callback:
onUserInteraction: (() => void) | null = null;

// Fire it on any user-initiated canvas change that constitutes "interaction":
private onMouseDown(e: TPointerEventInfo): void {
  this.onUserInteraction?.(); // ← signal to CollaborationManager that user is active
  // … existing logic …
}
```

In `CollaborationManager`, register the handler after `canvas` is available:
```typescript
// In app.ts wiring (or via a callback in CollaborationManager.init):
canvas.onUserInteraction = () => {
  if (collab.isFollowing()) {
    collab.unfollowPresenter();
  }
};
```

Also fire `onUserInteraction` on zoom/pan events in `CanvasEngine`:
```typescript
// In the mouse:wheel handler (zoom):
this.onUserInteraction?.();

// In the mouse:move handler when panning (alt/space + drag):
this.onUserInteraction?.();
```

### 9. Show the "Present" button in the collab panel
In `updateCollabUI()`, add a presenter button above the peer list:
```typescript
const presenterBtn = document.createElement('button');
presenterBtn.className = 'btn-presenter';
presenterBtn.style.cssText = 'width:100%;padding:4px 8px;font-size:0.75rem;margin-bottom:6px;border-radius:4px;cursor:pointer;';
presenterBtn.id = 'presenterToggle';

if (this._isPresenting) {
  presenterBtn.textContent = '⏹ Stop Presenting';
  presenterBtn.style.background = '#ff5f7e';
  presenterBtn.style.color = '#fff';
  presenterBtn.addEventListener('click', () => this.stopPresenting());
} else {
  presenterBtn.textContent = '📡 Present to Everyone';
  presenterBtn.style.background = 'var(--a3, #7c6eff)';
  presenterBtn.style.color = '#fff';
  presenterBtn.addEventListener('click', () => this.startPresenting());
}
```

Show a "Following [Name]" status bar when in follower mode:
```typescript
if (this.followingClientId) {
  const leader = this.presenceClients.find((c) => c.clientId === this.followingClientId);
  const followBar = document.createElement('div');
  followBar.style.cssText = 'font-size:0.7rem;padding:3px 8px;background:rgba(124,110,255,0.2);border-radius:4px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between';
  followBar.innerHTML = `<span>👁 Following <strong>${(leader?.name || 'Presenter').slice(0, 16)}</strong></span>`;
  const stopBtn = document.createElement('button');
  stopBtn.textContent = '✕ Unfollow';
  stopBtn.style.cssText = 'font-size:0.65rem;cursor:pointer;color:var(--a3,#7c6eff);background:none;border:none;padding:0';
  stopBtn.addEventListener('click', () => this.unfollowPresenter());
  followBar.appendChild(stopBtn);
  list?.parentElement?.insertBefore(followBar, list);
}
```

### 10. `_showFollowRequestToast()` helper
```typescript
private _showFollowRequestToast(leaderName: string, leaderId: string): void {
  // Custom toast with two action buttons – requires extending the toast utility.
  // The toast shows for 8 seconds; clicking outside / waiting dismisses it.
  const toastId = `follow-req-${leaderId}`;
  if (document.getElementById(toastId)) return; // deduplicate

  const toast = document.createElement('div');
  toast.id = toastId;
  toast.className = 'toast toast-action';
  toast.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-width:220px';

  const msg = document.createElement('span');
  msg.style.cssText = 'font-size:0.8rem';
  msg.textContent = `📡 ${leaderName} is presenting.`;
  toast.appendChild(msg);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px';

  const followBtn = document.createElement('button');
  followBtn.textContent = '👁 Follow';
  followBtn.style.cssText = 'flex:1;padding:3px 6px;font-size:0.75rem;background:var(--a3,#7c6eff);color:#fff;border:none;border-radius:4px;cursor:pointer';
  followBtn.addEventListener('click', () => {
    this.followPresenter(leaderId);
    toast.remove();
  });

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.style.cssText = 'flex:1;padding:3px 6px;font-size:0.75rem;background:rgba(255,255,255,0.1);color:#e2e8f0;border:none;border-radius:4px;cursor:pointer';
  dismissBtn.addEventListener('click', () => toast.remove());

  btnRow.appendChild(followBtn);
  btnRow.appendChild(dismissBtn);
  toast.appendChild(btnRow);

  document.getElementById('toast-area')?.appendChild(toast);
  setTimeout(() => toast.remove(), 8_000);
}
```

### 11. `_showBranchFollowToast()` helper
```typescript
private _lastPromptedBranch: string | null = null;

private _showBranchFollowToast(branch: string, headSha: string | null): void {
  const toast = document.createElement('div');
  toast.className = 'toast toast-action';

  const msg = document.createElement('span');
  msg.style.cssText = 'font-size:0.8rem';
  msg.textContent = `Presenter switched to ⎇ ${branch.slice(0, 24)}`;
  toast.appendChild(msg);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;margin-top:4px';

  const switchBtn = document.createElement('button');
  switchBtn.textContent = '⎇ Switch';
  switchBtn.style.cssText = 'flex:1;padding:3px 6px;font-size:0.75rem;background:var(--a3,#7c6eff);color:#fff;border:none;border-radius:4px;cursor:pointer';
  switchBtn.addEventListener('click', () => {
    // Delegate branch switch to the BranchCoordinator via a registered callback
    this.callbacks.checkoutBranch?.(branch, headSha);
    toast.remove();
  });

  const stayBtn = document.createElement('button');
  stayBtn.textContent = 'Stay Here';
  stayBtn.style.cssText = 'flex:1;padding:3px 6px;font-size:0.75rem;background:rgba(255,255,255,0.1);color:#e2e8f0;border:none;border-radius:4px;cursor:pointer';
  stayBtn.addEventListener('click', () => toast.remove());

  btnRow.appendChild(switchBtn);
  btnRow.appendChild(stayBtn);
  toast.appendChild(btnRow);

  document.getElementById('toast-area')?.appendChild(toast);
  setTimeout(() => toast.remove(), 10_000);
}
```

### 12. Server: relay `view-sync` to room; no state needed
The server does not need to track follower relationships. It simply relays all four new message types to the room, exactly like `draw-delta` and `cursor`:
```typescript
// server.ts – no special handling needed for follow-request, follow-accept,
// follow-stop, or view-sync beyond the existing relay:
const relay: WsMessage = {
  ...message,
  senderId: client.clientId,
  senderName: client.displayName,
  senderColor: client.displayColor,
  roomId,
};
broadcastRoom(roomId, relay, client.clientId);
```
The existing relay already excludes the sender (so the presenter does not echo their own `view-sync` back to themselves). Clients filter `view-sync` by `senderId === followingClientId` to ignore syncs from non-leaders.

> **Note**: `follow-accept` is kept as a client-to-presenter signal (logged for analytics or future use) but the server treats it as a standard relay. The server does not need to track who is following whom.

### 13. Wire `getViewport()` and `applyViewport()` through `AppContext` callbacks
In `lib/sketchgit/coordinators/appContext.ts`, add two optional callbacks:
```typescript
export interface CollaborationCallbacks {
  // … existing callbacks …
  /** Return the current canvas viewport transform. */
  getViewport: () => ViewportTransform;
  /** Apply a viewport transform received from a presenter. */
  applyViewport: (vpt: ViewportTransform) => void;
  /** Checkout a branch by name (delegate to BranchCoordinator). */
  checkoutBranch?: (branch: string, headSha: string | null) => void;
}
```

In `lib/sketchgit/app.ts`, wire the new callbacks:
```typescript
// In app.ts, `branch` is the BranchCoordinator instance:
// const branch = new BranchCoordinator(ctx, refresh);
const collab = new CollaborationManager(ws, {
  // … existing callbacks …
  getViewport: () => canvas.getViewport(),
  applyViewport: (vpt) => canvas.applyViewport(vpt),
  checkoutBranch: (branchName, headSha) => {
    branch.checkoutBranchByName(branchName, headSha);
  },
});

// Wire auto-exit follow mode on user interaction:
canvas.onUserInteraction = () => {
  if (collab.isFollowing()) {
    collab.unfollowPresenter();
  }
};
```

### 14. Add `checkoutBranchByName()` to `BranchCoordinator`
A lightweight method that performs the checkout when called from outside the modal:
```typescript
checkoutBranchByName(name: string, headSha: string | null): void {
  const { git, canvas } = this.ctx;
  if (!git.branches[name]) return; // branch not in local state
  git.checkout(name);
  const sha = headSha ?? git.branches[name];
  const c = sha ? git.commits[sha] : null;
  if (c) canvas.loadCanvasData(c.canvas);
  canvas.clearDirty();
  this.refresh();
  showToast(`Switched to branch '${name}'`);
  this.ctx.ws.send({ type: 'branch-update', branch: name, headSha: sha, isRollback: false });
  this.ctx.ws.send({ type: 'profile', name: this.ctx.ws.name, color: this.ctx.ws.color, branch: name, headSha: sha ?? null });
}
```

### 15. Expose `isFollowing()` and `isPresenting()` as public methods
```typescript
isFollowing(): boolean { return this.followingClientId !== null; }
isPresenting(): boolean { return this._isPresenting; }
```

### 16. Clean up on `destroy()` / `disconnect()`
```typescript
// In collaborationManager.ts destroy():
if (this.viewSyncTimer !== null) {
  clearInterval(this.viewSyncTimer);
  this.viewSyncTimer = null;
}
this._isPresenting = false;
this.followingClientId = null;
this._lastPromptedBranch = null;
```

### 17. Update i18n messages
`messages/en.json`:
```json
"collab": {
  ...
  "startPresenting": "📡 Present to Everyone",
  "stopPresenting": "⏹ Stop Presenting",
  "followingLabel": "👁 Following {name}",
  "unfollow": "Unfollow",
  "followRequest": "📡 {name} is presenting.",
  "followCta": "Follow",
  "dismiss": "Dismiss",
  "presenterSwitchedBranch": "Presenter switched to ⎇ {branch}",
  "switchBranch": "Switch",
  "stayHere": "Stay Here",
  "presentingStarted": "📡 You are now presenting. Peers can follow your view.",
  "presentingStopped": "Presentation stopped.",
  "presenterStopped": "📡 Presenter has stopped sharing their view."
}
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `lib/sketchgit/types.ts` | Add 4 new `WsMessageType` values; add `ViewportTransform` type and `ViewSyncPayload` interface |
| `lib/api/wsSchemas.ts` | Add Zod schemas for `follow-request`, `follow-accept`, `follow-stop`, `view-sync` |
| `lib/sketchgit/canvas/canvasEngine.ts` | Add `getViewport()`, `applyViewport()`, `onUserInteraction` callback |
| `lib/sketchgit/realtime/collaborationManager.ts` | Add presenter/follower state; `startPresenting()`, `stopPresenting()`, `followPresenter()`, `unfollowPresenter()`; handle new message types; update `updateCollabUI()` and `destroy()` |
| `lib/sketchgit/coordinators/appContext.ts` | Add `getViewport`, `applyViewport`, `checkoutBranch` to `CollaborationCallbacks` |
| `lib/sketchgit/coordinators/branchCoordinator.ts` | Add `checkoutBranchByName()` |
| `lib/sketchgit/app.ts` | Wire new callbacks; register `canvas.onUserInteraction` |
| `messages/en.json` | Add presenter-mode i18n keys |
| `messages/de.json` | Add German translations |
| `server.ts` | Add 4 new types to relay logic (no structural server change needed) |

## Additional Considerations

### `view-sync` frequency and P059 / P073
At 8 Hz (every 125 ms), a presenter generates one `view-sync` message per tick. Each message is ~80 bytes (6 floats + branch string). With 5 followers, the server relays 5 × 8 = 40 `view-sync` messages per second. After P059 WebSocket compression, the repeated structure compresses to ~30 bytes per message. After P073 batching, multiple messages within a tick may be coalesced. The bandwidth impact is negligible (< 1 KB/s per presenter).

### `view-sync` skipping when viewport is unchanged
If the presenter is not moving (static view), the timer still fires every 125 ms. Add a "dirty" check to skip the send when the viewport has not changed since the last transmission:
```typescript
private _lastSentVpt: ViewportTransform | null = null;

// In the viewSyncTimer callback:
const vpt = this.callbacks.getViewport();
if (this._lastSentVpt && vpt.every((v, i) => Math.abs(v - this._lastSentVpt![i]) < 0.001)) return; // no change
this._lastSentVpt = vpt;
this.ws.send({ type: 'view-sync', vpt, branch, headSha });
```
This reduces `view-sync` messages to zero when the presenter is idle, and resumes only when they pan or zoom.

### Multiple simultaneous presenters
The current design allows only one presenter per session from the client's perspective — a client can only follow one presenter at a time (`followingClientId` is a single value). However, the server imposes no restriction on how many clients send `follow-request` simultaneously. If two users start presenting at once, each room peer will see two follow-request toasts and can independently follow either presenter. The second presenter's `view-sync` messages are ignored by clients following the first presenter (filtered by `senderId`). This is an acceptable edge case; a future enhancement could show an indicator when two presenters are active simultaneously.

### VIEWER role restriction
Write-restricted VIEWER clients (P034) should be allowed to use presenter mode — showing a read-only view is still a valid use case. The existing write-permission check in `server.ts` only applies to `draw`, `draw-delta`, `commit`, and `branch-update`. The four new message types should not be added to that check.

### Auto-exit precision: zoom vs. pan
The `onUserInteraction` callback in `CanvasEngine` is fired on `mousedown` events (the start of any drawing gesture). Zoom (mouse wheel) and alt+drag panning must also trigger it. Add the callback to the `mouse:wheel` handler and the `mouse:move` handler when the canvas is in pan mode (alt held or middle-mouse-drag):
```typescript
// In onMouseWheel():
this.onUserInteraction?.(); // ← zoom = user is navigating independently
```
> **Important**: `onUserInteraction` must NOT fire when `applyViewport()` is called (that is the system applying a remote viewport, not a user gesture). Ensure `applyViewport()` does not trigger `requestRenderAll` via an event path that reaches `onUserInteraction`.

### Privacy and consent
`follow-request` is broadcast to the entire room (all connected WebSocket clients). In a public room, any anonymous user will receive the follow-request toast. This is acceptable — public rooms are opt-in shared spaces. For private rooms (P034), the audience is already restricted to authenticated members. Acceptance of the follow-request is entirely opt-in; no client is forced to follow.

### Follower branch mismatch and canvas data
When a follower switches to the presenter's branch via the `_showBranchFollowToast()` action, the branch checkout call (`checkoutBranchByName`) may require canvas data for a commit SHA that has not been synced to the follower's client yet (e.g., a very recent commit not yet replayed). The `fullsync-request` mechanism (P048) handles this: if the commit data is absent locally, the client can request a full sync from the server to obtain the latest canvas state for that branch.

## Testing Requirements

### Unit tests (`lib/sketchgit/realtime/collaborationManager.test.ts`)
- `startPresenting()` sets `_isPresenting = true`, calls `ws.send({ type: 'follow-request' })`, and starts the view-sync timer.
- `stopPresenting()` clears the timer, sets `_isPresenting = false`, and calls `ws.send({ type: 'follow-stop' })`.
- Receiving `follow-stop` from the followed client sets `followingClientId = null`.
- Receiving `view-sync` from `followingClientId` calls `callbacks.applyViewport(vpt)`.
- Receiving `view-sync` from a non-followed client does NOT call `callbacks.applyViewport()`.
- `unfollowPresenter()` sets `followingClientId = null` and calls `ws.send({ type: 'follow-stop' })`.
- `destroy()` clears the `viewSyncTimer` and resets presenter/follower state.

### Unit tests (`lib/sketchgit/canvas/canvasEngine.test.ts`)
- `getViewport()` returns the `canvas.viewportTransform` as a 6-tuple.
- `applyViewport([1,0,0,1,100,50])` calls `canvas.setViewportTransform` with the correct value.
- `onUserInteraction` is called on `mousedown`.

### Integration / E2E (`e2e/collab.spec.ts`)
- Client A clicks "Present to Everyone"; Client B's collab panel shows a follow-request toast.
- Client B clicks "Follow"; Client A pans the canvas; Client B's viewport follows.
- Client B scrolls the mouse wheel; Client B exits follow mode (viewport becomes independent).
- Client A clicks "Stop Presenting"; Client B receives a "presenter stopped" toast.

## Dependency Map
- Builds on: P001 ✅ (module decomposition), P004 ✅ (WsClient), P017 ✅ (coordinators + AppContext callbacks pattern), P020 ✅ (cleanup in destroy()), P031 ✅ (WS validation — new message types added to schema), P053 ✅ (branch-update — reused for branch follow)
- Builds on (same PR): P079 (cross-branch peer visibility — `checkoutBranch` callback reuses `checkoutBranchByName` pattern established there)
- Complements: P073 (WS batching — `view-sync` messages benefit from batching with cursor messages), P063 (Copilot instructions — new convention: `callbacks.getViewport()` pattern documented)
- Independent of: database, Redis, auth, Next.js build pipeline
