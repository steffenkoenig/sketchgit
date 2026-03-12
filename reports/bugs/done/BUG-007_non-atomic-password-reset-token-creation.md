# BUG-007 – Non-atomic password-reset token creation risks token loss

| Field | Value |
|---|---|
| **ID** | BUG-007 |
| **Severity** | Low |
| **Category** | Data integrity / Race condition |
| **Status** | Open |

## Summary

`createPasswordResetToken()` in `lib/db/userRepository.ts` executes two separate database operations — `deleteMany` (remove existing tokens) and `create` (store the new token) — without wrapping them in a Prisma batch transaction. If the process crashes or the database connection drops between the two writes, the user's existing token is deleted but the new one is never created, leaving the user with no valid reset token and unable to reset their password until they request another.

By contrast, `resetPassword()` in the same file correctly wraps its two writes (`user.update` + `verificationToken.deleteMany`) in a `prisma.$transaction([...])` batch.

## Affected File

| File | Lines | Issue |
|---|---|---|
| `lib/db/userRepository.ts` | 167–173 | Two sequential Prisma calls without a batch transaction |

## Root Cause

```ts
// lib/db/userRepository.ts — NOT ATOMIC (lines 167–173)
await prisma.verificationToken.deleteMany({ where: { identifier: email } });

await prisma.verificationToken.create({
  data: { identifier: email, token, expires },
});
```

If the process terminates between the two `await` calls (OOM, SIGKILL, PgBouncer timeout, etc.):
- The old token is gone.
- The new token was never created.
- The user's reset request silently fails; they receive no error but their token is invalid.

### Contrast with the correct pattern in the same file

```ts
// lib/db/userRepository.ts — CORRECT (lines 193–201, resetPassword function)
await prisma.$transaction([
  prisma.user.update({ where: { email: record.identifier }, data: { passwordHash } }),
  prisma.verificationToken.deleteMany({ where: { identifier: record.identifier } }),
]);
```

## Impact

- In the narrow crash-between-writes window, a user who requested a password reset cannot complete it because their token no longer exists.
- The user must request another reset, which may cause confusion ("I requested a reset but the link doesn't work").
- Severity is low because the window is extremely small in practice, but the fix is trivial.

## Suggested Fix

Wrap both operations in a single `prisma.$transaction([...])` batch (consistent with PgBouncer transaction-mode pooling, P060):

```ts
// lib/db/userRepository.ts — CORRECT
await prisma.$transaction([
  prisma.verificationToken.deleteMany({ where: { identifier: email } }),
  prisma.verificationToken.create({
    data: { identifier: email, token, expires },
  }),
]);
```
