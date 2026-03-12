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
| [BUG-005](./BUG-005_fullsync-request-missing-from-inbound-ws-schema.md) | High | `lib/api/wsSchemas.ts` | `fullsync-request` missing from schema; breaks peer canvas sync |
| [BUG-006](./BUG-006_direct-prisma-import-in-dashboard-page.md) | Medium | `app/dashboard/page.tsx` | Direct Prisma import in Server Component page |
| [BUG-007](./BUG-007_non-atomic-password-reset-token-creation.md) | Low | `lib/db/userRepository.ts` | Non-atomic token delete+create can lose reset token on crash |
| [BUG-008](./BUG-008_collaborationmanager-destroy-leaks-timers.md) | Low | `collaborationManager.ts` | `destroy()` doesn't cancel lock timers or presenter interval |

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

---

### BUG-005 – `fullsync-request` missing from `InboundWsMessageSchema`

**Severity**: High

`fullsync-request` is a valid `WsMessageType` (types.ts) and is sent by every client on connect to request a canvas state fullsync from existing peers. However, it is absent from the `InboundWsMessageSchema` Zod discriminated union (wsSchemas.ts). The server rejects every `fullsync-request` with `INVALID_PAYLOAD`. New clients joining a room with active peers never receive in-memory canvas state (uncommitted drawings) from those peers — they only see the last committed DB state.

---

### BUG-006 – Direct Prisma import in `app/dashboard/page.tsx`

**Severity**: Medium

`app/dashboard/page.tsx` imports `prisma` directly from `@/lib/db/prisma` to query a user's `passwordHash` field. This is the same violation as BUG-001 but in a Server Component page rather than a Route Handler. A new repository helper (`userHasPassword`) should be added to `lib/db/userRepository.ts` and called from the page instead.

---

### BUG-007 – Non-atomic password-reset token creation

**Severity**: Low

`createPasswordResetToken()` in `lib/db/userRepository.ts` executes `verificationToken.deleteMany` and then `verificationToken.create` as two separate Prisma calls without a batch transaction. A crash or DB connection drop between the two operations leaves the user with no valid reset token. `resetPassword()` in the same file uses `prisma.$transaction([...])` correctly; `createPasswordResetToken` should do the same.

---

### BUG-008 – `CollaborationManager.destroy()` leaks lock-expire timers and presenter interval

**Severity**: Low

`CollaborationManager.destroy()` does not cancel the per-peer lock-expire timers (`lockExpireTimers`) or stop the presenter-mode view-sync interval (`viewSyncTimer`). Both continue to fire after the manager is destroyed. The bug is currently latent because `app.ts` always calls `ws.disconnect()` before `collab.destroy()`, and `handleStatusChange('offline')` cleans up these timers as a side effect. However, `destroy()` relies on this undocumented implicit ordering; any future code that calls `destroy()` without a prior `disconnect()` will create real timer leaks.
