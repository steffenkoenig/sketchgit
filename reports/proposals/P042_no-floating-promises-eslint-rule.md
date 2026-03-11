# P042 – Enforce `no-floating-promises` ESLint Rule to Prevent Silent Async Failures

## Title
Add the `@typescript-eslint/no-floating-promises` ESLint Rule to Catch Unhandled Promise Rejections at Compile Time

## Brief Summary
The codebase has numerous `async` function calls whose returned promises are neither `await`-ed nor `.catch()`-handled nor explicitly `void`-qualified. When these promises reject, the rejection is silently swallowed — no error is logged, no user feedback is given, and the application continues as if nothing went wrong. Adding the `@typescript-eslint/no-floating-promises` ESLint rule makes every such call a compile-time error, forcing developers to make an explicit choice: await, catch, or deliberately discard (via `void`). Combined with a one-time audit to fix all existing violations, this proposal closes a class of silent failure modes across the entire codebase.

## Current Situation
Representative examples of floating promises in the current codebase:

```typescript
// server.ts – Redis publish failures are caught but the result of publish() not awaited
redisPub.publish(…).catch((err) => {
  logger.warn(...);
}); // ← Promise not awaited; publish() rejection after catch is unhandled

// lib/sketchgit/coordinators/collaborationCoordinator.ts
canvas.init(); // ← If init() is async, rejection is silently lost

// lib/sketchgit/realtime/collaborationManager.ts (several places)
this.ws.send({ type: 'fullsync-request', senderId: this.wsClientId });
// ← send() may be async or queue a promise internally; no await

// components/SketchGitApp.tsx
useEffect(() => {
  app.call('init', {}); // ← fire-and-forget; React does not catch promise rejections in effects
}, []);
```

The ESLint configuration (`eslint.config.mjs`) does not currently include `@typescript-eslint/no-floating-promises`. The `@typescript-eslint/eslint-plugin` is already installed (version `^8.57.0`) and the parser is already configured with `project: './tsconfig.json'`, meaning type-aware rules are already supported. Enabling this rule requires only a one-line configuration change plus a fix pass on existing violations.

## Problem with Current Situation
1. **Silent failures**: An async operation (e.g. `canvas.init()`, a database write, a WebSocket send) that throws will silently fail. The user sees nothing wrong; the developer has no log entry to diagnose.
2. **Unreliable error boundary coverage**: React error boundaries (P010) only catch synchronous render-phase errors. Async rejections in effects, event handlers, and coordinators escape entirely.
3. **Misleading code reviews**: A call site that looks synchronous may actually start an async operation. Without the rule, reviewers cannot distinguish deliberate fire-and-forget from accidental omission.
4. **Inconsistent `void` usage**: Some fire-and-forget calls use `void` (e.g. `void shutdown(signal)`) while others do not, making it impossible to tell which unawaited calls are intentional.
5. **Compounding risk**: As the codebase grows, more async functions are added. Without a lint gate, the number of silent failure modes increases linearly with feature additions.

## Goal to Achieve
1. Enable `@typescript-eslint/no-floating-promises` as an ESLint `error` for all TypeScript files (except test files, which may use fire-and-forget for brevity).
2. Fix all existing violations by choosing the appropriate resolution:
   - `await` where the result matters or the caller should wait for completion.
   - `.catch((err) => logger.error(...))` where the operation is background but errors should be logged.
   - `void` prefix where intentional fire-and-forget is justified (e.g. the ping interval, the Redis publish).
3. Add `@typescript-eslint/no-misused-promises` as a companion rule to prevent passing async functions to callbacks that don't handle returned promises (e.g. `array.forEach(async fn)`).
4. Update the ESLint configuration documentation with a note explaining why these rules are enabled.

## What Needs to Be Done

