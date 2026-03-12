# P068 – Structured Error Codes for API Responses

## Title
Introduce Machine-Readable Error Codes in All API Error Responses to Enable Reliable Client-Side Localisation and Programmatic Error Handling

## Brief Summary
All Next.js API route handlers currently return errors as plain English strings in a `{ error: string }` JSON object. Client-side code and tests must match error messages by substring, which breaks when message wording changes. Introducing a standardised `{ code: string, message: string }` error response format—with a finite, documented set of error codes—enables stable client-side error handling, localised error messages via `next-intl`, and predictable contract testing.

## Current Situation
API error responses are unstructured:
```typescript
// app/api/auth/register/route.ts
return NextResponse.json({ error: "Email already in use" }, { status: 409 });

// app/api/rooms/[roomId]/route.ts
return NextResponse.json({ error: "Room not found" }, { status: 404 });
return NextResponse.json({ error: "Forbidden" }, { status: 403 });

// lib/api/validate.ts
return NextResponse.json({ errors: result.error.flatten() }, { status: 422 });
```
The error message is the only identifier. If wording changes, clients and tests that matched on `"Email already in use"` will silently break.

### Relevant files
```
lib/api/validate.ts              ← 422 error response format
app/api/auth/register/route.ts   ← 409 error string
app/api/auth/account/route.ts    ← 401, 403 error strings
app/api/rooms/[roomId]/route.ts  ← 404, 403 error strings
app/api/rooms/[roomId]/commits/route.ts ← 401, 404, 400 error strings
app/api/rooms/[roomId]/export/route.ts  ← 401, 404, 400 error strings
```

## Problem with Current Situation
1. **Fragile client-side error matching**: Tests and UI code must compare `error.message === "Email already in use"` (or use substring matching). Any wording change silently breaks these checks.
2. **No localisation support**: The `next-intl` catalogues (`messages/en.json`, `messages/de.json`) cannot contain translations for API error messages because those messages are hard-coded English strings returned from the server. Client-side code should look up the error message by code: `t(`errors.${response.code}`)`.
3. **Inconsistent response shape**: Some endpoints return `{ error: string }`, the validate helper returns `{ errors: ZodFlattenedError }`, and future endpoints might introduce other shapes. There is no single type for `ApiErrorResponse`.
4. **Difficult contract testing**: Integration tests must assert on exact string values. A documented error code enum makes tests more intent-revealing (`expect(code).toBe('EMAIL_IN_USE')`) and resilient to message wording changes.
5. **No OpenAPI error schema**: The P062 OpenAPI generation cannot produce accurate error response schemas without a typed error format.

## Goal to Achieve
1. Define a shared `ApiError` type and a finite `ApiErrorCode` enum in `lib/api/errors.ts`.
2. Update `lib/api/validate.ts` to return the new error format for 422 responses.
3. Update all API route handlers to return `ApiError` objects instead of plain strings.
4. Add error code keys to `messages/en.json` and `messages/de.json` so client-side code can look up localised error messages.
5. Update existing tests to assert on error codes instead of message strings.

## What Needs to Be Done

### 1. Create `lib/api/errors.ts`
```typescript
/**
 * Standardised API error codes.
 * Use these constants in route handlers and client-side error display.
 * Corresponding user-facing messages live in messages/en.json under "errors.*".
 */
export const ApiErrorCode = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  UNAUTHENTICATED:       'UNAUTHENTICATED',
  FORBIDDEN:             'FORBIDDEN',
  EMAIL_IN_USE:          'EMAIL_IN_USE',
  INVALID_CREDENTIALS:   'INVALID_CREDENTIALS',
  INVALID_RESET_TOKEN:   'INVALID_RESET_TOKEN',
  // ── Resources ────────────────────────────────────────────────────────────
  NOT_FOUND:             'NOT_FOUND',
  ROOM_NOT_FOUND:        'ROOM_NOT_FOUND',
  SLUG_ALREADY_TAKEN:    'SLUG_ALREADY_TAKEN',
  // ── Validation ───────────────────────────────────────────────────────────
  VALIDATION_ERROR:      'VALIDATION_ERROR',
  INVALID_JSON:          'INVALID_JSON',
  // ── Export ───────────────────────────────────────────────────────────────
  EXPORT_FAILED:         'EXPORT_FAILED',
  CANVAS_NOT_FOUND:      'CANVAS_NOT_FOUND',
  // ── Server ────────────────────────────────────────────────────────────────
  INTERNAL_ERROR:        'INTERNAL_ERROR',
} as const;

export type ApiErrorCode = typeof ApiErrorCode[keyof typeof ApiErrorCode];

export interface ApiError {
  code: ApiErrorCode;
  message: string;           // Human-readable, English, for logging/debugging
  details?: unknown;         // Optional: Zod validation errors, etc.
}

/**
 * Create a NextResponse with a standardised ApiError body.
 */
import { NextResponse } from 'next/server';

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: unknown,
): NextResponse<ApiError> {
  return NextResponse.json({ code, message, details }, { status });
}
```

