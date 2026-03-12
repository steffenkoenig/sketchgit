# BUG-006 – Direct Prisma import in `app/dashboard/page.tsx`

| Field | Value |
|---|---|
| **ID** | BUG-006 |
| **Severity** | Medium |
| **Category** | Convention violation / Module boundary |
| **Status** | Open |

## Summary

`app/dashboard/page.tsx` is a Next.js Server Component that imports `prisma` directly from `@/lib/db/prisma` to query whether the user has a password hash. This violates the same module-boundary rule documented in BUG-001, which prohibits direct Prisma usage outside the repository layer — but for a page component instead of a route handler.

## Affected File

| File | Line | Direct Prisma usage |
|---|---|---|
| `app/dashboard/page.tsx` | 10, 31–35 | `prisma.user.findUnique(…)` |

## Root Cause

```ts
// app/dashboard/page.tsx — WRONG: direct prisma import in a Server Component
import { prisma } from "@/lib/db/prisma";

// lines 31–35 — raw Prisma query inside the component body
const userRecord = await prisma.user.findUnique({
  where: { id: userId },
  select: { passwordHash: true },
});
const hasPassword = !!userRecord?.passwordHash;
```

The module-boundary rule applies equally to Server Components and Route Handlers: both are server-side code that should delegate all database access to the repository layer (`lib/db/userRepository.ts` or `lib/db/roomRepository.ts`).

## Impact

Same as BUG-001:
- Scatters raw Prisma queries outside the repository layer.
- Makes it harder to apply consistent caching, logging, or access-control changes across all user data access.
- Undermines the PgBouncer-compatible transaction model.

## Suggested Fix

Add a repository helper in `lib/db/userRepository.ts`:

```ts
// lib/db/userRepository.ts
/**
 * Return true when the user has a credentials password set.
 * Used by the dashboard to conditionally require password re-entry for deletion.
 */
export async function userHasPassword(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  return !!user?.passwordHash;
}
```

Then update the page to use the repository function:

```ts
// app/dashboard/page.tsx — CORRECT
import { getUserRooms, userHasPassword } from "@/lib/db/roomRepository";
// remove: import { prisma } from "@/lib/db/prisma";

const hasPassword = await userHasPassword(userId);
// remove the prisma.user.findUnique() block
```
