# P053 – Broadcast Branch Rollback and Branch-switch Operations to Peers

## Title
Notify Peers When a User Rolls Back a Branch or Switches to a Different Branch, Preventing Silent State Divergence

## Brief Summary
When a user performs a branch rollback (`cpRollback()`) or switches to a different branch via the branch-list modal (`openBranchModal()` → click handler), the local `GitModel` state is mutated — branch pointers are updated and the canvas is refreshed — but no WebSocket message is sent. All other peers continue to see the user drawing on the old branch or at the old branch tip. This is distinct from P052 (which covers missing broadcast for new merge *commits*): rollback and branch-switch don't create new commits, they move existing branch pointers. A new "branch-update" message type is needed to relay these pointer-only state changes to peers.

## Current Situation
### Branch rollback — no peer notification
```typescript
// commitCoordinator.ts, cpRollback()
cpRollback(): void {
  if (!this.popupSHA) return;
  const { git, canvas } = this.ctx;
  const sha = this.popupSHA;
  if (git.detached) { showToast('⚠ Not on a branch', true); this.closeCommitPopup(); return; }
  if (!confirm(`Rollback branch '${git.HEAD}' to ${sha.slice(0, 7)}? This cannot be undone.`)) return;
  this.closeCommitPopup();
  git.branches[git.HEAD] = sha;   // ← moves branch pointer
  git.detached = null;
  canvas.loadCanvasData(git.commits[sha].canvas);
  canvas.clearDirty();
  this.refresh();
  showToast('Rolled back to ' + sha.slice(0, 7));
  // ← NO ws.send() — peers never know the branch moved
}
```

### Branch switch — no peer notification
```typescript
// branchCoordinator.ts, openBranchModal() click handler
item.addEventListener('click', () => {
  git.checkout(name);              // ← changes HEAD and detached
  const c = git.commits[git.branches[name]];
  if (c) canvas.loadCanvasData(c.canvas);
  canvas.clearDirty();
  closeModal('branchModal');
  this.refresh();
  showToast(`Switched to branch '${name}'`);
  // ← NO ws.send() — peers never know HEAD changed
});
```

### Detached HEAD checkout — no peer notification
```typescript
// commitCoordinator.ts, cpCheckout()
cpCheckout(): void {
  // …
  git.checkoutCommit(sha);        // ← moves HEAD to detached SHA
  canvas.loadCanvasData(git.commits[sha].canvas);
  canvas.clearDirty();
  this.refresh();
  showToast('⤵ Viewing commit ' + sha.slice(0, 7) + ' — detached HEAD');
  // ← NO ws.send()
}
```

## Problem with Current Situation
1. **Rollback divergence**: After a rollback, the rolling-back user's branch pointer is at SHA `old`. Peers still think the branch tip is SHA `new`. If the rolling-back user then commits, their new commit's parent is `old`; peers will receive this commit with parent `old` but believe the branch is still at `new`. When peers replay the commit graph, they see a dangling commit with a parent that doesn't match any known branch tip, causing the timeline to render incorrectly.
2. **Presence confusion**: The avatar row shows each user's current status, but without HEAD/branch updates, other users cannot tell who is viewing which branch. In a multi-branch workflow, this creates confusion about which user is working on which feature.
3. **Canvas divergence during "view commit"**: When user A calls `cpCheckout()` to view an old commit, they are drawing on (or viewing) a historical canvas state. Peers see user A's cursor moving but their canvas is at the branch tip. Any `draw-delta` messages from user A during detached HEAD are applied against the wrong baseline.
4. **Asymmetric peer behavior**: Regular commits ARE broadcast (P052 will fix merges). Branches and rollbacks are not. Peers who reconnect receive the DB snapshot (which correctly records the old branch state, since rollbacks are not persisted either — they just modify the in-memory `git.branches` map without a `ws.send()` to trigger `dbSaveCommit`). This means DB state and peer state can diverge.

Note: **Branch switches (checkout) do not need DB persistence** because no new commit is created — only the HEAD pointer changes, which is already tracked in `RoomState.headBranch`. However, peers need a notification so they can update their presence display and avoid sending stale draw-delta messages.

Note: **Rollbacks DO need DB persistence** via a new mechanism. Currently `git.branches[HEAD] = sha` is a client-side pointer update with no server-side counterpart. A rollback should either (a) be re-framed as a "force-push commit" (a new commit whose content is the rolled-back canvas, to preserve the audit trail), or (b) send a dedicated `branch-update` message that the server persists as a branch pointer update.

## Goal to Achieve
1. Define a new `"branch-update"` message type in `WsMessage.WsMessageType`.
2. After `cpRollback()`, send `{ type: 'branch-update', branch: HEAD, headSha: sha }` so peers and the server update their branch pointer.
3. After `openBranchModal()` branch checkout, send `{ type: 'branch-update', branch: name, headSha: branchTip }` so peers know who is on which branch.
4. After `cpCheckout()` (detached HEAD), send `{ type: 'branch-update', branch: null, detached: sha }` so peers update the user's presence/avatar display.
5. On the server, handle `branch-update` messages: relay to peers (already handled by the generic relay in `broadcastRoom`) and optionally update `Branch.headSha` in the database for rollback operations.

## What Needs to Be Done

