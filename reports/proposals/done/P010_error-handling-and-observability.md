# P010 – Improve Error Handling & Observability

## Title
Improve Error Handling & Observability

## Brief Summary
Errors in the application are either silently swallowed (empty `catch` blocks), printed to the browser console only, or reported via ephemeral toast notifications that disappear. There is no structured logging, no error aggregation, no performance monitoring, and no alerting. Introducing consistent error handling, structured logging on the server, and optional client-side error reporting will make production issues discoverable and debuggable.

## Current Situation

### Silent error swallowing
In `createSketchGitApp.ts`, WebSocket message parsing failures are silently ignored:
```javascript
try {
  data = JSON.parse(ev.data);
} catch (_) {
  return;  // error lost, no log, no metric
}
```

Merge failures and canvas operations have similar patterns where errors are caught but not reported.

### Console-only logging
Error information that is captured goes to `console.error()` or `console.warn()`, which:
- Is visible only to users with DevTools open.
- Is never captured, aggregated, or alerted on.
- Disappears on page refresh.
- Is inaccessible in production deployments.

### No server-side structured logging
`server.mjs` uses `console.log()` for informational messages (e.g., `"Client connected to room"`) with no structure, no log levels, no timestamps in a machine-readable format, and no way to query or analyze logs at scale.

### No performance monitoring
There is no measurement of:
- Time to render full-sync canvas state.
- WebSocket message processing latency.
- Merge algorithm execution time.
- Client-side frame rate during collaboration.

### No error boundaries in React
`components/SketchGitApp.tsx` has no React error boundary. An unhandled exception in the canvas engine or a rendering error will cause the entire React tree to unmount and show a blank page with no user-facing explanation.

### Dead code and incomplete features
The function `scrollToCommit(sha)` (around line 1011) is defined but never called. This suggests the codebase has had incomplete features abandoned in-place without cleanup, which is a maintainability concern.

## Problem with Current Situation
- **Invisible failures**: When the merge algorithm fails, when a WebSocket message is malformed, or when Fabric.js throws an exception, the user sees nothing and the developer learns nothing.
- **Undebuggable production issues**: Without structured logs or error aggregation, diagnosing a bug reported by a user requires reproducing it locally—often impossible.
- **No performance regression detection**: A code change that degrades render performance or increases message processing time is undetectable without profiling tools.
- **Poor UX on fatal errors**: A React component crash shows a blank page. Users do not know whether to refresh, wait, or report a bug.
- **Maintenance overhead**: Dead code (`scrollToCommit`, etc.) increases the mental load for anyone reading the file and creates risk of confusion during refactoring.

## Goal to Achieve
1. Ensure all errors are captured, logged with context, and surfaced appropriately.
2. Provide structured, queryable server-side logs.
3. Add a React error boundary with a user-friendly fallback UI.
4. Optionally integrate a client-side error reporting service.
5. Add lightweight performance timing for critical paths.
6. Remove dead code identified during this work.

## What Needs to Be Done

### 1. Replace silent `catch` blocks with structured handling
For every `catch (_) { return; }` pattern:
- Log the error with context (what operation was being performed, what data was involved).
- Decide whether the error is recoverable (log + continue) or fatal (log + surface to user).
- Never swallow errors silently.

**Rule of thumb:**
- Recoverable errors (e.g., malformed WebSocket message from peer): log a warning, skip the message.
- Non-recoverable errors (e.g., canvas initialization failure): log an error, show a user-facing message, optionally trigger error reporting.

### 2. Add a structured logger to the server

Install and configure `pino` (lightweight, fast, JSON output):
```javascript
import pino from 'pino';
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
```

Replace all `console.log()` / `console.error()` calls in `server.mjs` with structured log calls:
```javascript
logger.info({ roomId, clientId, event: 'client_connected' });
logger.warn({ roomId, messageType, error }, 'Failed to parse WebSocket message');
logger.error({ roomId, clientId, error }, 'Unexpected server error');
```

JSON-structured logs integrate directly with log aggregation services (Logtail, Datadog, AWS CloudWatch, etc.).

