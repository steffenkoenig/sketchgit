## Refactor Target: server.ts / wss.on("connection")
**Identified Structural Flaw:** The WebSocket connection handler `wss.on("connection", ...)` in `server.ts` is a monolithic, 280-line inline callback. It handles URL parsing, identity assignment, complex database-driven room access control, state management, history syncing, rate-limiting, and deep nested message-parsing loops.
**Impact on Maintainability:** This structural bloat causes severe cognitive friction, makes the connection logic completely un-testable in isolation without spinning up a full HTTP server, and violates the single-responsibility principle. It makes debugging connection or access-control issues significantly slower.
**The Clean Architecture Blueprint:** The refactored code extracts the inline logic into a standalone, testable `handleWsConnection` subroutine within a dedicated `lib/server/wsConnectionHandler.ts` package. This aligns with modern framework patterns where the core server file merely delegates to strongly typed, modular controllers.
**Verification & Refactor Logic:**
1. Create `lib/server/wsConnectionHandler.ts`.
2. Extract the connection parsing, access checks, fullsync delivery, and message setup logic into a new `handleWsConnection` function.
3. Replace the inline callback in `server.ts` with a delegation to `handleWsConnection`.
4. Validate changes using `npm run build:server` and `npm run test` to guarantee structural equivalence.
