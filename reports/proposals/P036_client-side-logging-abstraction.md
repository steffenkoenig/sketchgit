# P036 – Structured Client-Side Logging Abstraction

## Title
Replace Ad-hoc `console.warn` / `console.error` Calls in Client-Side Modules with a Unified Logging Abstraction

## Brief Summary
While the server-side code uses pino for structured, level-aware logging (P010), multiple client-side modules still rely on bare `console.warn` and `console.error` calls that cannot be disabled in production, carry no structure, and are invisible to any monitoring infrastructure. Introducing a thin, isomorphic logging abstraction for the client-side library code (`lib/sketchgit/`) gives developers consistent log-level control, enables structured fields (e.g. room ID, commit SHA) to be attached to every log line, and makes it straightforward to route client logs to a remote error-tracking service in the future.

## Current Situation
The following `console.*` calls exist in client-side library code (the primary scope of this proposal):

| File | Line | Call | Context |
|------|------|------|---------|
| `lib/sketchgit/realtime/collaborationManager.ts` | 261 | `console.warn(…)` | Failed to parse canvas JSON for draw-delta |
| `lib/sketchgit/realtime/collaborationManager.ts` | 327 | `console.warn(…)` | Failed to parse canvas JSON for delta apply |
| `lib/sketchgit/realtime/wsClient.ts` | 144 | `console.warn(…)` | WebSocket error; will retry on close |
| `lib/sketchgit/realtime/wsClient.ts` | 197 | `console.warn(…)` | Heartbeat timeout; closing socket |

For completeness, two additional call sites exist outside the client-side scope:
- `lib/env.ts` — intentional startup-failure notice; must remain as-is (no log level gating).
- `app/api/auth/register/route.ts` — a server-side Next.js API route that uses `console.error` for unexpected errors. This should be replaced with a pino call as a secondary clean-up task (see *Components Affected*), but it is **out of scope** for the client-side logger abstraction itself.

The `wsClient.ts` and `collaborationManager.ts` usages are the primary target: they run in the browser and produce unstructured, uncontrolled output.

Additional concerns:
- Log level cannot be adjusted at runtime. Turning off warnings in production (where the browser console may be monitored by end users) requires a code change.
- No machine-readable fields: a warning about a failed canvas JSON parse carries no room ID, commit SHA, or object count — all useful for debugging.
- No integration path to an error tracking service (Sentry, Datadog, etc.) — these typically hook into a logger abstraction, not raw `console.*`.

## Goal to Achieve
1. Create a lightweight `lib/sketchgit/logger.ts` abstraction with `debug`, `info`, `warn`, and `error` methods and support for structured fields.
2. Replace all `console.warn`/`console.error` calls in `lib/sketchgit/` with calls to the new logger.
3. Make the active log level configurable via a module-level constant or `window.__SKETCHGIT_LOG_LEVEL__` override (useful for debugging sessions).
4. Keep the implementation dependency-free (no pino in the browser bundle) and tree-shakeable.
5. Provide a hook (`logger.onError`) that third-party integrations (e.g. Sentry) can register to capture error events.

## What Needs to Be Done

### 1. Create `lib/sketchgit/logger.ts`
```typescript
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/**
 * Each method supports two call signatures:
 *  logger.warn('simple message');                          // no fields needed
 *  logger.warn({ roomId: 'abc', retries: 3 }, 'message'); // with fields
 */
export interface Logger {
  debug(msg: string): void;
  debug(fields: Record<string, unknown>, msg: string): void;
  info (msg: string): void;
  info (fields: Record<string, unknown>, msg: string): void;
  warn (msg: string): void;
  warn (fields: Record<string, unknown>, msg: string): void;
  error(msg: string): void;
  error(fields: Record<string, unknown>, msg: string): void;
}

const LEVELS: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3, silent: 4,
};

let activeLevel: LogLevel = 'warn';

export function setLogLevel(level: LogLevel): void {
  activeLevel = level;
}

type ErrorHook = (fields: Record<string, unknown>, msg: string) => void;
let errorHook: ErrorHook | null = null;

export function onError(hook: ErrorHook): void {
  errorHook = hook;
}

function log(
  level: LogLevel,
  consoleFn: (...args: unknown[]) => void,
  fieldsOrMsg: Record<string, unknown> | string,
  msg?: string,
): void {
  if (LEVELS[level] < LEVELS[activeLevel]) return;
  const fields = typeof fieldsOrMsg === 'string' ? {} : fieldsOrMsg;
  const message = typeof fieldsOrMsg === 'string' ? fieldsOrMsg : (msg ?? '');
  consoleFn(`[sketchgit:${level}]`, message, fields);
  if (level === 'error' && errorHook) errorHook(fields, message);
}

export const logger: Logger = {
  debug: (fieldsOrMsg: Record<string, unknown> | string, msg?: string) => log('debug', console.debug, fieldsOrMsg, msg),
  info:  (fieldsOrMsg: Record<string, unknown> | string, msg?: string) => log('info',  console.info,  fieldsOrMsg, msg),
  warn:  (fieldsOrMsg: Record<string, unknown> | string, msg?: string) => log('warn',  console.warn,  fieldsOrMsg, msg),
  error: (fieldsOrMsg: Record<string, unknown> | string, msg?: string) => log('error', console.error, fieldsOrMsg, msg),
};
```
The production default of `'warn'` suppresses `debug` and `info` noise. Setting `window.__SKETCHGIT_LOG_LEVEL__` in the browser console and calling `setLogLevel` enables verbose debugging without a code change.

