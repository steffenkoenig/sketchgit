# P017 – Further Decompose the app.ts Orchestrator

## Title
Further Decompose the app.ts Orchestrator into Feature-Focused Coordinators

## Brief Summary
The `lib/sketchgit/app.ts` orchestrator has grown to 699 lines since the module decomposition performed in P001. While it is significantly better than the original 1,449-line monolith, it still mixes multiple responsibilities: UI state management, event handler wiring, branch/commit/merge workflow coordination, and the public API surface exposed to the React component. Splitting it into focused coordinators reduces cognitive load, makes each workflow independently testable, and simplifies future feature additions.

## Current Situation
`lib/sketchgit/app.ts` currently handles all of the following in a single file:

| Responsibility | Approximate Lines |
|----------------|:-----------------:|
| Constructor / initialization | ~1–60 |
| Canvas event wiring (tool selection, dirty flag) | ~60–130 |
| Commit workflow (modal, save, push to DB) | ~130–220 |
| Branch creation workflow (modal, git, UI update) | ~220–290 |
| Merge workflow (modal, conflict resolution, state save) | ~290–430 |
| Checkout workflow (commit/branch switching) | ~430–490 |
| Timeline rendering and interaction | ~490–560 |
| Collaboration join/presence/sync | ~560–630 |
| Public API methods (exported to React component) | ~630–699 |

Although the underlying subsystems (GitModel, CanvasEngine, WsClient, CollaborationManager) are cleanly separated, the orchestrator has accumulated all the UI-level coordination logic between them. Any developer wanting to understand how a branch creation works must read through commit, merge, checkout, and collaboration code to find the relevant section.

## Problem with Current Situation
1. **Still too large to read at a glance**: At 699 lines, `app.ts` is the second-largest file in the project. A developer fixing a merge conflict bug must scroll past unrelated checkout and timeline code to find the right section.
2. **Mixed abstraction levels**: Low-level DOM manipulations (modal show/hide, button enable/disable) sit next to high-level orchestration (three-way merge, branch creation). This makes it unclear what the responsibilities of this layer are.
3. **Untestable workflow logic**: The commit, branch, and merge workflows are defined entirely within the constructor closure of `app.ts`. They cannot be unit-tested without instantiating the full app (canvas, WebSocket, DOM).
4. **Difficult to extend**: Adding a new workflow (e.g., a "rebase" feature or a "stash" command) requires modifying the already large `app.ts`, increasing its size further.
5. **Hard to navigate**: IDE navigation between features requires searching or scrolling; logical groupings are not reflected in file boundaries.

## Goal to Achieve
1. Reduce `app.ts` to a thin wiring layer of at most ~150 lines.
2. Extract each major workflow into its own coordinator class or module.
3. Make individual workflow coordinators independently importable and unit-testable.
4. Keep the public API surface (`createSketchGitApp`) identical so the React component requires no changes.
5. Maintain identical runtime behaviour after the refactoring.

## What Needs to Be Done

### 1. Define a shared context/dependencies object
All coordinators need access to the same subsystems. Define a shared `AppContext` interface to avoid passing many arguments:
```typescript
// lib/sketchgit/appContext.ts
export interface AppContext {
  gitModel: GitModel;
  canvasEngine: CanvasEngine;
  collaborationManager: CollaborationManager;
  wsClient: WsClient;
  roomId: string;
  userId: string | null;
}
```

### 2. Extract the commit workflow coordinator
```typescript
// lib/sketchgit/coordinators/commitCoordinator.ts
export class CommitCoordinator {
  constructor(private ctx: AppContext) {}

  async openCommitModal(): Promise<void> { ... }
  async saveCommit(message: string): Promise<void> { ... }
  async pushCommitToDB(commit: Commit): Promise<void> { ... }
}
```
This class owns all logic from "user clicks commit button" through "commit is saved, broadcast, and timeline updated".

### 3. Extract the branch coordinator
```typescript
// lib/sketchgit/coordinators/branchCoordinator.ts
export class BranchCoordinator {
  constructor(private ctx: AppContext) {}

  async createBranch(name: string): Promise<void> { ... }
  async checkoutBranch(name: string): Promise<void> { ... }
  updateBranchSelector(): void { ... }
}
```