### 1. Update `eslint.config.mjs`
Add to the main TypeScript rules object:
```javascript
{
  files: ["**/*.ts", "**/*.tsx"],
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      project: "./tsconfig.json",
    },
  },
  plugins: { "@typescript-eslint": tsPlugin },
  rules: {
    // Existing rules ...
    "@typescript-eslint/no-floating-promises": ["error", {
      ignoreVoid: true,      // allow `void someAsync()` for intentional fire-and-forget
      ignoreIIFE: true,      // allow `(async () => { ... })()` at module top-level
    }],
    "@typescript-eslint/no-misused-promises": ["error", {
      checksVoidReturn: {
        attributes: false,   // don't require awaiting JSX event handlers (common React pattern)
      },
    }],
  },
},
```

### 2. Audit and fix all existing violations
Expected violation categories and their resolutions:

**Category A – Fire-and-forget with no error consequence**
Add `void` prefix. Example:
```typescript
// Before:
redisPub.publish(...).catch(...);
// After:
void redisPub.publish(...).catch(...);
```

**Category B – Missing `.catch()` on background async calls**
Add error logging:
```typescript
// Before:
someAsyncOperation();
// After:
someAsyncOperation().catch((err) => logger.error({ err }, 'someAsyncOperation failed'));
```

**Category C – `useEffect` callbacks launching async work**
Wrap in a named async IIFE:
```typescript
// Before:
useEffect(() => {
  app.call('init', {});
}, [app]);
// After:
useEffect(() => {
  void (async () => {
    await app.call('init', {});
  })();
}, [app]);
```

**Category D – Event handlers returning promises to non-async callers**
Use `void` in the handler or change the parent API:
```typescript
// Before:
button.addEventListener('click', async () => { … });
// After (when rejection can be ignored):
button.addEventListener('click', () => { void (async () => { … })(); });
```

### 3. Update test files to exempt the rule
Test files often use intentional fire-and-forget (e.g. `expect(asyncFn()).rejects.toThrow()`). The existing test-file ESLint override should add:
```javascript
{
  files: ["**/*.test.ts"],
  rules: {
    "@typescript-eslint/no-floating-promises": "off",
    "@typescript-eslint/no-misused-promises": "off",
  },
}
```

### 4. Run `npm run lint` and fix all errors
The initial fix pass may uncover surprising unhandled rejections (e.g. `prisma.$disconnect()` in a test teardown). Each fix should be meaningful — not just `void` suppression.

## Components Affected
| Component | Change |
|-----------|--------|
| `eslint.config.mjs` | Add `no-floating-promises` + `no-misused-promises` rules |
| `server.ts` | Fix ~5–10 floating promise violations (Redis publish, health checks, dbSave) |
| `lib/sketchgit/coordinators/*.ts` | Fix ~3–5 violations per coordinator |
| `lib/sketchgit/realtime/collaborationManager.ts` | Fix ~3 violations |
| `components/SketchGitApp.tsx` | Fix useEffect async IIFE pattern |
| `app/api/auth/register/route.ts` | Fix any Promise escaping the handler |

## Data & Database Model
No data changes. This is a linting/code quality change only.

## Testing Requirements
This proposal improves the reliability of existing tests and new code. After applying the rule:
- `npm run lint` must pass with zero `no-floating-promises` errors.
- No existing tests should break (the fix is additive — existing logic is preserved, only error handling is made explicit).

## Linting and Type Requirements
- `@typescript-eslint/no-floating-promises` requires type-aware linting (`project: './tsconfig.json'` in `parserOptions`). This is already configured in `eslint.config.mjs`.
- `ignoreVoid: true` is essential to avoid requiring removal of all valid `void` fire-and-forget patterns.
- `@typescript-eslint/no-misused-promises` with `checksVoidReturn.attributes: false` avoids false positives on JSX `onClick={async () => {…}}` handlers (extremely common in the codebase).

## Estimated Effort
**Low** (2–4 hours):
- 5 minutes: add the two lines to `eslint.config.mjs`.
- 1–3 hours: fix all violations (estimated 30–50 violations across the codebase; each fix is a one-liner).

## Dependency Map
- Depends on: `@typescript-eslint/eslint-plugin` ✅ (already installed at v8.57.0)
- Complements: P036 (client-side logging), P010 ✅ (error observability); floating promise rejections are the most common reason errors are invisible to the logger
- Independent of all other proposals — can be implemented at any time as a standalone PR
