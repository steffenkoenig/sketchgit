# P052 – Broadcast Merge Commits to Peers and Persist Them to the Database

## Title
Fix Missing WebSocket Broadcast for Merge Commits: Both Clean and Conflict-resolved Merges Are Never Relayed to Peers or Persisted

## Brief Summary
When a user performs a merge (either a clean 3-way merge or a conflict-resolved merge with manual property choices), the `MergeCoordinator` creates a new commit in the local `GitModel.commits` Map and updates the branch pointer, but never calls `ws.send({ type: 'commit', ... })`. As a result:
1. **Peers never receive the merge commit** — their timelines remain frozen at the pre-merge state.
2. **The server never receives the `commit` message** — the merge commit is not persisted to the database.
3. **Any peer who disconnects and reconnects** will receive the DB snapshot on reconnect (P048), which does not include the merge commit because it was never written.

By contrast, `commitCoordinator.ts`'s `doCommit()` correctly calls `ws.send({ type: 'commit', sha, commit: git.commits[sha] })` after creating the commit. The merge coordinator simply omits the equivalent broadcast.

## Current Situation
### `doMerge()` — clean merge (no peer notification)
```typescript
// mergeCoordinator.ts, doMerge()
if ('done' in result) {
  canvas.loadCanvasData(git.commits[git.branches[git.HEAD]].canvas);
  canvas.clearDirty();
  this.refresh();
  showToast(`✓ Merged '${src}' into '${git.HEAD}'`);
  // ← NO ws.send() here
}
```

### `applyMergeResolution()` — conflict-resolved merge (no peer notification)
```typescript
// mergeCoordinator.ts, applyMergeResolution()
git.commits[sha] = {
  sha, parent: targetSHA, parents: [targetSHA, sourceSHA],
  message: `Merge '${sourceBranch}' into '${targetBranch}' (${conflicts.length} conflict(s) resolved)`,
  ts: Date.now(), canvas: mergedData, branch: targetBranch, isMerge: true,
};
git.branches[targetBranch] = sha;
canvas.loadCanvasData(mergedData);
canvas.clearDirty();
closeModal('conflictModal');
this.pendingMerge = null;
this.refresh();
showToast(`✓ Merge complete — ${conflicts.length} conflict(s) resolved`);
// ← NO ws.send() here either
```

### Correct pattern — from `commitCoordinator.ts`
```typescript
// commitCoordinator.ts, doCommit() — the correct pattern
const sha = git.commit(canvas.getCanvasData(), msg);
if (!sha) return;
closeModal('commitModal');
canvas.clearDirty();
this.refresh();
showToast(`✓ Committed: ${msg}`);
ws.send({ type: 'commit', sha, commit: git.commits[sha] });  // ← broadcast + persist
```

## Problem with Current Situation
1. **Silent peer divergence**: After a merge, the merging user's timeline shows the merge commit; all other users' timelines do not. The two views never converge without a full page reload. In a collaborative session with 5 participants, 4 of them can never see the merged state.
2. **Lost persistence**: Because the `commit` message is never sent to the server, `dbSaveCommit` is never called for merge commits. If the merging user closes their browser, the merge commit is gone permanently. A reconnecting user will see the pre-merge branch state from the database.
3. **Branch pointer divergence**: The merge advances the target branch pointer (`git.branches[targetBranch] = sha`). Peers still have the old branch pointer. When they commit next, their commits will have a different parent SHA than what the server's branch table records, creating a detached or orphaned commit chain.
4. **Inconsistency within the codebase**: Regular commits are broadcast (doCommit), but merge commits are not. This inconsistency is surprising to maintainers and creates two classes of commits with different persistence and broadcast behavior.
5. **P048 interaction**: Even when P048 (server-authoritative fullsync for every client) is implemented, it cannot help if the merge commit was never persisted. A reconnecting client would still receive the pre-merge snapshot from the database.

## Goal to Achieve
1. After a clean merge in `doMerge()`, call `ws.send({ type: 'commit', sha: result.sha, commit: git.commits[result.sha] })`.
2. After a conflict-resolved merge in `applyMergeResolution()`, call `ws.send({ type: 'commit', sha, commit: git.commits[sha] })`.
3. Expose `ws` to `MergeCoordinator` via `AppContext` (it is already available: `ctx.ws`).
4. Ensure the server-side `commit` handler in `server.ts` correctly persists merge commits (it already does — `commitData.isMerge` is stored).

