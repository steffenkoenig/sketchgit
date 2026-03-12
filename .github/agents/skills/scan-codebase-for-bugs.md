# Skill: Scan Codebase for Bugs

## Purpose
Systematically scan the SketchGit codebase for bugs, defects, and inconsistent implementations across all relevant source directories.

## Scan Scope

Scan all source files in the following directories, in this order:

1. `lib/sketchgit/` – Browser-side canvas engine, git model, coordinators, UI helpers
2. `lib/api/` – Zod schemas, validation helper, error codes, cache headers
3. `lib/db/` – Prisma repositories (roomRepository.ts, userRepository.ts)
4. `lib/server/` – Server-only helpers (CSP, sanitizers, rate limiter)
5. `lib/cache/` – Room snapshot cache
6. `lib/export/` – Canvas renderer and export utilities
7. `app/api/` – Next.js route handlers
8. `components/` – React components
9. `server.ts` – Custom WebSocket + HTTP server
10. `proxy.ts` – Next.js middleware

Exclude `node_modules/`, `dist/`, `.next/`, `prisma/migrations/`, and all `*.test.ts` / `*.test.tsx` files from the bug scan.

## Bug Categories to Inspect

For each file, check for all of the following categories:

### 1. Logic Errors
- Incorrect conditional logic (off-by-one, wrong operator, inverted condition)
- Missing `return` or `break` statements causing fall-through
- Functions that silently return `undefined` when a value is expected
- Incorrect array index access (e.g., reading index 0 when last element is intended)
- Incorrect handling of empty arrays or empty strings

### 2. Null / Undefined Safety
- Missing null checks before property access or method calls
- Optional chaining (`?.`) used inconsistently – present in some code paths but absent in equivalent paths
- Functions that may return `null` / `undefined` whose return value is used without a guard

### 3. Async / Promise Handling
- Promises that are not awaited (floating promises)
- Missing `try/catch` around `await` expressions in async functions that should handle errors
- Race conditions – parallel async operations that mutate shared state without guards
- Incorrect `Promise.all` vs sequential `await` usage affecting correctness (not just performance)

### 4. Type Inconsistencies
- TypeScript types that are too wide (e.g., `any` used where a narrower type is implied by the code)
- Zod schema shapes that differ from the TypeScript types they are meant to validate
- Function parameters typed as one thing but treated as another inside the function body

### 5. API / Route Defects
- Route handlers that return `NextResponse.json({ error: '...' })` directly instead of using `apiError()`
- Missing authentication checks on routes that modify data
- Missing input validation (no `validate()` call before using request body)
- Inconsistent HTTP status codes (e.g., returning 200 for a creation operation instead of 201)

### 6. WebSocket Protocol Inconsistencies
- Message types used in server.ts or client code that are not declared in `WsMessageType` in `lib/sketchgit/types.ts`
- Incoming messages processed without `safeParse` validation
- Missing relay or missing write-permission guard for a message type that modifies state

### 7. State Management Bugs
- Canvas state mutations that bypass the history stack (undo/redo not updated)
- Branch or commit pointers updated in one place but not another (partial state update)
- Coordinator methods that emit events before the state update is persisted, risking stale reads

### 8. Resource Leak / Cleanup
- Event listeners registered in a `useEffect` or class constructor without a corresponding removal
- Timers (`setInterval`, `setTimeout`) created without being stored and cleared
- WebSocket connections or Redis clients opened without a close/cleanup path

### 9. Security Defects
- User-supplied strings used in contexts that require sanitization (HTML, SQL, file paths) without going through the relevant sanitizer helper
- Secrets or sensitive data included in client-facing responses or logs
- CSRF-sensitive mutations exposed without the CSRF/origin check that `proxy.ts` provides

### 10. Module Boundary Violations
- `lib/db/prisma.ts` imported directly inside an `app/api/` route handler
- Browser-only libraries (e.g., `fabric`) imported in a server-only module
- `console.log` / `console.warn` / `console.error` used in `lib/sketchgit/**` code (should use `lib/sketchgit/logger.ts`)

## Scan Procedure

1. Use `glob` to enumerate all `.ts` and `.tsx` files in each scope directory.
2. Use `grep` to search for patterns indicative of each bug category.
3. Use `view` to read the full context of any suspicious code section before concluding it is a bug.
4. For each confirmed bug, record:
   - **Bug ID** – sequential identifier, formatted `BUG-NNN` (e.g., `BUG-001`)
   - **Category** – one of the ten categories above
   - **Severity** – `critical`, `high`, `medium`, or `low`
   - **Affected file(s) and line range(s)**
   - **Short summary** (≤ 15 words)
   - **Full description** – current behaviour, expected behaviour, reproduction steps, impact

## Severity Definitions

| Severity | Criteria |
|----------|----------|
| critical | Data loss, security breach, or application crash in a primary user flow |
| high | Incorrect output visible to users, auth bypass, or persistent state corruption |
  medium | Intermittent failures, degraded functionality, or noticeable UX defects |
| low | Code quality issue unlikely to cause runtime failure but violates a project convention |

## Output
Pass each confirmed bug entry to the **write-bug-report** skill to produce a report file, then pass all entries collectively to the **write-bug-report** skill again to produce the summary file.
