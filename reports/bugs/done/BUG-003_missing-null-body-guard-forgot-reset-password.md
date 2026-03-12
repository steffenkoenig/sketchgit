# BUG-003 – Missing null body guard in forgot-password and reset-password routes

| Field | Value |
|---|---|
| **ID** | BUG-003 |
| **Severity** | Low |
| **Category** | API / Error handling consistency |
| **Status** | Open |

## Summary

`app/api/auth/forgot-password/route.ts` and `app/api/auth/reset-password/route.ts` do not check whether the parsed request body is `null` before passing it to `validate()`. When a client sends a request with an invalid or empty JSON body, `req.json()` rejects, the `.catch(() => null)` sets `body` to `null`, and the code falls through to `validate(Schema, null)`. This produces a 422 `VALIDATION_ERROR` response instead of the correct 400 `INVALID_JSON` response.

The pattern is inconsistently applied: `app/api/auth/register/route.ts` correctly guards against a null body.

## Affected Files

| File | Missing check |
|---|---|
| `app/api/auth/forgot-password/route.ts` | Lines 21–23 |
| `app/api/auth/reset-password/route.ts` | Lines 21–23 |

## Root Cause

### Register route (correct pattern):

```ts
// app/api/auth/register/route.ts — CORRECT
const body: unknown = await req.json().catch(() => null);
if (body === null) {
  return apiError(ApiErrorCode.INVALID_JSON, "Invalid JSON", 400);
}
const v = validate(RegisterSchema, body);
if (!v.success) return v.response;
```

### Forgot-password and reset-password routes (missing guard):

```ts
// app/api/auth/forgot-password/route.ts — MISSING NULL CHECK
const body: unknown = await req.json().catch(() => null);
const v = validate(Schema, body);  // ← null is passed directly to validate()
if (!v.success) return v.response;
```

```ts
// app/api/auth/reset-password/route.ts — MISSING NULL CHECK
const body: unknown = await req.json().catch(() => null);
const v = validate(ResetPasswordSchema, body);  // ← null is passed directly
if (!v.success) return v.response;
```

When `body` is `null`, `Schema.safeParse(null)` fails with a Zod type error. `validate()` wraps that as `ApiErrorCode.VALIDATION_ERROR` (422). The correct code per the project pattern is `ApiErrorCode.INVALID_JSON` (400).

## Impact

- A client sending a malformed JSON body to `POST /api/auth/forgot-password` or `POST /api/auth/reset-password` receives HTTP 422 with `code: "VALIDATION_ERROR"` instead of the correct HTTP 400 with `code: "INVALID_JSON"`.
- Clients that distinguish error codes to show user-friendly messages will show the wrong error for this case.
- The inconsistency makes the API surface harder to document reliably.

## Suggested Fix

Add the null body guard to both routes, consistent with `register/route.ts`:

```ts
// app/api/auth/forgot-password/route.ts — CORRECT
const body: unknown = await req.json().catch(() => null);
if (body === null) {
  return apiError(ApiErrorCode.INVALID_JSON, "Invalid JSON", 400);
}
const v = validate(Schema, body);
if (!v.success) return v.response;
```

```ts
// app/api/auth/reset-password/route.ts — CORRECT
const body: unknown = await req.json().catch(() => null);
if (body === null) {
  return apiError(ApiErrorCode.INVALID_JSON, "Invalid JSON", 400);
}
const v = validate(ResetPasswordSchema, body);
if (!v.success) return v.response;
```
