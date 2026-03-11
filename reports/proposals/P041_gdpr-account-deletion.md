# P041 – GDPR Account Deletion Endpoint

## Title
Implement a User Account Self-Deletion Endpoint (GDPR Right to Erasure)

## Brief Summary
The application has no mechanism for a user to delete their own account and associated data. Under the EU General Data Protection Regulation (GDPR) Article 17, individuals have the "right to erasure" — also known as the right to be forgotten. Providing a self-service `DELETE /api/auth/account` endpoint that permanently removes the authenticated user's profile, session, OAuth links, owned rooms, commits, and memberships satisfies this legal obligation and is also sound data hygiene. The Prisma schema already has the correct cascade-delete rules to make this a single-statement operation for the database layer.

## Current Situation
The `User` model in `prisma/schema.prisma` has cascade rules on all child relations:
```prisma
model Account {
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
model Room {
  owner User? @relation("RoomOwner", fields: [ownerId], references: [id], onDelete: SetNull)
}
model RoomMembership {
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
model Commit {
  author User? @relation(fields: [authorId], references: [id], onDelete: SetNull)
}
```

This means that deleting a `User` row:
- Cascades to `Account` (OAuth tokens) and `RoomMembership` rows.
- Sets `ownerId` to `null` on owned rooms (preserving room data by default).
- Sets `authorId` to `null` on commits (preserving historical commits).

There is currently no API endpoint, no UI element, and no administrative tool to trigger this deletion. A user who wishes to have their account removed must contact a developer with database access.

## Problem with Current Situation
1. **GDPR non-compliance**: Article 17 requires that data subjects can request erasure of their personal data without undue delay. "Without undue delay" means days, not "wait for a developer". Not offering a self-service option exposes the service operator to regulatory risk.
2. **CCPA / UK GDPR overlap**: Similar rights exist under the California Consumer Privacy Act (CCPA) and UK GDPR. Even for non-EU operators, compliance with the most protective standard (EU GDPR) covers all jurisdictions.
3. **No data minimisation**: Without deletion, user data (email, name, password hash, OAuth tokens, session cookies) accumulates indefinitely even for users who stop using the service.
4. **Incomplete auth UX**: Users expect to find an account deletion option in a settings page. Its absence is surprising and erodes trust.

## Goal to Achieve
1. Implement `DELETE /api/auth/account` that authenticates the caller, verifies their identity (password re-entry or re-auth), and permanently deletes the user record plus cascaded data.
2. Revoke all active NextAuth sessions for the user immediately after deletion.
3. Return a clear success confirmation and sign the user out.
4. Log the deletion as a security event (user ID, timestamp) without logging PII.
5. Add a "Delete Account" button in the dashboard UI behind a confirmation dialog.
6. Cover the endpoint with tests.

## What Needs to Be Done

### 1. Create `app/api/auth/account/route.ts`
```typescript
// DELETE /api/auth/account
// Body: { password: string }  (required for credentials users; skip for OAuth-only users)
```
Authentication flow:
1. Require an active session (`auth()` → 401 if unauthenticated).
2. For credentials users: validate supplied `password` against stored hash via `verifyCredentials`.
3. For OAuth-only users (no `passwordHash`): skip password check (they are already authenticated via OAuth in the current session).
4. Delete the user record (cascade handles the rest).
5. Sign out the session by calling `signOut()` server-side or by clearing the session cookie in the response.

```typescript
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;

  // For credentials users, require password confirmation
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.passwordHash) {
    const body = await req.json();
    const v = validate(DeleteAccountSchema, body);
    if (!v.success) return v.response;

    const valid = await bcrypt.compare(v.data.password, user.passwordHash);
    if (!valid) return NextResponse.json({ error: 'Incorrect password' }, { status: 403 });
  }

  // Delete the user (cascades to Account, RoomMembership; nullifies ownedRooms + commit authorId)
  await prisma.user.delete({ where: { id: userId } });

  // Log deletion for audit (no PII)
  logger.info({ userId, event: 'account_deleted' }, 'user account deleted');

  // Clear the session cookie
  const response = NextResponse.json({ message: 'Account deleted' }, { status: 200 });
  response.cookies.delete('authjs.session-token');
  response.cookies.delete('__Secure-authjs.session-token');
  return response;
}
```

