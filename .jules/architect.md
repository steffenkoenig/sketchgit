## Refactor Target: lib/sketchgit/git/mergeEngine.ts
**Identified Structural Flaw:**
- **Monolithic Function Bloat:** The `threeWayMerge` function is overly long (~150 lines), violating single-responsibility and structural length limits. It handles canvas property merging, object iteration, property conflict detection, line-level merging for mermaid diagrams, and resolution packaging all in one block.
- **Cryptic Naming:** Several functions use ambiguous single-letter or short variables (`bVal`, `oVal`, `tVal`, `b`, `o`, `t`, `c`, `p`), demanding unnecessary cognitive load to determine if they represent base, ours, theirs, or parent commits.

**Impact on Maintainability:**
- **Cognitive Friction:** Developers attempting to modify conflict resolution logic (e.g., adding group merge support) must parse through 100+ lines of nested loop conditions. The obscure abbreviations mean the code doesn't self-document.
- **Testing Overhead:** It is impossible to test just the single-object conflict algorithm or the canvas-property merger without mocking the entire 3-way canvas envelope logic.

**The Clean Architecture Blueprint:**
- **Modularization:** Decompose `threeWayMerge` into isolated subroutines: `mergeCanvasProperties` (to handle root level overrides) and `mergeSingleObject` (to encapsulate the property-level diffing logic for an individual shape).
- **Self-Documenting Code:** Rename all cryptic variables systematically (`bVal` -> `baseValue`, `b` -> `baseLine`, `c` -> `commit`).
- **Idiomatic Typing:** Maintain strict type boundaries while reducing function lengths under standard thresholds.

**Verification & Refactor Logic:**
1. Develop a custom Node.js script to extract and rewrite `threeWayMerge` without triggering patch errors.
2. Ensure the extracted `mergeSingleObject` handles all `null` propagation and nested checks correctly.
3. Validate through existing comprehensive unit tests (`npx vitest run mergeEngine.test.ts`) that no behavioral regressions occurred.

## Refactor Target: [lib/sketchgit/canvas/canvasEngine.ts] — Interaction Loops
**Identified Structural Flaw:** The core event handler functions (`onMouseDown`, `onMouseMove`, `onMouseUp`) within the `CanvasEngine` class have grown into monolithic, multi-responsibility routines (over 100 lines each) handling a deeply nested matrix of conditional logic based on the currently selected tool.
**Impact on Maintainability:** This bloat significantly increases cognitive friction when attempting to add new tools or modify existing behaviors. It tightly couples the interaction logic for completely distinct features (e.g., pen strokes vs. text placement) into a single execution path, blocking modular unit testing for isolated tools.
**The Clean Architecture Blueprint:** The `CanvasEngine` interaction loops will be cleanly decomposed. The main event handlers will act strictly as routers, delegating tool-specific execution logic to isolated, private subroutines (e.g., `handleMouseDownPen`, `handleMouseMoveEraser`, `handleMouseUpShape`). This matches modern controller-delegate patterns and ensures the code self-documents its distinct logical flows.
**Verification & Refactor Logic:**
1. Extract the Pen-tool branching logic from `onMouseDown` into a dedicated `handleMouseDownPen(p)` subroutine.
2. Extract the Text and Mermaid placement logic into `handleMouseDownText(p)` and `handleMouseDownMermaid(p)`.
3. Extract generic shape generation (Rect, Ellipse, Line) into `handleMouseDownShape(p)`.
4. Apply the same decomposition strategy to `onMouseMove` (Eraser, Pen, Shape resizing) and `onMouseUp` (Pen path conversion, Shape finalization).

## Refactor Target: `lib/sketchgit/canvas/canvasEngine.ts` — Snapping
****Identified Structural Flaw:**** `canvasEngine.ts` is a massive ~3000-line monolithic file containing an enormous class (`CanvasEngine`). Several methods are overly long and complex, particularly event handlers (`onMouseDown`, `onMouseUp`, `onMouseMove`) and logic related to specific tools (like `tryConvertToSketch`, `reSnapOnModified`, and arrow/line attachments).
****Impact on Maintainability:**** This structural bloat causes high cognitive friction. The tight coupling of rendering, state management, event handling, and specialized tool logic within a single class blocks modular testing and slows down onboarding for new developers.
****The Clean Architecture Blueprint:**** Decompose the monolith. Extract specific tool behaviors (e.g., arrow snapping, sketching) into separate modules or strategy classes. Move property panel syncing out of the core engine. Group related event handlers into decoupled interaction controllers.
****Verification & Refactor Logic:****
1. Identify the largest and most complex methods in `CanvasEngine` (e.g., `reSnapOnModified`, `syncPropertiesPanelToSelection`, `tryConvertToSketch`).
2. Extract specialized logic (like sketchy path generation or arrow group building) into separate utility functions or dedicated classes outside of `CanvasEngine.ts`.
3. Ensure all tests still pass and verify functionality via `make test` or `npm test`.

## Refactor Target: server.ts / wss.on("connection")
**Identified Structural Flaw:** The WebSocket connection handler `wss.on("connection", ...)` in `server.ts` is a monolithic, 280-line inline callback. It handles URL parsing, identity assignment, complex database-driven room access control, state management, history syncing, rate-limiting, and deep nested message-parsing loops.
**Impact on Maintainability:** This structural bloat causes severe cognitive friction, makes the connection logic completely un-testable in isolation without spinning up a full HTTP server, and violates the single-responsibility principle. It makes debugging connection or access-control issues significantly slower.
**The Clean Architecture Blueprint:** The refactored code extracts the inline logic into a standalone, testable `handleWsConnection` subroutine within a dedicated `lib/server/wsConnectionHandler.ts` package. This aligns with modern framework patterns where the core server file merely delegates to strongly typed, modular controllers.
**Verification & Refactor Logic:**
1. Create `lib/server/wsConnectionHandler.ts`.
2. Extract the connection parsing, access checks, fullsync delivery, and message setup logic into a new `handleWsConnection` function.
3. Replace the inline callback in `server.ts` with a delegation to `handleWsConnection`.
4. Validate changes using `npm run build:server` and `npm run test` to guarantee structural equivalence.

## Refactor Ledger - Completion Status
- `lib/sketchgit/git/mergeEngine.ts`: **Completed**. Extracted `mergeCanvasProperties` and `mergeSingleObject`. Cryptic variable names refactored.
- `lib/sketchgit/canvas/canvasEngine.ts` (Interaction Loops): **Completed**. Extracted tool logic into specialized delegates (`handleMouseDownPen`, `handleMouseDownText`, `handleMouseDownShape`, etc.).
- `lib/sketchgit/canvas/canvasEngine.ts` (Snapping): **Completed**. Extracted `syncPropertiesPanelToSelection` into a new `UISyncManager` class in `lib/sketchgit/canvas/uiSyncManager.ts`. Also extracted `tryConvertToSketch` and `rebuildSketchPathForMove` into `lib/sketchgit/canvas/snappingLogic.ts`.
- `server.ts` / `wss.on("connection")`: **Completed**. Extracted `handleWsConnection` logic into `lib/server/wsConnectionHandler.ts` with safe type delegation and extracted functions.

Tests pass and functionality remains intact.
