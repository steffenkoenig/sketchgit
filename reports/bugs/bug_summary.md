# Bug Summary

This registry records all confirmed bugs found by systematic scanning of the SketchGit codebase.
Last updated: 2026-03-12.

## Registry

| ID | Severity | File(s) | Summary |
|---|---|---|---|
| [BUG-001](./BUG-001_direct-prisma-import-in-route-handlers.md) | Medium | 6 route handlers in `app/api/` | Direct Prisma imports bypass repository layer |
| [BUG-002](./BUG-002_client-reads-wrong-error-field-from-api-response.md) | Medium | `RenameRoomButton.tsx`, `DeleteAccountButton.tsx` | `data.error` always `undefined`; real error never shown |
| [BUG-003](./BUG-003_missing-null-body-guard-forgot-reset-password.md) | Low | `forgot-password/route.ts`, `reset-password/route.ts` | Missing null body guard returns 422 instead of 400 |
| [BUG-004](./BUG-004_toctou-race-ws-invitation-use-count.md) | Medium | `server.ts` | TOCTOU race in WS invitation handler exceeds `maxUses` |

## Severity Criteria

| Level | Meaning |
|---|---|
| **Critical** | Data loss, authentication bypass, or security vulnerability exploitable without authentication |
| **High** | Security vulnerability requiring authentication, or data corruption under normal use |
| **Medium** | Convention violation that risks runtime defects, or incorrect behavior visible to users |
| **Low** | Inconsistency or minor deviation from conventions; no direct security/data impact |

## Scan Scope

Files scanned (excluding test files, migrations, generated code):

- `app/api/**/*.ts` — API route handlers
- `lib/api/**/*.ts` — shared API helpers
- `lib/db/**/*.ts` — repository layer
- `lib/server/**/*.ts` — server-only helpers
- `lib/sketchgit/**/*.ts` — browser-side canvas engine
- `server.ts` — custom WebSocket server
- `proxy.ts` — Next.js middleware
- `components/**/*.tsx` — React components
- `app/**/*.tsx` — Next.js pages

## Bug Detail Index

### BUG-001 – Direct Prisma imports in API route handlers

**Severity**: Medium

Six route handlers in `app/api/` import `prisma` directly from `@/lib/db/prisma`, violating the project convention that all database access in route handlers must go through the repository functions in `lib/db/roomRepository.ts` or `lib/db/userRepository.ts`. This bypasses the abstraction layer, scatters raw queries across the codebase, and undermines the PgBouncer-compatible transaction model.

Affected files: `app/api/auth/account/route.ts`, `app/api/rooms/[roomId]/route.ts`, `app/api/rooms/[roomId]/commits/route.ts`, `app/api/rooms/[roomId]/export/route.ts`, `app/api/rooms/[roomId]/invitations/route.ts`, `app/api/invitations/[token]/route.ts`.

---

### BUG-002 – Client components read wrong error field from API response

**Severity**: Medium

`RenameRoomButton.tsx` and `DeleteAccountButton.tsx` both read `data.error` from API error responses. The `apiError()` helper returns `{ code, message, details }`, not `{ error }`. Since `data.error` is always `undefined`, both components always display the hardcoded fallback string (e.g., "Failed to save slug.") instead of the actual server error message.

---

### BUG-003 – Missing null body guard in forgot-password and reset-password routes

**Severity**: Low

`POST /api/auth/forgot-password` and `POST /api/auth/reset-password` do not check whether `body === null` before calling `validate()`. A request with an invalid or missing JSON body receives HTTP 422 (`VALIDATION_ERROR`) instead of the correct HTTP 400 (`INVALID_JSON`). The register route applies this guard correctly; the others do not.

---

### BUG-004 – TOCTOU race in WebSocket invitation handler exceeds maxUses

**Severity**: Medium

The WebSocket connection handler in `server.ts` uses a non-atomic check-then-increment pattern for invitation tokens. Two concurrent connections can both pass the `useCount < maxUses` guard before either writes, both increment the counter, and both receive access — allowing more joins than `maxUses` permits. The HTTP invitation route (`app/api/invitations/[token]/route.ts`) avoids this correctly with a conditional `updateMany`, but `server.ts` uses an unconditional `update`.
