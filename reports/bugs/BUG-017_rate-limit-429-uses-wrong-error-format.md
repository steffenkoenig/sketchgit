# BUG-017 – Rate-limit 429 response uses wrong error body format

## Summary
`proxy.ts` returns `{ error: '...' }` for 429 Too Many Requests responses instead of the standardised `{ code, message }` shape produced by `apiError()`.

## Severity
`low`

## Category
`API / Route Defects`

## Current Behaviour
When the in-memory rate limiter (`applyRateLimitInMemory`, line 120) or the Redis rate limiter (`applyRateLimitRedis` callback, line 154) decides a request exceeds the limit, both call `NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 })` directly.  The body shape is `{ error: string }`, which does not match the project's standardised error envelope `{ code: string, message: string, details? }` defined in `lib/api/errors.ts`.

## Expected Behaviour
All API error responses — including 429 — must be returned via `apiError()` from `lib/api/errors.ts` and must carry the `{ code, message }` shape.  A suitable error code (e.g. a new `RATE_LIMITED` entry in `ApiErrorCode`) should be used so clients can match the error programmatically.

## Steps to Reproduce
1. Set `RATE_LIMIT_MAX=1` and `RATE_LIMIT_WINDOW=60` in the environment.
2. Send two `POST /api/auth/register` requests in quick succession from the same IP.
3. Inspect the body of the second (429) response.
4. Observe: `{ "error": "Too many requests. Please try again later." }` — not `{ "code": "...", "message": "..." }`.

## Affected Files and Sections

| File | Lines / Symbol | Notes |
|------|---------------|-------|
| `proxy.ts` | L120–L131 / `applyRateLimitInMemory()` | Direct `NextResponse.json({ error })` |
| `proxy.ts` | L154–L165 / `applyRateLimitRedis()` callback | Direct `NextResponse.json({ error })` |
| `lib/api/errors.ts` | `ApiErrorCode` object | Missing `RATE_LIMITED` code |

## Root Cause Analysis
The middleware (`proxy.ts`) was implemented before the standardised `apiError()` helper was introduced (P068) and was never updated to use it.  Additionally, the `ApiErrorCode` enum in `lib/api/errors.ts` does not include a `RATE_LIMITED` code, so using `apiError()` would require adding one.

## Suggested Fix
1. Add `RATE_LIMITED: "RATE_LIMITED"` to the `ApiErrorCode` object in `lib/api/errors.ts`.
2. Replace both raw `NextResponse.json({ error: '...' }, { status: 429 })` calls in `proxy.ts` with `apiError(ApiErrorCode.RATE_LIMITED, "Too many requests. Please try again later.", 429)`, preserving the existing `Retry-After` and `X-RateLimit-*` headers by spreading them into the third options argument of `NextResponse.json` (or by using `apiError` then adding the headers afterwards).

## Additional Notes
The two affected code paths cover both the Redis-backed and the in-memory fallback rate-limiter.  Both must be updated.  The inconsistent body shape would cause any client that parses `data.code` on a 429 response to silently receive `undefined` instead of a matchable error code.

## Status
`open`