### 2. Update `lib/api/validate.ts`
```typescript
// Before:
return { success: false, response: NextResponse.json({ errors: result.error.flatten() }, { status: 422 }) };

// After:
return {
  success: false,
  response: apiError('VALIDATION_ERROR', 'Validation failed', 422, result.error.flatten()),
};
```

### 3. Update route handlers
Replace all `NextResponse.json({ error: '…' }, { status: … })` calls:
```typescript
// Before:
return NextResponse.json({ error: "Email already in use" }, { status: 409 });

// After:
return apiError(ApiErrorCode.EMAIL_IN_USE, "Email address is already registered", 409);
```

### 4. Add error messages to i18n catalogues
`messages/en.json`:
```json
{
  "errors": {
    "UNAUTHENTICATED":     "You must be signed in to perform this action.",
    "FORBIDDEN":           "You do not have permission to perform this action.",
    "EMAIL_IN_USE":        "This email address is already registered.",
    "INVALID_CREDENTIALS": "Invalid email or password.",
    "NOT_FOUND":           "The requested resource was not found.",
    "ROOM_NOT_FOUND":      "This room does not exist.",
    "SLUG_ALREADY_TAKEN":  "This URL slug is already taken.",
    "VALIDATION_ERROR":    "The request contained invalid data.",
    "INVALID_JSON":        "The request body could not be parsed.",
    "EXPORT_FAILED":       "Canvas export failed. Please try again.",
    "INTERNAL_ERROR":      "An unexpected error occurred. Please try again."
  }
}
```
`messages/de.json`: Add corresponding German translations.

### 5. Update client-side error display
In any React component that displays API errors, use the error code:
```tsx
import { useTranslations } from 'next-intl';
const t = useTranslations();

// Instead of: error.message (English string from server)
// Use:        t(`errors.${error.code}`) (localised string from catalogue)
if (response.code) {
  setErrorMessage(t(`errors.${response.code}`, { fallback: response.message }));
}
```

### 6. Update existing API tests
```typescript
// Before:
expect(body.error).toBe("Email already in use");

// After:
expect(body.code).toBe("EMAIL_IN_USE");
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `lib/api/errors.ts` | New file: `ApiErrorCode` enum, `ApiError` type, `apiError()` helper |
| `lib/api/validate.ts` | Update 422 response to use `apiError()` |
| `app/api/auth/register/route.ts` | Replace string errors with `apiError()` |
| `app/api/auth/account/route.ts` | Replace string errors with `apiError()` |
| `app/api/auth/forgot-password/route.ts` | Replace string errors with `apiError()` |
| `app/api/auth/reset-password/route.ts` | Replace string errors with `apiError()` |
| `app/api/rooms/[roomId]/route.ts` | Replace string errors with `apiError()` |
| `app/api/rooms/[roomId]/commits/route.ts` | Replace string errors with `apiError()` |
| `app/api/rooms/[roomId]/export/route.ts` | Replace string errors with `apiError()` |
| `messages/en.json` | Add `errors.*` keys |
| `messages/de.json` | Add German `errors.*` keys |
| All `*.test.ts` files for API routes | Assert on `code` instead of `error` string |

## Additional Considerations

### Backward compatibility
Existing clients (if any) depend on `{ error: string }`. A transition period can include both:
```typescript
return NextResponse.json({ code: 'EMAIL_IN_USE', message: 'Email already in use', error: 'Email already in use' }, { status: 409 });
```
The `error` field can be removed once all clients have migrated to use `code`.

### OpenAPI integration
With a typed `ApiError` shape, `lib/api/openapi.ts` (P062) can include accurate error response schemas for all endpoints, replacing the current generic `{ description: 'Error' }` responses.

### Error code exhaustiveness
The `ApiErrorCode` object (using `as const`) ensures TypeScript will catch any `apiError()` call that uses an undefined code at compile time. New error codes must be added to `lib/api/errors.ts` before they can be used in route handlers.

### Logging correlation
The `apiError()` helper can optionally log the error before returning it:
```typescript
export function apiError(code, message, status, details?) {
  if (status >= 500) serverLogger.error({ code, details }, message);
  return NextResponse.json({ code, message, details }, { status });
}
```

## Testing Requirements
- `apiError('EMAIL_IN_USE', 'Email in use', 409)` returns a `NextResponse` with `status: 409` and body `{ code: 'EMAIL_IN_USE', message: 'Email in use' }`.
- `POST /api/auth/register` with a duplicate email returns `{ code: 'EMAIL_IN_USE' }` with status 409.
- `POST /api/auth/register` with invalid body returns `{ code: 'VALIDATION_ERROR', details: { … } }` with status 422.
- `PATCH /api/rooms/[roomId]` without auth returns `{ code: 'UNAUTHENTICATED' }` with status 401.
- All existing API route tests continue to pass after updating assertions from `error` string to `code`.

## Dependency Map
- Builds on: P014 ✅ (Zod validation — validate.ts is updated), P009 ✅ (i18n — new error catalogue keys), P050 ✅ (next-intl wiring)
- Complements: P062 (OpenAPI — error schemas are now typed), P063 (Copilot instructions — includes error code pattern)
- Independent of: Redis, database, WebSocket, Next.js build
