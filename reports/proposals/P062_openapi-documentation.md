# P062 – OpenAPI Specification Generation from Zod Schemas

## Title
Auto-generate an OpenAPI 3.1 Specification from Existing Zod Validation Schemas and Serve Interactive API Documentation

## Brief Summary
All Next.js API route handlers already validate request bodies using Zod schemas (P014). These schemas are the single source of truth for request/response shapes. Using `zod-to-json-schema` and a lightweight OpenAPI wrapper, the existing Zod schemas can be automatically compiled into a machine-readable OpenAPI 3.1 specification and served as interactive documentation at `/api/docs`. This eliminates the need to maintain a separate API contract document and ensures the documentation is always in sync with the actual validation logic.

## Current Situation
The project has eight REST endpoints across four resource groups:
- `POST /api/auth/register` — creates a new user account
- `DELETE /api/auth/account` — deletes the authenticated user's account
- `POST /api/auth/forgot-password` — initiates a password reset
- `POST /api/auth/reset-password` — completes a password reset
- `GET /api/rooms/[roomId]` — retrieves room metadata
- `PATCH /api/rooms/[roomId]` — updates room slug
- `GET /api/rooms/[roomId]/commits` — paginated commit history
- `GET /api/rooms/[roomId]/export` — exports canvas as PNG or SVG

Each endpoint's request body is validated with a dedicated Zod schema (in the route handler file or in `lib/api/wsSchemas.ts`). However, there is no machine-readable API contract. Developers and integrators must read the source code to understand the API surface.

### Relevant Zod schemas
```typescript
// app/api/auth/register/route.ts
const RegisterSchema = z.object({ email, password, name });

// app/api/rooms/[roomId]/route.ts
const PatchRoomSchema = z.object({ slug });

// app/api/rooms/[roomId]/commits/route.ts
const CommitsQuerySchema = z.object({ cursor, limit });

// app/api/rooms/[roomId]/export/route.ts
const ExportQuerySchema = z.object({ format: z.enum(['png', 'svg']) });
```

## Problem with Current Situation
1. **No API contract**: There is no OpenAPI spec, Postman collection, or other machine-readable API description. Each endpoint's behavior must be inferred from reading source code.
2. **Manual documentation drift**: Any hand-written documentation (e.g., in README) will drift from the actual validation schemas as the API evolves, since the Zod schemas are the only enforceable source of truth.
3. **Integration friction**: Third-party integrators and GitHub Copilot Coding Agent (which can read OpenAPI specs to understand the API) cannot discover the API surface without reading source code.
4. **No response type documentation**: There are no typed response schemas for success or error cases. The API contract only documents what inputs are accepted, not what outputs are produced.
5. **Inconsistent error response format**: Different route handlers return `{ error: string }` for validation failures in slightly different shapes. An OpenAPI spec would surface this inconsistency.

## Goal to Achieve
1. Create a `lib/api/openapi.ts` module that builds an OpenAPI 3.1 document programmatically from the existing Zod schemas.
2. Serve the spec as JSON at `GET /api/docs/openapi.json`.
3. Serve Swagger UI (or Redoc) at `GET /api/docs` for interactive browser-based exploration.
4. Ensure the spec is regenerated automatically as Zod schemas change (no manual sync step).
5. Add a CI step that verifies the generated spec is valid OpenAPI 3.1 using `@redocly/openapi-core`.

## What Needs to Be Done

### 1. Install dependencies
```bash
npm install --save-dev zod-to-json-schema @redocly/openapi-core
```
No runtime dependencies are added for the Swagger UI (served via CDN links in the HTML response, or via the `swagger-ui-dist` npm package pinned to a specific version).

### 2. Create `lib/api/openapi.ts`
```typescript
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// ─── Reuse existing schemas ───────────────────────────────────────────────────
// Import schemas from their respective route handler files.
// Each schema is already exported; this module assembles them into an OpenAPI doc.

export function buildOpenApiSpec(): object {
  return {
    openapi: '3.1.0',
    info: {
      title: 'SketchGit API',
      version: '1.0.0',
      description: 'REST API for the SketchGit collaborative canvas application.',
    },
    servers: [{ url: process.env.NEXTAUTH_URL ?? 'http://localhost:3000' }],
    paths: {
      '/api/auth/register': {
        post: {
          summary: 'Register a new user account',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                // `$refStrategy: 'root'` hoists shared sub-schemas into the
                // OpenAPI `components/schemas` section and emits `$ref` pointers
                // to them. This avoids duplicating the same schema inline in
                // every endpoint that references it. Use `$refStrategy: 'none'`
                // only for simple, leaf-level schemas that are never reused
                // across endpoints (it inlines the schema directly, suitable
                // for one-off query parameter objects).
                schema: zodToJsonSchema(RegisterSchema, { $refStrategy: 'root' }),
              },
            },
          },
          responses: {
            '201': { description: 'User created successfully' },
            '409': { description: 'Email address already in use' },
            '422': { description: 'Validation error' },
          },
        },
      },
      // … one entry per endpoint
    },
  };
}
```

