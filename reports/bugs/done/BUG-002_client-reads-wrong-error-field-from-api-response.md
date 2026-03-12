# BUG-002 – Client components read wrong field from API error responses

| Field | Value |
|---|---|
| **ID** | BUG-002 |
| **Severity** | Medium |
| **Category** | UI / Error handling |
| **Status** | Open |

## Summary

Two React client components try to display an API error message by reading `data.error` from the JSON response body. However, the `apiError()` helper (which all API routes must use) returns `{ code, message, details }` — not `{ error: '...' }`. Because `data.error` is always `undefined`, the components always display a hardcoded fallback string instead of the real server error message.

## Affected Files

| File | Line | Faulty code |
|---|---|---|
| `components/dashboard/RenameRoomButton.tsx` | 37 | `setError(data.error ?? "Failed to save slug.")` |
| `components/auth/DeleteAccountButton.tsx` | 32 | `setError(data.error ?? "Failed to delete account.")` |

## Root Cause

The project's standard error response shape (from `lib/api/errors.ts`) is:

```ts
// apiError() returns:
{ code: string, message: string, details?: unknown }
```

Both components parse the response and try to read `data.error`:

```ts
// RenameRoomButton.tsx — WRONG
const data = await res.json() as { error?: string };
setSaving(false);
if (!res.ok) {
  setError(data.error ?? "Failed to save slug."); // data.error is always undefined
  return;
}
```

```ts
// DeleteAccountButton.tsx — WRONG
const data = await res.json() as { error?: string };
setLoading(false);
if (!res.ok) {
  setError(data.error ?? "Failed to delete account."); // data.error is always undefined
}
```

Because `data.error` is always `undefined`, the `??` fallback is always used — the actual server message (e.g., "Slug is already taken.", "Incorrect password.") is never shown to the user.

## Impact

- Users see a generic fallback string (e.g., "Failed to save slug.") regardless of the actual error (e.g., "Slug is already taken.", "Invalid input: slug must contain only lowercase letters…").
- The `code` field provided by the API for stable client-side matching is ignored.
- Debugging is harder: the real error reason is discarded silently.

## Suggested Fix

Change both components to read `data.message` (or optionally `data.code` for i18n) instead of `data.error`:

```ts
// RenameRoomButton.tsx — CORRECT
import type { ApiErrorBody } from "@/lib/api/errors";

const data = await res.json() as ApiErrorBody;
if (!res.ok) {
  setError(data.message ?? "Failed to save slug.");
  return;
}
```

```ts
// DeleteAccountButton.tsx — CORRECT
import type { ApiErrorBody } from "@/lib/api/errors";

const data = await res.json() as ApiErrorBody;
if (!res.ok) {
  setError(data.message ?? "Failed to delete account.");
}
```

For i18n support (recommended per the project guidelines), use `data.code` as the translation key:

```ts
// With next-intl translation
const t = useTranslations("errors");
setError(data.code ? t(data.code) : "Failed to save slug.");
```
