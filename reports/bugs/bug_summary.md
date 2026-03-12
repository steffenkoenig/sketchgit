# Bug Summary

This registry records all confirmed bugs found by systematic scanning of the SketchGit codebase.
Last updated: 2026-03-13 (fifth scan pass).

---

## ✅ Fixed bugs

Resolved reports are archived in [`done/`](./done/).

| ID | Severity | File(s) | Summary |
|---|---|---|---|
| [BUG-001](./done/BUG-001_direct-prisma-import-in-route-handlers.md) | Medium | 6 route handlers in `app/api/` | Direct Prisma imports bypass repository layer |
| [BUG-002](./done/BUG-002_client-reads-wrong-error-field-from-api-response.md) | Medium | `RenameRoomButton.tsx`, `DeleteAccountButton.tsx` | `data.error` always `undefined`; real error never shown |
| [BUG-003](./done/BUG-003_missing-null-body-guard-forgot-reset-password.md) | Low | `forgot-password/route.ts`, `reset-password/route.ts` | Missing null body guard returns 422 instead of 400 |
| [BUG-004](./done/BUG-004_toctou-race-ws-invitation-use-count.md) | Medium | `server.ts` | TOCTOU race in WS invitation handler exceeds `maxUses` |
| [BUG-005](./done/BUG-005_fullsync-request-missing-from-inbound-ws-schema.md) | High | `lib/api/wsSchemas.ts` | `fullsync-request` missing from schema; breaks peer canvas sync |
| [BUG-006](./done/BUG-006_direct-prisma-import-in-dashboard-page.md) | Medium | `app/dashboard/page.tsx` | Direct Prisma import in Server Component page |
| [BUG-007](./done/BUG-007_non-atomic-password-reset-token-creation.md) | Low | `lib/db/userRepository.ts` | Non-atomic token delete+create can lose reset token on crash |
| [BUG-008](./done/BUG-008_collaborationmanager-destroy-leaks-timers.md) | Low | `collaborationManager.ts` | `destroy()` doesn't cancel lock timers or presenter interval |
| [BUG-009](./done/BUG-009_ws-batch-return-drops-remaining-messages.md) | High | `server.ts` | `return` in WS batch loop silently drops all messages after an invalid one |
| [BUG-010](./done/BUG-010_color-change-not-dirty-not-broadcast.md) | Medium | `lib/sketchgit/canvas/canvasEngine.ts` | Color/fill changes to selected objects not marked dirty or broadcast to peers |
| [BUG-011](./done/BUG-011_create-branch-missing-peer-notification.md) | Low | `lib/sketchgit/coordinators/branchCoordinator.ts` | `doCreateBranch()` doesn't send peer presence notifications |

---

## 🔴 Open bugs

| ID | Severity | File(s) | Summary |
|---|---|---|---|
| [BUG-012](./BUG-012_undo-saves-post-transform-state.md) | Medium | `lib/sketchgit/canvas/canvasEngine.ts` | Undo saves post-transform state; move/resize cannot be undone |
| [BUG-013](./BUG-013_wsclient-connect-orphaned-socket-spurious-reconnect.md) | High | `lib/sketchgit/realtime/wsClient.ts` | `connect()` doesn't close old socket; stale close handler triggers spurious reconnects |
| [BUG-014](./BUG-014_timeline-branch-label-click-missing-peer-notification.md) | Low | `lib/sketchgit/coordinators/timelineCoordinator.ts` | Clicking branch label in timeline SVG doesn't send peer branch-update/profile |
| [BUG-015](./BUG-015_color-fill-change-not-undoable.md) | Low | `lib/sketchgit/canvas/canvasEngine.ts` | Color/fill changes skip `pushHistory()`; cannot be undone |
| [BUG-016](./BUG-016_reset-password-routes-not-rate-limited.md) | Medium | `proxy.ts` | `forgot-password` and `reset-password` routes absent from rate-limiter matcher |
| [BUG-017](./BUG-017_rate-limit-429-uses-wrong-error-format.md) | Low | `proxy.ts` | 429 rate-limit response uses `{ error }` not `{ code, message }` |
| [BUG-018](./BUG-018_openapi-export-format-missing-pdf.md) | Low | `lib/api/openapi.ts` | OpenAPI export `format` enum missing `"pdf"` value |
| [BUG-019](./BUG-019_three-way-merge-uses-base-canvas-discards-ours.md) | Medium | `lib/sketchgit/git/mergeEngine.ts` | Clean merge rebuilds from ancestor canvas; discards our canvas-level changes |

---

## Severity Criteria

