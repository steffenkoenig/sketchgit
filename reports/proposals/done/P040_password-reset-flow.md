# P040 – Password Reset Flow

## Title
Implement Email-Based Password Reset for Credentials-Provider Users

## Brief Summary
Users who register with email and password have no recovery path if they forget their password. GitHub OAuth provides an alternative sign-in method, but credentials-only accounts are permanently locked out. Adding a standard password-reset flow — request token by email, click link, set new password — completes the authentication layer begun in P007 and meets the minimum expected functionality of any web application that manages passwords.

## Current Situation
`lib/auth.ts` supports NextAuth Credentials (email + password) and optional GitHub OAuth. There is no "Forgot password?" link on the sign-in page. The `User` model has a `passwordHash` column but no `resetToken`, `resetTokenExpiry`, or `emailVerified` fields.

`app/auth/signin/page.tsx` renders the sign-in form with no link to a password-reset flow:
```html
<!-- No "Forgot password?" link anywhere on the page -->
```

The NextAuth `VerificationToken` model exists in the schema (used by email providers) but is not currently wired to any reset endpoint.

The `userRepository.ts` module has `createUser` and `verifyCredentials` but no `setPasswordResetToken` or `updatePassword` functions.

## Problem with Current Situation
1. **Permanent lockout**: A credentials user who forgets their password has no self-service recovery path. They must contact an administrator (who would need direct database access to fix the problem).
2. **Abandoned accounts**: Users who lose access to their account create orphaned rooms and data that can never be reclaimed or managed by the owner.
3. **Poor UX**: "Forgot password?" is expected on any login form. Its absence creates confusion and signals an incomplete product.
4. **GDPR implications**: A user who cannot log in also cannot request account deletion (P041). Password recovery is a prerequisite for user self-management.

## Goal to Achieve
1. Add a `POST /api/auth/forgot-password` endpoint that accepts an email address, generates a secure reset token (24-hour TTL), and sends a reset email.
2. Add a `POST /api/auth/reset-password` endpoint that accepts a token + new password, validates the token, updates the password hash, and invalidates the token.
3. Add `GET /auth/forgot-password` and `GET /auth/reset-password` pages for the user interface.
4. Reuse the existing `VerificationToken` model in the Prisma schema to store tokens (no new schema changes needed for a basic implementation).
5. Emit structured log events for security auditing (failed reset attempts, expired tokens).

## What Needs to Be Done

### 1. Add email sending capability
Choose a transactional email provider. Recommended: **Resend** (`resend` npm package) — simple API, generous free tier, 5-minute integration. Add a `RESEND_API_KEY` and `EMAIL_FROM` environment variable.

As an alternative with zero new dependencies: configure SMTP via `nodemailer` if a self-hosted SMTP server is available. The choice should be documented in the proposal and left to the implementer.

```typescript
// lib/email/sendEmail.ts
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({ from: process.env.EMAIL_FROM!, to, subject, html });
}
```

### 2. Implement reset-token helpers in `lib/db/userRepository.ts`
```typescript
import { randomBytes } from 'node:crypto';

const RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Generate and persist a password reset token for the given email. */
export async function createPasswordResetToken(email: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null; // silently fail to avoid email enumeration

  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await prisma.verificationToken.upsert({
    where: { identifier_token: { identifier: email, token: 'reset' } },
    create: { identifier: email, token, expires },
    update: { token, expires },
  });

  return token;
}

/** Consume a reset token and update the user's password. Returns false if invalid/expired. */
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<boolean> {
  const record = await prisma.verificationToken.findFirst({
    where: { token, expires: { gt: new Date() } },
  });
  if (!record) return false;

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({
      where: { email: record.identifier },
      data: { passwordHash },
    }),
    prisma.verificationToken.delete({
      where: { identifier_token: { identifier: record.identifier, token: record.token } },
    }),
  ]);

  return true;
}
```

### 3. Create `app/api/auth/forgot-password/route.ts`
```typescript
// POST /api/auth/forgot-password
// Body: { email: string }
// Always returns 200 OK to avoid email enumeration attacks.
```
- Validate email with Zod.
- Call `createPasswordResetToken(email)`.
- If a token is returned, send the reset email with a link to `/auth/reset-password?token=<token>`.
- Always return `{ message: "If that email is registered, you'll receive a reset link shortly." }`.