### 2. Replace `console.warn` in `collaborationManager.ts`
```typescript
// Before:
console.warn('[CollabManager] Failed to parse canvas JSON for delta');

// After:
import { logger } from '../logger';
logger.warn({ roomId: this.currentRoomId }, 'Failed to parse canvas JSON for delta');
```
Add relevant structured fields:
- `collaborationManager.ts` → `roomId`, `clientId`, error message.
- `wsClient.ts` → `roomId`, `retryCount`, error type.

### 3. Replace `console.error` in `app/api/auth/register/route.ts`
This is a Next.js API route (server-side). Replace with pino:
```typescript
// Before:
console.error("[register] Unexpected error:", err);

// After:
import pino from 'pino';
const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });
log.error({ err }, 'register: unexpected error');
```
Or create a shared `lib/serverLogger.ts` singleton if multiple API routes need logging.

### 4. Keep `lib/env.ts` unchanged
The `console.error` calls in `lib/env.ts` are intentionally loud startup failure notices. They must not be gated behind a log level. No change required.

### 5. Tests in `lib/sketchgit/logger.test.ts`
- `warn` is suppressed when `activeLevel` is `'error'`.
- `error` calls the registered `errorHook`.
- `setLogLevel('silent')` suppresses all output.
- Structured fields are passed to the underlying `console.*` call.

### 6. Update ESLint configuration to warn on direct `console.warn`/`console.error` in `lib/sketchgit/`
```javascript
// eslint.config.mjs – within lib/sketchgit/** override:
{
  files: ['lib/sketchgit/**/*.ts'],
  rules: {
    'no-console': ['warn', { allow: [] }],
  },
}
```
This catches future regressions without breaking server-side or test code.

## Components Affected
| Component | Change |
|-----------|--------|
| `lib/sketchgit/logger.ts` | **New file** – logging abstraction |
| `lib/sketchgit/logger.test.ts` | **New file** – unit tests |
| `lib/sketchgit/realtime/collaborationManager.ts` | Replace 2× `console.warn` |
| `lib/sketchgit/realtime/wsClient.ts` | Replace 2× `console.warn` |
| `app/api/auth/register/route.ts` | Replace `console.error` with pino |
| `eslint.config.mjs` | Add `no-console` rule for `lib/sketchgit/**` |

## Data & Database Model
No data or schema changes.

## Testing Requirements
- `logger.warn` with `activeLevel = 'error'` → no `console.warn` call.
- `logger.error` → calls registered `errorHook` with correct fields.
- `logger.debug` with `activeLevel = 'debug'` → calls `console.debug`.
- `setLogLevel('silent')` → all methods are no-ops.

## Linting and Type Requirements
- `Logger` interface is exported so future modules can accept a logger as a constructor parameter (facilitating test injection without global state mutation).
- `LogLevel` type is a string literal union (not an enum) for maximum tree-shakability.
- The ESLint `no-console` rule covers only `lib/sketchgit/**` to avoid disrupting server-side or configuration files where `console.*` is appropriate.

## Dependency Map
- Depends on: P001 ✅ (module decomposition makes clear which files are client-side), P010 ✅ (pino in use server-side, pattern established)
- Enables: future integration with error-tracking services (Sentry, Datadog) via the `onError` hook
- Complements: P031 (validation errors can be logged with structured fields), P034 (access control denials can be logged with room/user context)