| Level | Meaning |
|---|---|
| **Critical** | Data loss, authentication bypass, or security vulnerability exploitable without authentication |
| **High** | Security vulnerability requiring authentication, or data corruption under normal use |
| **Medium** | Convention violation that risks runtime defects, or incorrect behavior visible to users |
| **Low** | Inconsistency or minor deviation from conventions; no direct security/data impact |

---

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

---

## Open Bug Detail Index

### BUG-012 – Undo saves post-transform state; move/resize cannot be undone

**Severity**: Medium

`CanvasEngine` calls `pushHistory()` from the Fabric.js `object:modified` event listener, which fires **after** the transformation (move/resize/rotate) has already been applied. The snapshot captured is therefore the post-modification state, which is identical to the current canvas state at the time undo is invoked. Pressing Ctrl+Z after a move or resize does not visibly restore the previous position — undo appears to be a no-op. A second Ctrl+Z then removes the entire drawn shape, skipping the pre-move state entirely. Operations that do save the correct pre-action state (new shape drawing, eraser, delete key) are unaffected.

---

### BUG-013 – `WsClient.connect()` orphans the old socket; stale close handler triggers spurious reconnects

**Severity**: High

`WsClient.connect()` creates a new WebSocket without first closing the existing one. The old socket remains open and its `onclose` event listener (which uses `this` — the shared WsClient instance) fires later when the old connection terminates server-side. Because `connect()` resets `this.intentionalClose = false`, the guard in the close handler is bypassed, and `_scheduleReconnect()` is called. This creates a third socket (overwriting the current live connection), corrupts `retryCount`, and cancels the new socket's heartbeat monitor via `this._clearHeartbeat()`. Each room switch compounds the issue, creating a growing chain of orphaned socket close handlers.

---

### BUG-014 – Clicking a branch label in the timeline SVG doesn't notify peers of the branch switch

**Severity**: Low

The timeline SVG renders a clickable label for each branch. When clicked, `TimelineCoordinator.render()`'s `onBranchClick` callback checks out the branch and updates the local canvas, but never sends a `branch-update` or `profile` WebSocket message. Peers' presence panels and branch modals therefore display a stale branch for the switching user. The equivalent action via the branch modal (`BranchCoordinator.openBranchModal()`) correctly sends both messages; the timeline label path was not updated to match.

### BUG-015 – Color/fill changes to selected objects are not undoable

**Severity**: Low

`CanvasEngine.updateStrokeColor()` and `updateFillColor()` both modify the active canvas object and call `markDirty()` + `onBroadcastDraw()`, but neither calls `pushHistory()` before the change. Pressing Ctrl+Z after a color/fill change does not revert the color — it instead undoes the last *drawing* action (or does nothing if the stack is empty). The pattern is inconsistent with the Delete-key handler and the drawing-gesture handler, which both call `pushHistory()` before their mutations.

---

### BUG-016 – `/api/auth/forgot-password` and `/api/auth/reset-password` bypass the rate limiter

**Severity**: Medium

`proxy.ts` is the only rate-limiting layer for authentication endpoints. Its `config.matcher` activates the middleware only for `/dashboard/:path*`, `/api/auth/register`, and `/api/auth/signin`. The password-reset endpoints are absent from both the matcher and the `RATE_LIMITED_PATHS` set, so an unauthenticated attacker can call `/api/auth/forgot-password` in a tight loop, triggering unlimited password-reset emails to any target address. The fix is to add both routes to `RATE_LIMITED_PATHS` and to `config.matcher`; the existing rate-limiting infrastructure requires no further changes.

---

### BUG-017 – Rate-limit 429 response uses wrong error body format

**Severity**: Low

`proxy.ts` returns `NextResponse.json({ error: "Too many requests..." }, { status: 429 })` in both the in-memory (`applyRateLimitInMemory`, line 120) and Redis-backed (`applyRateLimitRedis` callback, line 154) rate-limiter paths. The response body shape is `{ error: string }`, which violates the project convention requiring all API errors to use `apiError()` from `lib/api/errors.ts` and return `{ code, message }`. Additionally, no `RATE_LIMITED` code exists in the `ApiErrorCode` enum. Any client that inspects `data.code` on a 429 response will receive `undefined`.

---

### BUG-018 – OpenAPI spec documents export `format` enum without `"pdf"`

**Severity**: Low

`buildOpenApiSpec()` in `lib/api/openapi.ts` defines the `/api/rooms/{roomId}/export` `format` parameter inline as `{ "type": "string", "enum": ["png", "svg"] }` (line 304). The actual `ExportQuerySchema` accepts `["png", "svg", "pdf"]` and the route returns `application/pdf` for `format=pdf`. The 200-response content map also omits `application/pdf`. The `ExportQuery` component is generated correctly from the Zod schema but the path-level parameter bypasses it with a hardcoded schema, so the discrepancy is invisible until the route is tested directly.

