# P001 – Decompose the Monolithic Engine into Modules

## Title
Decompose the Monolithic Engine into Modules

## Brief Summary
The entire application logic—canvas drawing, Git model, 3-way merge, WebSocket collaboration, timeline rendering, and all modal UI—lives in a single file of 1,449 lines. Splitting it into focused, single-responsibility modules will make every area easier to understand, test, reuse, and extend.

## Current Situation
`lib/sketchgit/createSketchGitApp.ts` is a single factory function that bundles the following responsibilities together without any structural separation:

| Subsystem | Approximate Lines |
|-----------|:-----------------:|
| Object UUID tracking | ~5–46 |
| 3-way merge engine | ~55–220 |
| Conflict resolution modal | ~278–400 |
| Git model (commits, branches, checkout) | ~425–542 |
| Canvas / Fabric.js integration | ~548–780 |
| Drawing tools & event handlers | ~780–847 |
| Timeline SVG renderer | ~847–942 |
| Toast & utility helpers | ~942–1,017 |
| Commit / branch / name modals | ~1,017–1,130 |
| WebSocket / real-time collaboration | ~1,130–1,350 |
| Merge modal & conflict chooser | ~1,350–1,394 |
| Bootstrap / `init()` | ~1,394–1,416 |

The file also carries `// @ts-nocheck` at the top, disabling all TypeScript checks across all 1,449 lines.

## Problem with Current Situation
- **Cognitive overload**: Any change requires reading through an irrelevant sea of code to locate the right section.
- **Zero testability**: Business-critical logic (merge algorithm, Git graph) cannot be unit-tested because it is entangled with DOM operations and closed over mutable variables.
- **No reusability**: The merge engine, for example, could serve as an independent library, but it cannot be imported or used outside the factory.
- **Dangerous global state**: Dozens of mutable variables (`canvas`, `git`, `socket`, `currentTool`, etc.) share the same scope, making reasoning about state extremely difficult and creating hidden coupling between subsystems.
- **Refactoring risk**: Any modification can unintentionally affect unrelated behaviour due to shared scope.
- **Slow development**: New contributors must understand the entire file before safely making any change.

## Goal to Achieve
Reorganize the code into a clean, layered module structure where each file has a single, well-defined responsibility. The application behaviour should remain identical, but every subsystem should be independently importable, testable, and replaceable.

## What Needs to Be Done

### 1. Define a module structure
```
lib/sketchgit/
├── types.ts                    # Shared interfaces & type aliases
├── git/
│   ├── gitModel.ts             # Commit graph, branch map, HEAD, detached state
│   ├── mergeEngine.ts          # threeWayMerge(), findLCA(), diffObjects()
│   └── objectIdTracker.ts      # ensureObjId(), buildObjMap()
├── canvas/
│   ├── canvasEngine.ts         # Fabric.js setup & teardown, tool activation
│   ├── drawingTools.ts         # Per-tool mouse-down/move/up handlers
│   └── canvasSerializer.ts     # toJSON / fromJSON helpers
├── realtime/
│   ├── wsClient.ts             # WebSocket connection, reconnect logic
│   └── collaborationManager.ts # Message routing, cursor rendering, presence
├── ui/
│   ├── timelineRenderer.ts     # SVG git-history visualization
│   ├── modals.ts               # Commit, branch, merge, conflict, name modals
│   └── toast.ts                # showToast() helper
└── app.ts                      # Thin orchestrator (replaces createSketchGitApp.ts)
```

### 2. Remove `@ts-nocheck`
Enable TypeScript on a file-by-file basis as each module is extracted. Start with pure-logic files (merge engine, Git model) where types are easiest to add.

### 3. Introduce explicit interfaces
Define `Commit`, `Branch`, `GitState`, `CanvasSnapshot`, `Conflict`, `PeerMessage`, and related types in `types.ts` and reference them from all modules.

### 4. Replace closed-over mutable state with explicit objects
Pass state as arguments or encapsulate it in small classes/stores rather than relying on shared closure variables.

### 5. Update the React wrapper
`components/SketchGitApp.tsx` currently imports and calls the single factory function. Update it to instantiate the thinner `app.ts` orchestrator, which in turn composes the individual modules.

### 6. Migrate incrementally
Extract one subsystem at a time, running the application manually and running any new tests after each extraction, to avoid regressions.

## What Components Are Affected
| Component | Impact |
|-----------|--------|
| `lib/sketchgit/createSketchGitApp.ts` | Split into ~12 new files; file itself replaced by thin `app.ts` |
| `components/SketchGitApp.tsx` | Update import path and instantiation call |
| `components/sketchgit/types.ts` | Merge with new `lib/sketchgit/types.ts` |
| All future test files | Enabled by this refactoring |

## Additional Considerations

### Migration strategy
An "extract-and-delegate" pattern is safest: keep the original function shell for a transitional period and have it call into the newly extracted modules. Once all modules are extracted and verified, remove the shell.

### Expected outcomes
- Individual modules are typically 50–150 lines.
- The merge engine and Git model can each have their own test files.
- IDE tooling (go-to-definition, find-references, rename) becomes fully reliable.
- Onboarding time for new contributors drops significantly.

### Risk
- Medium: Internal variable coupling in the current file means some extraction steps will require careful rewiring. Comprehensive manual testing (or automated tests added in P002) is essential alongside this work.
