# BUG-014 – Clicking a branch label in the timeline SVG doesn't notify peers

**ID**: BUG-014  
**Severity**: Low  
**File**: `lib/sketchgit/coordinators/timelineCoordinator.ts`  
**Reported**: 2026-03-12

---

## Summary

There are two ways to switch branches in the UI:

1. **Branch Modal** (`BranchCoordinator.openBranchModal()`) — clicking an item sends both a `branch-update` message and a `profile` message to the server. ✅
2. **Timeline SVG label click** (`TimelineCoordinator.render()`) — clicking a branch label in the commit graph performs the local checkout but sends **no** WebSocket messages. ❌

Because no `branch-update` or `profile` message is sent, peers' presence panels and branch modals continue to show the clicking user on their previous branch until some other message (e.g. the next cursor move or commit) implicitly updates it — or never, for idle users.

---

## Affected Code

```typescript
// lib/sketchgit/coordinators/timelineCoordinator.ts  lines 72-91
renderTimeline(
  git,
  (sha, x, y) => this.onCommitClick?.(sha, x, y),
  (name) => {                              // ← onBranchClick callback
    git.checkout(name);
    const c = git.commits[git.branches[name]];
    if (c) canvas.loadCanvasData(c.canvas);
    canvas.clearDirty();
    this.updateUI();
    this.render();
    showToast(`Switched to '${name}'`);
    // ❌ No ws.send({ type: 'branch-update', ... })
    // ❌ No ws.send({ type: 'profile', ... })
  },
  scrollLeft,
  viewportWidth,
);
```

Compare with the equivalent handler in `BranchCoordinator.openBranchModal()`:

```typescript
// lib/sketchgit/coordinators/branchCoordinator.ts  lines 103-115
item.addEventListener('click', () => {
  const branchTip = git.branches[name];
  git.checkout(name);
  const c = git.commits[branchTip];
  if (c) canvas.loadCanvasData(c.canvas);
  canvas.clearDirty();
  closeModal('branchModal');
  this.refresh();
  showToast(`Switched to branch '${name}'`);
  // ✅ Both messages sent:
  this.ctx.ws.send({ type: 'branch-update', branch: name, headSha: branchTip, isRollback: false });
  this.ctx.ws.send({ type: 'profile', name: this.ctx.ws.name, color: this.ctx.ws.color, branch: name, headSha: branchTip ?? null });
});
```

---

## How to Reproduce

1. Open the canvas in two browser windows (A and B) connected to the same room.
2. In window A, click the branch label of a non-active branch in the timeline SVG graph.
3. Window A's toolbar switches to that branch.
4. In window B, open the Collab panel or the Branch modal.
   - **Expected**: User A shows the new branch.
   - **Actual**: User A still shows their previous branch.

---

## Root Cause

The `onBranchClick` callback in `TimelineCoordinator.render()` was never wired up to send WebSocket messages. The `BranchCoordinator` handler was added separately and includes the notifications; the timeline click path was not updated to match.

---

## Fix

Send the same two messages that `BranchCoordinator.openBranchModal()` sends:

```typescript
// lib/sketchgit/coordinators/timelineCoordinator.ts — in render()
(name) => {
  const { git, canvas, ws } = this.ctx;
  const branchTip = git.branches[name];
  git.checkout(name);
  const c = git.commits[branchTip];
  if (c) canvas.loadCanvasData(c.canvas);
  canvas.clearDirty();
  this.updateUI();
  this.render();
  showToast(`Switched to '${name}'`);
  // Notify peers of the branch switch (P053 / P079)
  ws.send({ type: 'branch-update', branch: name, headSha: branchTip ?? '', isRollback: false });
  ws.send({ type: 'profile', name: ws.name, color: ws.color, branch: name, headSha: branchTip ?? null });
},
```

---

## Impact

- Peers' presence panels show a stale branch for the user who switched via the timeline label.
- Branch modals with peer-avatar overlays (P079) display incorrect branch information.
- Low severity because: the timeline SVG label click is a secondary checkout path (the modal is the primary one), and the stale state self-corrects the next time a `profile` update is sent (e.g. on next cursor move or page reload).