## What Needs to Be Done

### 1. Add `ws.send()` to `doMerge()` in `mergeCoordinator.ts`
```typescript
doMerge(): void {
  const { git, canvas, ws } = this.ctx;  // ← add ws
  const sel = document.getElementById('mergeSourceSelect') as HTMLSelectElement | null;
  const src = sel?.value ?? '';
  closeModal('mergeModal');

  const result = git.merge(src);
  if (!result) return;

  if ('done' in result) {
    canvas.loadCanvasData(git.commits[git.branches[git.HEAD]].canvas);
    canvas.clearDirty();
    this.refresh();
    showToast(`✓ Merged '${src}' into '${git.HEAD}'`);
    // Broadcast the merge commit to peers and persist to DB
    ws.send({ type: 'commit', sha: result.sha, commit: git.commits[result.sha] });  // ← ADD
  } else if ('conflicts' in result) {
    // … conflict handling unchanged …
  }
}
```

### 2. Add `ws.send()` to `applyMergeResolution()` in `mergeCoordinator.ts`
```typescript
applyMergeResolution(): void {
  if (!this.pendingMerge) return;
  const { git, canvas, ws } = this.ctx;  // ← add ws
  // … existing resolution logic …

  const sha = git.generateSha();
  git.commits[sha] = { … };
  git.branches[targetBranch] = sha;

  canvas.loadCanvasData(mergedData);
  canvas.clearDirty();
  closeModal('conflictModal');
  this.pendingMerge = null;
  this.refresh();
  showToast(`✓ Merge complete — ${conflicts.length} conflict(s) resolved`);

  // Broadcast the conflict-resolved merge commit to peers and persist to DB
  ws.send({ type: 'commit', sha, commit: git.commits[sha] });  // ← ADD
}
```

### 3. Verify AppContext includes `ws` (it already does)
```typescript
// appContext.ts — ws is already in the context
export interface AppContext {
  git: GitModel;
  canvas: CanvasEngine;
  collab: CollaborationManager;
  ws: WsClient;  // ← already present
}
```

No AppContext changes needed. `MergeCoordinator` already receives `ctx` which includes `ws`.

### 4. Tests
```typescript
// mergeCoordinator.test.ts additions
it('doMerge (clean): sends commit message to ws after successful merge', () => {
  // Setup git with two branches that can be clean-merged
  // …
  coord.doMerge();
  expect(mockWs.lastSent.type).toBe('commit');
  expect(mockWs.lastSent.commit.isMerge).toBe(true);
});

it('applyMergeResolution: sends commit message to ws after conflict resolution', () => {
  // Setup pending merge with one conflict, resolve it
  // …
  coord.applyMergeResolution();
  expect(mockWs.lastSent.type).toBe('commit');
  expect(mockWs.lastSent.commit.isMerge).toBe(true);
  expect(mockWs.lastSent.commit.parents).toHaveLength(2);
});
```

## Components Affected
| Component | Change |
|-----------|--------|
| `lib/sketchgit/coordinators/mergeCoordinator.ts` | Add `ws.send(...)` in `doMerge()` and `applyMergeResolution()` |
| `lib/sketchgit/coordinators/mergeCoordinator.test.ts` | Add tests verifying ws.send is called with merge commit |

## Data & Database Model
No schema changes. The fix ensures merge commits flow through the same `commit` message path as regular commits, which already has full persistence support via `dbSaveCommit`.

## Testing Requirements
- Clean merge: `ws.send` called with `{ type: 'commit', commit: { isMerge: true, parents: [sha1, sha2] } }`.
- Conflict merge: `ws.send` called with `{ type: 'commit', commit: { isMerge: true, message: '...conflict(s) resolved' } }`.
- No regression: `doCommit()` still sends its own `ws.send` (unchanged behavior).
- Server-side: when `isMerge: true` arrives in a WS commit message, `dbSaveCommit` stores it (already works — no server changes needed).

## Estimated Effort
**Trivial** (30 minutes):
- 2 lines added to `doMerge()` 
- 2 lines added to `applyMergeResolution()`
- Unit tests: 45 minutes

## Dependency Map
- Depends on: P017 ✅ (MergeCoordinator exists, AppContext has ws), P004 ✅ (WsClient.send() available)
- Complements: P048 (server-authoritative fullsync — merge commits are now persisted, so the DB snapshot includes them)
- Severity: **High** — without this fix, merge commits are silently ephemeral in collaborative sessions