### 4. Create `app/api/auth/reset-password/route.ts`
```typescript
// POST /api/auth/reset-password
// Body: { token: string, password: string }
```
- Validate with Zod (token max 128 chars, password min 12 / max 128 chars).
- Call `resetPassword(token, password)`.
- Return 200 on success, 400 with `{ error: "Invalid or expired token" }` on failure.

### 5. Create UI pages
- `app/auth/forgot-password/page.tsx`: Single email input field + submit button. Shows success message after submit.
- `app/auth/reset-password/page.tsx`: Reads `?token=` from query params. Shows password + confirm-password fields. Redirects to sign-in on success.

### 6. Add "Forgot password?" link to `app/auth/signin/page.tsx`
```tsx
<Link href="/auth/forgot-password" className="text-xs text-violet-400 hover:underline">
  Forgot password?
</Link>
```

### 7. Tests
- `forgot-password/route.test.ts`: Unknown email → 200 (enumeration prevention). Known email → token stored in DB + email sent (mock `sendEmail`).
- `reset-password/route.test.ts`: Valid token → password updated + token deleted → 200. Expired token → 400. Already-used token → 400. Invalid password length → 422.
- `userRepository.test.ts`: `createPasswordResetToken` with unknown email returns `null`. `resetPassword` with expired token returns `false`. Valid flow round-trip.

## Components Affected
| Component | Change |
|-----------|--------|
| `app/api/auth/forgot-password/route.ts` | **New file** – request token endpoint |
| `app/api/auth/reset-password/route.ts` | **New file** – consume token + update password |
| `app/auth/forgot-password/page.tsx` | **New file** – email input UI |
| `app/auth/reset-password/page.tsx` | **New file** – new password UI |
| `app/auth/signin/page.tsx` | Add "Forgot password?" link |
| `lib/db/userRepository.ts` | Add `createPasswordResetToken`, `resetPassword` |
| `lib/email/sendEmail.ts` | **New file** – email sending abstraction |
| `lib/env.ts` | Add `RESEND_API_KEY` (optional), `EMAIL_FROM` (optional) |
| `.env.example` | Document new env vars |
| Route test files | New unit tests |

## Data & Database Model
No schema changes required. The existing `VerificationToken` model in `schema.prisma` stores `{ identifier, token, expires }`. The `identifier` field is repurposed as the user's email address; the `token` field holds the 32-byte hex reset token.

### Note on schema clarity
The `VerificationToken` model is currently unused in the app (it is part of the NextAuth adapter schema). Reusing it for password reset is pragmatic but slightly ambiguous. Consider adding a comment to `schema.prisma` explaining the dual use, or introducing a separate `PasswordResetToken` model for clarity (at the cost of a schema migration).

## Testing Requirements
- Enumeration protection: requesting reset for unknown email → 200, no token created.
- Token lifetime: token created with `expires = now + 24h`; simulated expiry causes failure.
- Idempotency: two requests for the same email → only one active token (previous overwritten).
- Security: token is 32 random bytes (256 bits of entropy) — not guessable.
- Password validation: minimum 12 characters enforced at API level (Zod), not just client-side.

## Linting and Type Requirements
- `randomBytes(32).toString('hex')` produces a 64-character string; store in `token` field (which has no `@db.VarChar` constraint — verify Prisma default is sufficient).
- `sendEmail` catches send failures and logs them without surfacing to the user (avoid leaking infrastructure details).
- Environment variables `RESEND_API_KEY` and `EMAIL_FROM` are optional in `lib/env.ts` (password reset is an opt-in feature; when absent, the endpoint returns a 503).

## Dependency Map
- Depends on: P007 ✅ (Credentials provider), P014 ✅ (Zod validation), P003 ✅ (Prisma + VerificationToken model)
- Required by: P041 (GDPR account deletion requires a working auth flow for identity verification)
- Enables: email verification (natural extension using the same token mechanism)
