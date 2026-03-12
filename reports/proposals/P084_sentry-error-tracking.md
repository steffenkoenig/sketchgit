# P084 – Production Error Tracking with Sentry

## Status
Not Started

## Dimensions
Reliability · Maintainability · Observability

## Problem

SketchGit's observability stack currently consists of:
- **Server-side**: structured Pino logging (P010/P036) written to stdout.
- **Client-side**: `lib/sketchgit/logger.ts` (P036) wrapping Pino in the browser.
- **Slow-query alerts**: Prisma slow-query logging (P071).

What is **missing** is a mechanism to **aggregate, deduplicate, and alert on**
unhandled exceptions in production. Logs written to stdout are consumed only if a log
aggregation pipeline (e.g. CloudWatch, Datadog, Loki) is configured — and even then
they require manual queries to discover new errors.

Concrete pain points:

| Scenario | Current outcome |
|----------|----------------|
| An unhandled rejection in `server.ts` | Printed to stdout; no alert fired |
| A React render error not caught by P081 boundaries | Browser console; invisible to team |
| A Prisma query error in a route handler `catch` block | `console.error()` at best |
| A WebSocket message validation failure for an unknown type | Logged; no trend visible |
| A production deploy introduces a new crash type | Discovered only by user reports |

Proposal P061 covers OpenTelemetry tracing and metrics but does not cover **error
aggregation and alerting**.

## Proposed Solution