---

### BUG-019 – `threeWayMerge()` rebuilds merged canvas from ancestor; discards "ours" canvas-level changes

**Severity**: Medium

In `lib/sketchgit/git/mergeEngine.ts`, the clean-merge return path (lines 169–172) does:
```typescript
const baseParsed = JSON.parse(baseData) as Record<string, unknown>;
baseParsed.objects = resultObjects;
return { result: JSON.stringify(baseParsed), autoMerged: true };
```
`baseParsed` is the **common ancestor** snapshot. Only the `objects` array is replaced; all other top-level Fabric.js canvas properties (`backgroundColor`, `backgroundImage`, `version`, etc.) retain the ancestor's values. If the user changed the canvas background colour or any other canvas-level setting on "our" branch since the divergence point, that change is silently discarded in the merged result — it reverts to the ancestor value with no warning.

---

## Fixed Bug Detail Index

### BUG-001 – Direct Prisma imports in API route handlers ✅

**Severity**: Medium

Six route handlers in `app/api/` imported `prisma` directly from `@/lib/db/prisma`, violating the project convention that all database access in route handlers must go through the repository functions. Fixed by routing all queries through `lib/db/roomRepository.ts` and `lib/db/userRepository.ts`.

---

### BUG-002 – Client components read wrong error field from API response ✅

**Severity**: Medium

`RenameRoomButton.tsx` and `DeleteAccountButton.tsx` read `data.error` from API error responses. The `apiError()` helper returns `{ code, message, details }`, not `{ error }`. Fixed by reading `data.message`.

---

### BUG-003 – Missing null body guard in forgot-password and reset-password routes ✅

**Severity**: Low

`POST /api/auth/forgot-password` and `POST /api/auth/reset-password` did not check whether `body === null` before calling `validate()`. Fixed by adding the same null-body guard present in all other routes.

---

### BUG-004 – TOCTOU race in WebSocket invitation handler exceeds maxUses ✅

**Severity**: Medium

The WebSocket connection handler used a non-atomic check-then-increment pattern for invitation `useCount`. Fixed by replacing the unconditional `update` with a conditional `updateMany({ where: { useCount: { lt: maxUses } } })` — the same pattern the HTTP route already used.

---

### BUG-005 – `fullsync-request` missing from `InboundWsMessageSchema` ✅

**Severity**: High

`fullsync-request` was absent from the Zod discriminated union, causing the server to reject every peer canvas-sync request with `INVALID_PAYLOAD`. Fixed by adding `WsFullsyncRequestSchema` to `InboundWsMessageSchema`.

---

### BUG-006 – Direct Prisma import in `app/dashboard/page.tsx` ✅

**Severity**: Medium

The dashboard Server Component imported `prisma` directly to query `passwordHash`. Fixed by extracting a `userHasPassword()` helper in `lib/db/userRepository.ts` and calling it from the page.

---

### BUG-007 – Non-atomic password-reset token creation ✅

**Severity**: Low

`createPasswordResetToken()` executed `verificationToken.deleteMany` and `verificationToken.create` as two separate calls. Fixed by wrapping both in `prisma.$transaction([...])`.

---

### BUG-008 – `CollaborationManager.destroy()` leaks lock-expire timers and presenter interval ✅

**Severity**: Low

`destroy()` did not cancel `lockExpireTimers` or stop the presenter-mode `viewSyncTimer`. Fixed by iterating `lockExpireTimers` to `clearTimeout` each entry, clearing the map, and calling `_stopPresenting()` inside `destroy()`.

---

### BUG-009 – `return` in WS batch loop silently drops remaining messages ✅

**Severity**: High

The P073 batch message handler used `return` on schema-validation failure, exiting the entire handler callback. Fixed by replacing `return` with `continue` so only the invalid message is skipped.

---

### BUG-010 – Color/fill changes to selected objects not marked dirty or broadcast to peers ✅

**Severity**: Medium

`updateStrokeColor()` and `updateFillColor()` applied `obj.set()` without calling `markDirty()` or `onBroadcastDraw()`. Fixed by adding both calls after each `obj.set()` + `requestRenderAll()`.

---

### BUG-011 – `doCreateBranch()` does not notify peers of the new branch checkout ✅

**Severity**: Low

`doCreateBranch()` created and checked out a branch locally but sent no WebSocket messages. Fixed by adding `ws.send({ type: 'branch-update', ... })` and `ws.send({ type: 'profile', ... })` at the end of the method, matching the notifications sent by `openBranchModal()`.
