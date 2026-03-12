# SketchGit – GitHub Copilot Instructions

This file is automatically loaded as context for all GitHub Copilot Chat conversations and Copilot Coding Agent sessions within this repository. It describes project-specific conventions that differ from generic TypeScript/Next.js patterns.

---

## Architecture Overview

- **Next.js 16** app with a **custom WebSocket server** (`server.ts`).
- **`proxy.ts`** replaces `middleware.ts` (Next.js 16 limitation — only one middleware file is allowed). All rate-limiting, auth redirects, CSP nonces, and origin validation live in `proxy.ts`.
- **Client-side canvas engine**: `lib/sketchgit/` — browser code using Fabric.js (imported from npm, not CDN).
- **Server-side utilities**: `lib/db/` (Prisma repositories), `lib/server/` (server-only helpers), `lib/api/` (Zod schemas, validation helper, error codes).
- **Auth**: NextAuth v5, anonymous-first. Users can draw without an account; accounts are optional for persistence.

---

## Module Boundaries

| Directory | Purpose | Runtime |
|-----------|---------|---------|
| `lib/sketchgit/` | Canvas engine, git model, coordinators, UI helpers | Browser |
| `lib/db/` | Prisma repositories — never import directly in route handlers | Server |
| `lib/server/` | Server-only helpers (CSP, sanitizers, rate limiter, etc.) | Server |
| `lib/api/` | Zod schemas, validation helper, error codes, cache headers | Server |
| `app/api/` | Next.js route handlers (thin controllers; delegate to `lib/db/`) | Server |
| `lib/test/` | Vitest factories and shared test setup | Test only |

**Rule**: Never import from `lib/db/` directly in a route handler. Call the repository functions in `lib/db/roomRepository.ts` or `lib/db/userRepository.ts`.

---

## Logging

- **In `lib/sketchgit/**/*.ts`** (browser code): use `logger` from `lib/sketchgit/logger.ts`. ESLint enforces `no-console` — never use `console.*` directly.
- **In `server.ts`**: use the `pino` logger instance (`const logger = pino(…)`).
- **In `app/api/**/*.ts`**: `console.error` is acceptable only for unexpected 500-level errors.
- **Never use `console.log()`** in production code.

---

## API Route Pattern

All API route handlers follow this template:

```typescript
// 1. Export the Zod schema as a named constant (required for P062 OpenAPI generation)
export const MyRequestSchema = z.object({ … });

export async function POST(req: NextRequest) {
  // 2. Auth check (if the route requires authentication)
  const session = await auth();
  const authSession = getAuthSession(session);
  if (!authSession) {
    return apiError(ApiErrorCode.UNAUTHENTICATED, 'Unauthenticated', 401);
  }

  // 3. Parse + validate body
  const body: unknown = await req.json().catch(() => null);
  if (body === null) {
    return apiError(ApiErrorCode.INVALID_JSON, 'Invalid JSON', 400);
  }
  const v = validate(MyRequestSchema, body);
  if (!v.success) return v.response;

  // 4. Business logic (call repository functions, never raw prisma)
  // …

  // 5. Return typed response
  return NextResponse.json({ … }, { status: 201 });
}
```

**Imports for the pattern above:**
```typescript
import { auth } from '@/lib/auth';
import { getAuthSession } from '@/lib/authTypes';
import { validate } from '@/lib/api/validate';
import { apiError, ApiErrorCode } from '@/lib/api/errors';
```

---

## Error Response Format

All error responses use the shared `apiError()` helper from `lib/api/errors.ts`. **Never** return `NextResponse.json({ error: 'string' })` directly.

```typescript
// Correct
return apiError(ApiErrorCode.NOT_FOUND, 'Room not found', 404);
return apiError(ApiErrorCode.FORBIDDEN, 'Forbidden', 403);

// Incorrect (do not do this)
return NextResponse.json({ error: 'Room not found' }, { status: 404 });
```

Error codes are defined as `as const` in `ApiErrorCode`. Add new codes to `lib/api/errors.ts` before using them. User-facing translations live in `messages/en.json` under `errors.*`.

---

## Database Access Pattern

- **Use repository functions**, not raw Prisma in route handlers.
- Multi-table writes must use **Prisma batch transactions** (`prisma.$transaction([op1, op2])`).
- **Do not use interactive transactions** (`$transaction(async (tx) => …)`) — incompatible with PgBouncer transaction-mode pooling (P060).
- The Prisma client is a singleton in `lib/db/prisma.ts`. Import it only in `lib/db/` files.

