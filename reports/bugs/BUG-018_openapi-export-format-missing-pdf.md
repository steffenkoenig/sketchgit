# BUG-018 – OpenAPI spec documents export `format` enum without `"pdf"`

## Summary
`lib/api/openapi.ts` hardcodes the export `format` parameter enum as `["png", "svg"]`, but the actual route accepts `["png", "svg", "pdf"]`; the PDF format is entirely absent from the generated API docs.

## Severity
`low`

## Category
`API / Route Defects`

## Current Behaviour
`buildOpenApiSpec()` defines the `/api/rooms/{roomId}/export` path manually.  The `format` query-parameter schema is written inline as:
```json
{ "type": "string", "enum": ["png", "svg"], "default": "png" }
```
The 200-response content types are also limited to `image/png` and `image/svg+xml`.

The actual `ExportQuerySchema` (in `app/api/rooms/[roomId]/export/route.ts`, line 30) is:
```typescript
format: z.enum(["png", "svg", "pdf"]).default("png")
```
…and the route handler returns `application/pdf` when `format=pdf` is supplied (line 114).

The `ExportQuery` component schema **is** generated from `ExportQuerySchema` via `schema(ExportQuerySchema)` (line 85 of `openapi.ts`), but the path-level parameter uses a hardcoded inline schema instead of a `$ref` to that component, so the correct enum never appears in the rendered documentation.

## Expected Behaviour
The `format` enum in the path definition should include `"pdf"`, and the 200-response `content` map should include `application/pdf`.  The introductory comment in `openapi.ts` states that "schemas are the single source of truth; the spec is always in sync with the actual validation logic" — currently it is not.

## Steps to Reproduce
1. Start the application and open `/api/docs`.
2. Locate the `GET /api/rooms/{roomId}/export` operation.
3. Observe that the `format` parameter only lists `png` and `svg`.
4. Send `GET /api/rooms/{roomId}/export?format=pdf` — the server returns a valid PDF despite the docs saying the format is invalid.

## Affected Files and Sections

| File | Lines / Symbol | Notes |
|------|---------------|-------|
| `lib/api/openapi.ts` | L300–L305 / `buildOpenApiSpec()` | Hardcoded `enum: ["png","svg"]`; missing `"pdf"` |
| `lib/api/openapi.ts` | L316–L320 / `responses["200"].content` | Missing `application/pdf` response content entry |
| `app/api/rooms/[roomId]/export/route.ts` | L30 / `ExportQuerySchema` | Accepts `"pdf"` but not reflected in path docs |

## Root Cause Analysis
The export path definition in `buildOpenApiSpec()` was written before PDF support was added (P076) and was not updated when `ExportQuerySchema` gained the `"pdf"` value.  The path uses a hand-written inline schema rather than `{ $ref: '#/components/schemas/ExportQuery' }`, so the auto-generated component schema and the path documentation diverged silently.

## Suggested Fix
Replace the hardcoded inline `format` parameter schema in the `/api/rooms/{roomId}/export` path with a `$ref` to the already-generated `ExportQuery` component, or manually add `"pdf"` to the enum and add an `application/pdf` entry to the 200-response content map.  Also update the operation `summary` from "Export room canvas as PNG or SVG" to include PDF.

## Additional Notes
No runtime defect; the route itself works correctly for all three formats.  The impact is limited to developers relying on the generated `/api/docs` UI to discover the API — they would be unaware that PDF export is available.

## Status
`open`