Integrate **[Sentry](https://sentry.io/)** (open-source SDK; self-hosted or cloud)
for real-time error tracking across server, API routes, and the browser client.

### Integration points

#### 1. Next.js server-side (App Router + API routes)

Use `@sentry/nextjs` SDK. Configure in `sentry.server.config.ts` and
`sentry.edge.config.ts`. All unhandled API route errors and server component errors
are automatically captured.

#### 2. Browser client

Use `@sentry/nextjs` browser bundle. Configure in `sentry.client.config.ts`. Captures:
- Unhandled promise rejections (`onunhandledrejection`).
- Errors not caught by error boundaries (P081).
- Manual `Sentry.captureException()` calls from the canvas engine and coordinators.

#### 3. Custom WebSocket server (`server.ts`)

The `@sentry/node` SDK is initialized in `server.ts` before any other imports.
Sentry's Node.js integration automatically patches `EventEmitter` and `process` to
catch uncaught exceptions and unhandled rejections.

For expected but notable errors (e.g. `ROOM_FULL`, `INVALID_SHA`), use
`Sentry.captureMessage()` at `warning` level to create actionable trends without
alert fatigue.

### Configuration via environment variables

Add to `lib/env.ts` (`EnvSchema`):

| Variable | Description | Default |
|----------|-------------|---------|
| `SENTRY_DSN` | Sentry data source name | `""` (disabled) |
| `SENTRY_ENVIRONMENT` | `production` / `staging` / `development` | `NODE_ENV` |
| `SENTRY_TRACES_SAMPLE_RATE` | APM traces sample rate (0–1) | `0.1` |
| `SENTRY_RELEASE` | Release identifier (git SHA or tag) | `""` |

When `SENTRY_DSN` is empty, all Sentry calls are no-ops (SDK is initialized but
`enabled: false`). This ensures no runtime errors when Sentry is not configured.

### PII scrubbing

Configure `beforeSend` in `sentry.server.config.ts` to:
- Strip `req.body` from captured HTTP request data.
- Redact the `Authorization` and `Cookie` headers.
- Redact any `email`, `passwordHash`, `token`, and `canvasJson` keys from event
  payloads.
- Set `sendDefaultPii: false` (Sentry default, made explicit).

### Alerting policy

Sentry alert rules (configured in the Sentry project, not in the repo):
- **New issue**: Alert on Slack `#alerts-sketchgit` channel.
- **Issue volume spike**: Alert when error rate exceeds 1% of events in 5 minutes.
- **Regression**: Alert when a previously resolved issue recurs after a deploy.

### Source maps

Upload source maps during CI (`npm run build`) via the `@sentry/nextjs` webpack plugin
so stack traces in Sentry point to the original TypeScript source. Source maps must
**not** be served publicly (the `next.config.mjs` `productionBrowserSourceMaps` option
remains `false`).

## Code Structure

```
sentry.client.config.ts   ← Sentry browser SDK initialisation
sentry.server.config.ts   ← Sentry Node.js SDK initialisation (API routes)
sentry.edge.config.ts     ← Sentry Edge runtime initialisation (proxy.ts)
next.config.mjs           ← withSentryConfig() wrapper
lib/env.ts                ← SENTRY_DSN, SENTRY_TRACES_SAMPLE_RATE, SENTRY_RELEASE
.env.example              ← SENTRY_DSN (commented out)
```

## Type Requirements

- `@sentry/nextjs` ships its own TypeScript declarations. No `@types/*` package needed.
- The `SENTRY_DSN` env var must be validated as `z.string().url().optional().or(z.literal(''))`.
- Any `Sentry.captureException(err)` call must receive a typed `Error`, not `unknown`.
  Use the `ensureError()` pattern (or `instanceof Error` guard) before passing.

## Linting Requirements

- `no-console` rule (already enforced): `Sentry.captureException` replaces manual
  `console.error` in catch blocks — do not add new `console.error` calls.
- Add `sentry.*.config.ts` files to the ESLint `ignorePatterns` list if they require
  CommonJS require syntax (Sentry's Next.js adapter may need it).

## Test Requirements

Unit tests **must not** import the real Sentry SDK. Mock it globally in
`lib/test/setup.ts`:

```typescript
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  init: vi.fn(),
}));
```

New test: `lib/api/*.test.ts` should assert that caught 500-level errors trigger
`Sentry.captureException` (via the mock spy) so the integration is tested without
real network calls.

## Database / Data Impact

No schema changes. Sentry events are external to the application database.

## Repository Structure

- Add `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
  at the repo root.
- Add `SENTRY_DSN` to `.env.example` (commented out).
- Update `lib/env.ts` for new env vars.
- Update `lib/env.test.ts` to cover `SENTRY_DSN` defaults and validation.
- Update `next.config.mjs` to wrap the Next.js config with `withSentryConfig`.
- Update `.gitignore` to exclude `.sentryclirc` if generated locally.

## GitHub Copilot Agents and Skills

- Copilot Chat can query the Sentry issues list via the Sentry MCP server to
  correlate production errors with code locations during debugging sessions.
- A custom Copilot skill can generate `Sentry.captureException` wrappers around
  existing `catch` blocks in API routes, following the PII-scrubbing policy.
- The `SENTRY_RELEASE` env var set to the current git SHA means Copilot Workspace
  can link a Sentry issue directly to the commit that introduced it.

## Implementation Order

1. Add Sentry env vars to `lib/env.ts` and `.env.example`.
2. Update `lib/env.test.ts`.
3. Install `@sentry/nextjs`.
4. Create the three Sentry config files.
5. Update `next.config.mjs` with `withSentryConfig`.
6. Initialize Sentry in `server.ts`.
7. Add `vi.mock('@sentry/nextjs')` to `lib/test/setup.ts`.
8. Add Sentry capture calls to the highest-risk catch blocks.
9. Configure source map upload in CI.
10. Write deployment documentation for Sentry project creation.

## Effort Estimate
Medium (2–3 days). Sentry's Next.js SDK has excellent documentation and a
low-friction setup path.

## Dependencies
- P010 ✅ (Pino logging — Sentry complements, not replaces, structured logs)
- P027 ✅ (env validation — SENTRY_DSN added to EnvSchema)
- P016 ✅ (CI pipeline — source map upload step added to build job)
- P081 (React error boundaries — boundary `componentDidCatch` calls `Sentry.captureException`)
- P061 (OpenTelemetry — Sentry APM traces and OTEL traces can be correlated via `trace_id`)