---

## WebSocket Message Types

- New WS message types require a Zod schema in `lib/api/wsSchemas.ts`.
- Add the new type string to `WsMessageType` union in `lib/sketchgit/types.ts`.
- Server-side handling belongs in `server.ts` inside the `wss.on('connection')` handler.
- All incoming messages are validated by `InboundWsMessageSchema.safeParse()` before processing.

---

## Caching Policy

Use the helpers in `lib/api/cacheHeaders.ts`:

| Situation | Helper |
|-----------|--------|
| SHA-addressed content (commit export, paginated page by cursor) | `immutableHeaders(sha)` — sets `Cache-Control: public, immutable` + `ETag` |
| Latest HEAD content (no SHA) | `mutableHeaders()` — `private, no-store` |
| Slowly-changing public content (OpenAPI spec, robots.txt) | `shortLivedHeaders(maxAge, swr)` |

---

## React Conventions

- **Always return a cleanup function from `useEffect`** if the effect creates timers, event listeners, or WebSocket connections.
- Wrap callbacks passed to child components in `useCallback` with an explicit dependency array.
- Avoid floating promises: use `void asyncFn()` or wrap in a `useEffect` that returns a cleanup.
- Use `useTranslations()` from `next-intl` for **all** user-visible strings. Add keys to `messages/en.json` and `messages/de.json`.
- Use `getAuthSession(session)` from `lib/authTypes.ts` to extract the typed session object.

---

## Testing Conventions

- Test files: `lib/**/*.test.ts` or `app/api/**/*.test.ts`.
- Test framework: **Vitest** (`npx vitest run` / `npm test`).
- Mock Prisma: `vi.mock('@/lib/db/prisma', () => ({ prisma: { room: { findUnique: vi.fn() } } }))`.
- Use factory functions from `lib/test/factories.ts` instead of inline mock objects (P077).
- Tests must **not require a real database**; all Prisma calls are mocked with `vi.fn()`.
- Coverage thresholds: 70% lines/functions/statements, 69% branches (see `vitest.config.ts`).
- Assert on `code` field of error responses, not on English `message`/`error` strings.

---

## Environment Variables

All env vars are validated at startup via `validateEnv()` in `lib/env.ts` using Zod. To add a new env var:

1. Add it to the `EnvSchema` in `lib/env.ts`.
2. Add a commented-out example to `.env.example`.
3. Update `lib/env.test.ts` to cover the default value and any custom value.

---

## Commit Message Format (Conventional Commits)

All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<optional scope>): <description>

Examples:
  feat(auth): add password reset flow
  fix(ws): handle reconnect race condition
  perf(db): add index on commits.roomId
  refactor(api): replace error strings with ApiErrorCode
  docs: update README with Copilot integration guide
  test(factories): add makeCommit factory helper
  chore(deps): update next to 16.x
```

Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `server.ts` | Custom WebSocket + HTTP server |
| `proxy.ts` | Next.js middleware (rate limiting, CSP nonce, auth redirects) |
| `lib/env.ts` | Env var validation (Zod) |
| `lib/auth.ts` | NextAuth v5 configuration |
| `lib/authTypes.ts` | `getAuthSession()` helper |
| `lib/db/prisma.ts` | Prisma client singleton |
| `lib/db/roomRepository.ts` | Room CRUD + access control |
| `lib/db/userRepository.ts` | User CRUD + credential verification |
| `lib/api/validate.ts` | Zod validation helper for route handlers |
| `lib/api/errors.ts` | `ApiErrorCode`, `ApiError`, `apiError()` |
| `lib/api/cacheHeaders.ts` | `immutableHeaders`, `mutableHeaders`, `shortLivedHeaders` |
| `lib/api/wsSchemas.ts` | Zod schemas for inbound WebSocket messages |
| `lib/sketchgit/types.ts` | Shared TypeScript types (Commit, WsMessage, etc.) |
| `lib/sketchgit/logger.ts` | Client-side structured logger |
| `lib/test/factories.ts` | Prisma model test factories |
| `lib/test/wsFactories.ts` | WebSocket message test factories |
| `messages/en.json` | English i18n strings |
| `messages/de.json` | German i18n strings |