### 1. Add `"branch-update"` to `WsMessageType` in `types.ts`
```typescript
export type WsMessageType =
  | "welcome" | "presence" | "profile"
  | "draw" | "draw-delta"
  | "commit"
  | "cursor"
  | "ping" | "pong"
  | "fullsync-request" | "fullsync"
  | "user-left"
  | "branch-update";   // ← NEW
```

### 2. Send `branch-update` after rollback in `commitCoordinator.ts`
```typescript
cpRollback(): void {
  // … existing validation logic …
  this.closeCommitPopup();
  const { git, canvas, ws } = this.ctx;
  git.branches[git.HEAD] = sha;
  git.detached = null;
  canvas.loadCanvasData(git.commits[sha].canvas);
  canvas.clearDirty();
  this.refresh();
  showToast('Rolled back to ' + sha.slice(0, 7));
  // Notify peers that this branch's tip was rolled back
  ws.send({ type: 'branch-update', branch: git.HEAD, headSha: sha, isRollback: true });
}
```

### 3. Send `branch-update` after branch switch in `branchCoordinator.ts`
```typescript
item.addEventListener('click', () => {
  const branchTip = git.branches[name];
  git.checkout(name);
  const c = git.commits[branchTip];
  if (c) canvas.loadCanvasData(c.canvas);
  canvas.clearDirty();
  closeModal('branchModal');
  this.refresh();
  showToast(`Switched to branch '${name}'`);
  // Notify peers of HEAD change (no new commit; peers update presence display)
  ws.send({ type: 'branch-update', branch: name, headSha: branchTip, isRollback: false });
});
```

### 4. Send `branch-update` after detached HEAD checkout in `commitCoordinator.ts`
```typescript
cpCheckout(): void {
  // …
  git.checkoutCommit(sha);
  canvas.loadCanvasData(git.commits[sha].canvas);
  canvas.clearDirty();
  this.refresh();
  showToast('⤵ Viewing commit ' + sha.slice(0, 7) + ' — detached HEAD');
  ws.send({ type: 'branch-update', branch: null, headSha: sha, detached: true });
}
```

### 5. Handle `branch-update` in `collaborationManager.ts`
```typescript
case 'branch-update': {
  // When a peer rolls back a branch, update our local branch pointer
  if (data.isRollback && typeof data.branch === 'string' && typeof data.headSha === 'string') {
    this.cb.applyBranchUpdate(data.branch as string, data.headSha as string);
  }
  // Trigger presence/timeline refresh regardless (HEAD may have changed)
  this.cb.renderTimeline();
  this.cb.updateUI();
  break;
}
```

A new `applyBranchUpdate` callback is added to `CollabCallbacks`:
```typescript
export interface CollabCallbacks {
  // … existing …
  /** Apply a branch pointer update from a peer (used for rollback relay). */
  applyBranchUpdate: (branch: string, headSha: string) => void;
}
```

In `app.ts`, wire the callback:
```typescript
applyBranchUpdate: (branch, headSha) => {
  git.branches[branch] = headSha;
  tl.refresh();
},
```

### 6. Server: persist rollback branch pointer update in `server.ts`
Add handling for `branch-update` messages with `isRollback: true`:
```typescript
if (message.type === 'branch-update' && message.isRollback && message.branch && message.headSha) {
  // Update the Branch record to reflect the rolled-back head
  await prisma.branch.update({
    where: { roomId_name: { roomId, name: message.branch as string } },
    data: { headSha: message.headSha as string },
  }).catch(err => logger.warn({ roomId, err }, 'branch-update: failed to persist rollback'));
}
```

### 7. Tests
```typescript
// commitCoordinator.test.ts
it('cpRollback: sends branch-update message after rollback', () => { /* … */ });
it('cpCheckout: sends branch-update message with detached: true', () => { /* … */ });

// branchCoordinator.test.ts
it('branch checkout: sends branch-update message after switch', () => { /* … */ });

// collaborationManager.test.ts
it('branch-update with isRollback: calls applyBranchUpdate callback', () => { /* … */ });
```

## Components Affected
| Component | Change |
|-----------|--------|
| `lib/sketchgit/types.ts` | Add `"branch-update"` to `WsMessageType` |
| `lib/sketchgit/coordinators/commitCoordinator.ts` | Send `branch-update` in `cpRollback()` and `cpCheckout()` |
| `lib/sketchgit/coordinators/branchCoordinator.ts` | Send `branch-update` in branch-click handler |
| `lib/sketchgit/realtime/collaborationManager.ts` | Handle `branch-update` message; add `applyBranchUpdate` callback |
| `server.ts` | Handle `branch-update` messages: relay + persist rollback branch pointer |

## Data & Database Model
No schema changes. The `Branch` table already stores `headSha`. Server-side handling of rollback `branch-update` messages updates this column directly.

## Testing Requirements
- `cpRollback()` sends `branch-update` with `isRollback: true`.
- `cpCheckout()` sends `branch-update` with `detached: true`.
- Branch-list click sends `branch-update` with new branch name and tip SHA.
- Receiving peer applies `isRollback=true` branch-update to their local branch map.
- Server persists rollback to `Branch.headSha`.
- Non-rollback `branch-update` is relayed to peers but not persisted (no new commit).

## Dependency Map
- Depends on: P017 ✅ (coordinators exist), P004 ✅ (WsClient.send() available), P013 ✅ (server TypeScript)
- Closely related to: P052 (missing merge commit broadcast — same root cause: state mutations without WS relay)
- Severity: **High** — rollback without peer notification permanently diverges collaborative sessions
