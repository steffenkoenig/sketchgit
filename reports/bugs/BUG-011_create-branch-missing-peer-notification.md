# BUG-011 – `doCreateBranch()` doesn't notify peers of the new branch checkout

| Field | Value |
|---|---|
| **ID** | BUG-011 |
| **Severity** | Low |
| **Category** | Collaboration / Presence |
| **Status** | Open |

## Summary

`BranchCoordinator.doCreateBranch()` creates a new branch, checks it out, and updates the local UI — but never sends a `branch-update` or `profile` message to the server. Peers' presence panels continue to show the creator on their previous branch instead of the newly-created one.

By contrast, the **branch-switch** flow in `openBranchModal()` correctly sends both `branch-update` and `profile` after a checkout:

```ts
// branchCoordinator.ts openBranchModal click handler — CORRECT
this.ctx.ws.send({ type: 'branch-update', branch: name, headSha: branchTip, isRollback: false });
this.ctx.ws.send({ type: 'profile', name: ..., color: ..., branch: name, headSha: branchTip ?? null });
```

The branch-create flow is missing the equivalent notifications.

## Affected File

| File | Lines | Missing calls |
|---|---|---|
| `lib/sketchgit/coordinators/branchCoordinator.ts` | 162–173 | No `branch-update` or `profile` sent after `git.checkout(name)` |

## Root Cause

```ts
// branchCoordinator.ts lines 162-173 — MISSING branch-update and profile
doCreateBranch(): void {
  const { git } = this.ctx;
  const nameEl = document.getElementById('newBranchName') as HTMLInputElement | null;
  const name = (nameEl?.value ?? '').trim().replace(/\s+/g, '-');
  if (!name) return;
  if (!git.createBranch(name, this.branchFromSHA)) return;
  git.checkout(name);
  closeModal('branchCreateModal');
  this.refresh();
  showToast(`✓ Created & switched to '${name}'`);
  this.ctxMenuSHA = null;
  // No ws.send({ type: 'branch-update', ... }) ← MISSING
  // No ws.send({ type: 'profile', ..., branch: name }) ← MISSING
}
```

After `git.checkout(name)` the local client is now on the new branch, but the server's presence record for this client still reflects the old branch. All connected peers will continue to show the old branch in their collaboration panels and branch modals until some other update (e.g. a commit or another profile message) happens to overwrite it.

## Impact

- Peers' collaboration panels show stale branch positions after a branch create+checkout.
- The P079 branch presence dots in the branch modal remain on the old branch for the creating user.
- Severity is Low because no canvas state is corrupted and the presence discrepancy is corrected by the next `profile` message (e.g. on commit, or on sending the next draw).

## Suggested Fix

Add the same peer notifications used by the branch-switch flow:

```ts
// branchCoordinator.ts — CORRECT
doCreateBranch(): void {
  const { git, ws } = this.ctx;
  const nameEl = document.getElementById('newBranchName') as HTMLInputElement | null;
  const name = (nameEl?.value ?? '').trim().replace(/\s+/g, '-');
  if (!name) return;
  if (!git.createBranch(name, this.branchFromSHA)) return;
  git.checkout(name);
  closeModal('branchCreateModal');
  this.refresh();
  showToast(`✓ Created & switched to '${name}'`);
  this.ctxMenuSHA = null;
  // Notify peers of the new branch position
  const headSha = git.branches[name] ?? '';
  ws.send({ type: 'branch-update', branch: name, headSha, isRollback: false });
  ws.send({ type: 'profile', name: this.ctx.ws.name, color: this.ctx.ws.color, branch: name, headSha });
}
```
