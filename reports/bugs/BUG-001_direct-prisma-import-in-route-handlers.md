# BUG-001 – Direct Prisma imports in API route handlers

| Field | Value |
|---|---|
| **ID** | BUG-001 |
| **Severity** | Medium |
| **Category** | Convention violation / Module boundary |
| **Status** | Open |

## Summary

Six `app/api/` route handlers import `prisma` directly from `@/lib/db/prisma` instead of calling the repository functions in `lib/db/roomRepository.ts` or `lib/db/userRepository.ts`.

## Affected Files

| File | Direct Prisma operations |
|---|---|
| `app/api/auth/account/route.ts` | `prisma.user.findUnique`, `prisma.user.delete` |
| `app/api/rooms/[roomId]/route.ts` | `prisma.room.findUnique`, `prisma.room.update` |
| `app/api/rooms/[roomId]/commits/route.ts` | `prisma.room.findUnique`, `prisma.roomMembership.findUnique`, `prisma.commit.findMany` |
| `app/api/rooms/[roomId]/export/route.ts` | `prisma.room.findUnique`, `prisma.roomMembership.findUnique`, `prisma.commit.findUnique`, `prisma.commit.findFirst`, `prisma.roomState.findUnique` |
| `app/api/rooms/[roomId]/invitations/route.ts` | `prisma.roomInvitation.create`, `prisma.roomInvitation.deleteMany` |
| `app/api/invitations/[token]/route.ts` | `prisma.roomInvitation.findUnique`, `prisma.roomMembership.upsert`, `prisma.roomInvitation.updateMany` |

## Root Cause

The project convention states (`.github/copilot-instructions.md`):

> **Rule**: Never import from `lib/db/` directly in a route handler. Call the repository functions in `lib/db/roomRepository.ts` or `lib/db/userRepository.ts`.

This rule exists because:
- The Prisma client singleton (`lib/db/prisma.ts`) must only be imported by the repository layer.
- The repository layer is also where multi-table batch transaction semantics are enforced (required for PgBouncer transaction-mode pooling, see constraint P060).
- Direct imports scatter data-access logic across the codebase, making it harder to apply consistent caching, logging, or access-control changes.

## Example — `app/api/auth/account/route.ts`

```ts
// Line 15 — WRONG: direct prisma import in a route handler
import { prisma } from "@/lib/db/prisma";

// Lines 32–35 — raw Prisma query inside the handler
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: { id: true, email: true, passwordHash: true },
});

// Line 59 — another raw Prisma call
await prisma.user.delete({ where: { id: userId } });
```

## Impact

- Bypasses the repository abstraction layer, coupling route handlers to the database schema.
- Operations that should be transactions (e.g., delete user + cascade logic) are executed as individual queries, risking partial writes under connection failure.
- Makes future refactoring (e.g., adding soft-delete, audit logging, connection-pooling changes) harder and error-prone.
- Violates the PgBouncer compatibility rule: interactive transactions (`$transaction(async tx => …)`) must not be used, but ensuring this is only practical when all DB access goes through the repository layer.

## Suggested Fix

Move all direct Prisma calls in these route handlers into new or extended repository functions in `lib/db/roomRepository.ts` or `lib/db/userRepository.ts`, then call those functions from the route handlers.

For example, add to `userRepository.ts`:

```ts
export async function findUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, passwordHash: true },
  });
}

export async function deleteUserById(userId: string) {
  return prisma.user.delete({ where: { id: userId } });
}
```

Then update the route handler to use those functions:

```ts
// app/api/auth/account/route.ts — CORRECT
import { findUserById, deleteUserById, verifyCredentials } from "@/lib/db/userRepository";

const user = await findUserById(userId);
// ...
await deleteUserById(userId);
```