### 4. Extract the merge coordinator
```typescript
// lib/sketchgit/coordinators/mergeCoordinator.ts
export class MergeCoordinator {
  constructor(private ctx: AppContext) {}

  async openMergeModal(): Promise<void> { ... }
  async executeMerge(targetBranch: string): Promise<void> { ... }
  async resolveConflicts(resolutions: ConflictResolution[]): Promise<void> { ... }
}
```
The merge coordinator is the most complex workflow and is the biggest beneficiary of isolation—it currently interleaves modal UI, git model calls, canvas updates, and WebSocket broadcasts.

### 5. Extract the collaboration coordinator
```typescript
// lib/sketchgit/coordinators/collaborationCoordinator.ts
export class CollaborationCoordinator {
  constructor(private ctx: AppContext) {}

  async joinRoom(): Promise<void> { ... }
  handleFullSyncRequest(): void { ... }
  handlePeerCommit(payload: CommitPayload): void { ... }
}
```

### 6. Extract the timeline coordinator
```typescript
// lib/sketchgit/coordinators/timelineCoordinator.ts
export class TimelineCoordinator {
  constructor(private ctx: AppContext) {}

  render(): void { ... }
  onCommitClick(sha: string): void { ... }
}
```

### 7. Slim down app.ts to a wiring layer
```typescript
// lib/sketchgit/app.ts (after refactoring – ~100-150 lines)
export function createSketchGitApp(config: AppConfig): SketchGitApp {
  const ctx = buildAppContext(config);
  const commit    = new CommitCoordinator(ctx);
  const branch    = new BranchCoordinator(ctx);
  const merge     = new MergeCoordinator(ctx);
  const collab    = new CollaborationCoordinator(ctx);
  const timeline  = new TimelineCoordinator(ctx);

  // Wire events
  ctx.canvasEngine.on('change', () => commit.markDirty());
  ctx.wsClient.on('message', (msg) => collab.dispatch(msg));

  return {
    init:            () => collab.joinRoom(),
    openCommitModal: () => commit.openCommitModal(),
    createBranch:    (n) => branch.createBranch(n),
    mergeBranch:     (b) => merge.openMergeModal(),
    // ... other public methods
  };
}
```

### 8. Write unit tests for individual coordinators
Each coordinator's logic can now be tested by providing a mock `AppContext`:
```typescript
// lib/sketchgit/coordinators/commitCoordinator.test.ts
it('saves commit to git model and broadcasts it', async () => {
  const ctx = createMockContext();
  const coord = new CommitCoordinator(ctx);
  await coord.saveCommit('Add new shape');
  expect(ctx.gitModel.commits).toHaveLength(2); // initial + new
  expect(ctx.wsClient.sentMessages).toContainEqual(
    expect.objectContaining({ type: 'commit' })
  );
});
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `lib/sketchgit/app.ts` | Slimmed to ~150 lines; delegates to coordinators |
| `lib/sketchgit/appContext.ts` | New file: `AppContext` interface |
| `lib/sketchgit/coordinators/commitCoordinator.ts` | New file: commit workflow |
| `lib/sketchgit/coordinators/branchCoordinator.ts` | New file: branch workflow |
| `lib/sketchgit/coordinators/mergeCoordinator.ts` | New file: merge workflow |
| `lib/sketchgit/coordinators/collaborationCoordinator.ts` | New file: collaboration workflow |
| `lib/sketchgit/coordinators/timelineCoordinator.ts` | New file: timeline rendering |
| `components/SketchGitApp.tsx` | No change (public API preserved) |

## Additional Considerations

### Incremental extraction
Each coordinator can be extracted in a separate PR without touching the others. The safest order is:
1. `TimelineCoordinator` (read-only, low risk)
2. `CommitCoordinator` (self-contained, well-understood)
3. `BranchCoordinator` (small, straightforward)
4. `CollaborationCoordinator` (medium complexity)
5. `MergeCoordinator` (most complex; do last, after the others are stable)

### Dependency injection vs. closures
The coordinator pattern using an `AppContext` object is a lightweight form of dependency injection. Alternatively, plain functions (not classes) can be used if OOP is not the preferred style:
```typescript
// Functional alternative
export function createCommitCoordinator(ctx: AppContext) {
  return {
    openCommitModal: async () => { ... },
    saveCommit: async (msg: string) => { ... },
  };
}
```

### Relationship to P001
This proposal is a direct continuation of P001 (module decomposition). P001 extracted subsystems (canvas, git, realtime); this proposal extracts the workflow coordination layer that was left in `app.ts` as the remaining "glue".