### 3. Create `app/api/docs/openapi.json/route.ts`
```typescript
import { NextResponse } from 'next/server';
import { buildOpenApiSpec } from '@/lib/api/openapi';

export function GET() {
  return NextResponse.json(buildOpenApiSpec());
}
```

### 4. Create `app/api/docs/route.ts` (Swagger UI)
```typescript
import { NextResponse } from 'next/server';

export function GET() {
  const html = `<!DOCTYPE html>
<html>
  <head>
    <title>SketchGit API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({ url: '/api/docs/openapi.json', dom_id: '#swagger-ui' });
    </script>
  </body>
</html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
}
```

### 5. Export schemas from route handlers
Move Zod schemas that are currently defined inline in route handlers to named exports so they can be imported in `lib/api/openapi.ts` without creating circular dependencies:
```typescript
// app/api/auth/register/route.ts
export const RegisterSchema = z.object({ … });
```

### 6. Add CI validation step
```yaml
# .github/workflows/ci.yml
- name: Validate OpenAPI spec
  run: npx @redocly/openapi-core lint /dev/stdin <<< "$(curl -s http://localhost:3000/api/docs/openapi.json)"
  # Alternative: generate spec to a file during the build and lint the file
```
Simpler approach: add a `scripts/validate-openapi.ts` script that calls `buildOpenApiSpec()` and writes the result to `openapi.json`, then runs `redocly lint openapi.json`.

### 7. Document response schemas
For each endpoint, add a Zod schema for the success response shape and include it in the OpenAPI spec:
```typescript
const RegisterResponseSchema = z.object({ id: z.string(), email: z.string() });
```
This is a secondary goal; the primary goal is to document request shapes that are already Zod-validated.

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `package.json` | Add `zod-to-json-schema` (dev); `@redocly/openapi-core` (dev) |
| `lib/api/openapi.ts` | New file: OpenAPI spec builder |
| `app/api/docs/openapi.json/route.ts` | New file: serves the spec as JSON |
| `app/api/docs/route.ts` | New file: serves Swagger UI HTML |
| `app/api/auth/register/route.ts` | Export `RegisterSchema` |
| `app/api/auth/account/route.ts` | Export request schema |
| `app/api/rooms/[roomId]/route.ts` | Export `PatchRoomSchema` |
| `app/api/rooms/[roomId]/commits/route.ts` | Export query schema |
| `app/api/rooms/[roomId]/export/route.ts` | Export `ExportQuerySchema` |
| `.github/workflows/ci.yml` | Add `validate-openapi` step |

## Additional Considerations

### Security: authentication documentation
The OpenAPI spec should document which endpoints require authentication (via `securitySchemes: { sessionCookie: { type: 'apiKey', in: 'cookie', name: 'next-auth.session-token' } }`) so integrators understand that API calls require a valid session.

### Avoiding CDN dependency for Swagger UI
The Swagger UI HTML currently references `unpkg.com` CDN. This conflicts with the nonce-based CSP implemented in P056. Two options:
1. Add `unpkg.com` to the CSP `script-src` for the `/api/docs` path only (via a route-specific CSP override in `proxy.ts`).
2. Install `swagger-ui-dist` as a devDependency and serve the static assets from `public/swagger-ui/`.

Option 2 is preferred for P056 CSP compliance.

### Keeping schemas in sync
Because `lib/api/openapi.ts` imports the Zod schemas directly, any change to a schema automatically updates the spec at next build. The CI validation step will catch any spec that becomes invalid after a schema change.

### `next-intl` locale prefix
The API routes do not use i18n URL prefixes. The OpenAPI spec should reflect the actual routes (`/api/…`) without locale prefix.

## Testing Requirements
- `GET /api/docs/openapi.json` returns a valid JSON response with `openapi: '3.1.0'`.
- `GET /api/docs` returns an HTML response containing Swagger UI.
- `buildOpenApiSpec()` is a pure function that returns a stable object (deterministic for the same input schemas).
- Redocly validation passes for the generated spec in CI.
- All existing API route tests are unaffected.

## Dependency Map
- Builds on: P014 ✅ (Zod input validation — schemas already exist), P016 ✅ (CI pipeline)
- Complements: P063 (GitHub Copilot configuration — Copilot can reference the OpenAPI spec)
- Independent of: Redis, database, auth implementation