### 2. Prisma schema consideration: owned rooms
The current `onDelete: SetNull` on `Room.ownerId` preserves rooms when the owner account is deleted. This is the preferred behaviour (collaborative rooms created by the user should not disappear for other members). However, rooms with no members AND no owner should be scheduled for cleanup via P032 (automated pruning). Document this in code.

### 3. Add `DeleteAccountSchema` to validation
```typescript
const DeleteAccountSchema = z.object({
  password: z.string().min(1).max(128),
});
```

### 4. Add "Delete Account" UI in the dashboard
```tsx
// app/dashboard/page.tsx or a new app/settings/page.tsx
<button onClick={() => setShowDeleteConfirm(true)} className="text-red-500 hover:underline text-sm">
  Delete Account
</button>
```

The confirmation dialog should:
- Display a clear warning: "This action is permanent and cannot be undone."
- For credentials users: include a password field for re-verification.
- For OAuth users: show a confirmation checkbox ("I understand this will delete all my data").
- On confirm: call `DELETE /api/auth/account`, redirect to home on success.

### 5. Tests in `app/api/auth/account/route.test.ts`
- Unauthenticated request → 401.
- Credentials user with correct password → 200, user deleted in DB.
- Credentials user with wrong password → 403, user NOT deleted.
- OAuth-only user (no passwordHash) → 200 without body, user deleted.
- After deletion: `prisma.user.findUnique(userId)` returns `null`.
- After deletion: `prisma.account.findFirst({ where: { userId } })` returns `null` (cascade verified).

### 6. Data retention clarification (README / GDPR notice)
Add a brief `GDPR.md` or data-retention section to `README.md` documenting:
- What data is deleted immediately on account deletion.
- What data is anonymised but retained (commits with `authorId: null`, rooms with `ownerId: null`).
- How long session tokens remain valid after deletion (should be immediately invalidated; see cookie clearing above).

## Components Affected
| Component | Change |
|-----------|--------|
| `app/api/auth/account/route.ts` | **New file** – DELETE endpoint |
| `app/dashboard/page.tsx` | Add "Delete Account" button with confirmation dialog |
| `lib/db/userRepository.ts` | (Optional) add `deleteUser` helper encapsulating the cascade delete |
| `app/api/auth/account/route.test.ts` | **New file** – unit tests |

## Data & Database Model
No schema changes needed. The existing cascade rules are correct:
- `Account` → `onDelete: Cascade` ✅
- `RoomMembership` → `onDelete: Cascade` ✅
- `Room.ownerId` → `onDelete: SetNull` ✅ (preserves collaborative rooms)
- `Commit.authorId` → `onDelete: SetNull` ✅ (preserves git history)

One edge case: if a user owns a room with no other members, deleting the user leaves an orphaned room. The P032 pruning job handles this case by detecting rooms with no recent activity and no owner, and removing them on schedule.

## Testing Requirements
- Cascade: after `DELETE /api/auth/account`, `Account` rows are removed, `RoomMembership` rows are removed.
- Retention: `Room` and `Commit` records are NOT deleted.
- Session invalidation: session cookie cleared in response headers.
- Password recheck: wrong password → no deletion, correct error returned.
- Idempotency: second DELETE request for same user (session now invalid) → 401.

## Linting and Type Requirements
- `bcrypt` import is already available in `userRepository.ts`; reuse or call `verifyCredentials` to keep the password-check logic in one place.
- The DELETE route must import `prisma` from `lib/db/prisma.ts`, not create a new client.
- `logger` from `pino` should be a shared singleton (the same one used in `server.ts`) or a new one created per route with consistent config.

## Dependency Map
- Depends on: P007 ✅ (auth session), P003 ✅ (Prisma cascade rules in place), P014 ✅ (Zod)
- Benefits from: P040 (password reset confirms user's email, reducing the need for password re-entry on deletion)
- Enables: full GDPR self-service data management when combined with a data-export endpoint (future proposal)
- Required by: GDPR Article 17 (legal compliance)
