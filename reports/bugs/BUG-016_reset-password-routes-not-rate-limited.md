# BUG-016 – `/api/auth/forgot-password` and `/api/auth/reset-password` bypass the rate limiter

**Status**: Open  
**Severity**: Medium  
**File**: `proxy.ts`

---

## Summary

The Next.js proxy middleware (`proxy.ts`) is the sole rate-limiting layer for authentication endpoints. Its `config.matcher` only activates the middleware for `/dashboard/:path*`, `/api/auth/register`, and `/api/auth/signin`. The password-reset endpoints `/api/auth/forgot-password` and `/api/auth/reset-password` are **absent from the matcher**, so the middleware never runs for those routes and they are completely unthrottled.

---

## Root Cause

Two separate but related gaps exist in `proxy.ts`:

**1. `RATE_LIMITED_PATHS` set (line 37) does not include the reset routes:**

```ts
const RATE_LIMITED_PATHS = new Set(["/api/auth/register", "/api/auth/signin"]);
// ← /api/auth/forgot-password and /api/auth/reset-password are absent
```

**2. `config.matcher` (line 204–206) also excludes these routes:**

```ts
export const config = {
  matcher: ["/dashboard/:path*", "/api/auth/register", "/api/auth/signin"],
  // ← middleware does not run for /api/auth/forgot-password or /api/auth/reset-password
};
```

Because both the `matcher` and the `RATE_LIMITED_PATHS` set are missing the reset routes, no rate-limiting logic is applied at all — even though the existing infrastructure would handle these routes correctly if they were added.

---

## Impact

### `/api/auth/forgot-password`

An unauthenticated attacker can call this endpoint in a tight loop without ever being throttled. The practical consequences are:

- **Email spam / harassment**: Sending thousands of password-reset emails to a target user's inbox, constituting a denial-of-service against the user's email account.
- **Third-party email cost**: Each request consumes an email credit with the configured sending provider (Resend). A sustained attack can exhaust email quota or generate unexpected billing charges.

### `/api/auth/reset-password`

The reset token is 256-bit random (`randomBytes(32).toString('hex')`), so brute-force is infeasible in practice. Nevertheless, leaving this endpoint without rate limiting violates defence-in-depth principles and may be flagged by security audits.

---

## Steps to Reproduce

```bash
# Send 200 rapid-fire password-reset requests — none are rejected
for i in $(seq 1 200); do
  curl -s -X POST http://localhost:3000/api/auth/forgot-password \
    -H 'Content-Type: application/json' \
    -d '{"email":"victim@example.com"}' &
done
wait
```

All 200 requests return `200 OK` and (when email is configured) each triggers a separate email to `victim@example.com`.

---

## Fix

Add both reset routes to the `config.matcher` and to `RATE_LIMITED_PATHS`:

```ts
// proxy.ts

const RATE_LIMITED_PATHS = new Set([
  "/api/auth/register",
  "/api/auth/signin",
  "/api/auth/forgot-password",   // ← add
  "/api/auth/reset-password",    // ← add
]);

// …

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/auth/register",
    "/api/auth/signin",
    "/api/auth/forgot-password",   // ← add
    "/api/auth/reset-password",    // ← add
  ],
};
```

The existing `applyRateLimit()` implementation (both the in-memory and Redis paths) will then apply the same fixed-window limit (`RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW`) to the reset routes automatically, with no additional code changes required.