### 3. Add a React error boundary
Create `components/ErrorBoundary.tsx`:
```tsx
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { reportError(error, info); }
  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onReset={() => window.location.reload()} />;
    }
    return this.props.children;
  }
}
```

Wrap `<SketchGitApp />` in `app/page.tsx` with `<ErrorBoundary>`. The fallback UI should show a friendly message ("Something went wrong. Try refreshing the page.") with an option to report the issue.

### 4. Add client-side error reporting (optional)
Integrate a zero-cost-tier error reporting service:
- **Sentry** (most popular; free for small projects): captures unhandled exceptions with stack traces, browser/OS info, and user context.
- **Alternative**: A simple `fetch()` POST to a server endpoint that writes to the server log.

Initialize in `app/layout.tsx` and configure to sample errors rather than report every instance (to avoid rate limiting).

### 5. Add performance timing for critical paths
Use the browser's `performance.mark()` / `performance.measure()` API to time:
- Canvas full-sync processing time.
- Merge algorithm execution time.
- Commit rendering time in the timeline.

Log slow operations (> configurable threshold) as warnings. This requires no external library.

On the server side, log the processing time for WebSocket message handlers:
```javascript
const start = Date.now();
handleMessage(client, data);
const duration = Date.now() - start;
if (duration > 100) logger.warn({ duration, messageType: data.type }, 'Slow message handler');
```

### 6. Remove dead code
- Remove the unused `scrollToCommit()` function.
- Review and remove any other unreferenced functions or variables identified during P001 (module extraction).
- Add an ESLint rule (`no-unused-vars`) to prevent dead code from accumulating.

### 7. Add ESLint configuration
The project has no ESLint configuration. Add a minimal `.eslintrc.json` or `eslint.config.mjs`:
- `no-unused-vars`: catches dead code.
- `no-console`: encourages use of the structured logger instead of `console.log`.
- `@typescript-eslint/no-explicit-any`: discourages `any` (complementing P005).

### 8. Document error codes and recovery paths
After implementing structured error handling, create a brief developer reference (internal wiki or README section) listing:
- Known error conditions.
- Their expected log messages.
- Recovery steps (automated or manual).

## What Components Are Affected
| Component | Impact |
|-----------|--------|
| `lib/sketchgit/createSketchGitApp.ts` | Replace all silent `catch` blocks; add performance timing; remove dead code |
| `server.mjs` | Replace `console.*` with `pino` structured logger; log performance timings |
| `app/page.tsx` | Wrap `<SketchGitApp />` with `<ErrorBoundary>` |
| New `components/ErrorBoundary.tsx` | React error boundary with fallback UI |
| `package.json` | Add `pino` (server); optionally `@sentry/nextjs`; add ESLint + plugins |
| New `.eslintrc.json` or `eslint.config.mjs` | Lint rules for unused vars, no-console, no-explicit-any |

## Additional Considerations

### Log levels
Use the following log levels consistently:
| Level | When to use |
|-------|-------------|
| `error` | Unrecoverable failure; action could not complete |
| `warn` | Recoverable unexpected condition; action may degrade |
| `info` | Normal significant events (client connect/disconnect, commit) |
| `debug` | Detailed diagnostic information (message content, timing) |

### Correlation IDs
For each WebSocket connection, generate a unique `connectionId` and include it in every log line for that connection. This allows a complete trace of a user's session to be reconstructed from server logs.

### Pino vs Winston
`pino` is significantly faster than `winston` and produces cleaner JSON output. For a real-time WebSocket server, minimizing logger overhead is important. `pino` is the recommended choice.

### Relationship to other proposals
- **P001 (module decomposition)**: Each extracted module can implement its own structured error handling, rather than one monolithic error pattern.
- **P002 (tests)**: Error cases (malformed messages, invalid state transitions) can be verified in unit tests to ensure errors are thrown/logged correctly.
- **P007 (authentication)**: Authentication failures should be logged with `warn` level and rate-monitored for brute-force detection.
