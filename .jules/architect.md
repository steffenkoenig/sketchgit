## Refactor Target: `lib/sketchgit/canvas/canvasEngine.ts`
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
