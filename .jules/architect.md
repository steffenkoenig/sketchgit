## Refactor Target: `lib/sketchgit/canvas/canvasEngine.ts`
****Identified Structural Flaw:**** `canvasEngine.ts` is a massive ~3000-line monolithic file containing an enormous class (`CanvasEngine`). Several methods are overly long and complex, particularly event handlers (`onMouseDown`, `onMouseUp`, `onMouseMove`) and logic related to specific tools (like `tryConvertToSketch`, `reSnapOnModified`, and arrow/line attachments).
****Impact on Maintainability:**** This structural bloat causes high cognitive friction. The tight coupling of rendering, state management, event handling, and specialized tool logic within a single class blocks modular testing and slows down onboarding for new developers.
****The Clean Architecture Blueprint:**** Decompose the monolith. Extract specific tool behaviors (e.g., arrow snapping, sketching) into separate modules or strategy classes. Move property panel syncing out of the core engine. Group related event handlers into decoupled interaction controllers.
****Verification & Refactor Logic:****
1. Identify the largest and most complex methods in `CanvasEngine` (e.g., `reSnapOnModified`, `syncPropertiesPanelToSelection`, `tryConvertToSketch`).
2. Extract specialized logic (like sketchy path generation or arrow group building) into separate utility functions or dedicated classes outside of `CanvasEngine.ts`.
3. Ensure all tests still pass and verify functionality via `make test` or `npm test`.
