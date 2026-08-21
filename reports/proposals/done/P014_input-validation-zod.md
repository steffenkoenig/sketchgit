# P014 – Input Validation with Zod

## Title
Add Structured Input Validation to All API Endpoints with Zod

## Brief Summary
The API endpoints in `app/api/` parse request bodies and query parameters without schema validation. Invalid or malicious inputs can reach the database layer and produce confusing errors or unexpected behaviour. Introducing Zod as a validation library provides a single authoritative schema per endpoint, generates TypeScript types automatically, and returns consistent, user-friendly error responses.

## Current Situation
The custom registration endpoint is the primary example:

```typescript
// app/api/auth/register/route.ts (approximate current code)
export async function POST(req: Request) {
  const body = await req.json(); // body is 'any'
  const { email, password, name } = body; // no validation
  // email could be undefined, empty, or not an email address
  // password could be one character or contain control characters
  const user = await createUser(email, password, name);
  ...
}
```

Similar unvalidated parsing exists in the WebSocket server upgrade handler:
```js
// server.mjs
const { searchParams } = new URL(req.url, 'http://localhost');
const roomId = searchParams.get('room');   // could be null, empty, or very long
const name   = searchParams.get('name');   // no length or character constraints
const color  = searchParams.get('color');  // no hex-color validation
```

WebSocket messages themselves are parsed with a bare `JSON.parse` and immediately destructured without checking that required fields exist or have the expected types.

## Problem with Current Situation
1. **Type safety gap**: `req.json()` returns `unknown` (or `any` in practice), so all subsequent property accesses are unchecked. TypeScript cannot warn about missing or wrong-typed fields.
2. **Database errors leak to the client**: If `email` is `undefined`, Prisma will throw a database-level error (e.g., `null constraint violation`) that bubbles up as a generic 500 rather than a clear 400 Bad Request.
3. **No consistent error format**: Different endpoints handle validation failures differently (some return plain strings, others return JSON objects with varying shapes), making client-side error handling complex.
4. **Security risk**: Without length constraints, an attacker can send arbitrarily large strings in `name` or `email`, consuming memory and CPU. Without format validation, SQL-injection-like payloads reach the ORM (Prisma parameterizes queries, but defence in depth is best practice).
5. **No single source of truth for API contracts**: The shape of each request is implied by how it is used rather than declared explicitly, which makes documentation and client code generation harder.

## Goal to Achieve
1. Every API endpoint validates its input against an explicit Zod schema before any business logic runs.
2. Validation errors return a `422 Unprocessable Entity` with a structured JSON body (`{ errors: [{ field, message }] }`).
3. TypeScript infers request types from Zod schemas—no manual interface duplication.
4. WebSocket message handlers narrow to typed message objects using Zod's discriminated union.
5. Validation schemas are co-located with their routes and can be exported for use in client-side form validation.

## What Needs to Be Done

### 1. Install Zod
```bash
npm install zod
```
Zod has no runtime dependencies and adds ~12 KB gzipped to the server bundle (tree-shaken).

### 2. Define schemas for existing endpoints

#### Registration endpoint
```typescript
// app/api/auth/register/route.ts
import { z } from 'zod';

const RegisterSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100).optional(),
});
```

#### WebSocket upgrade query parameters
```typescript
// server.ts (after P013 migration)
import { z } from 'zod';

const WsQuerySchema = z.object({
  room:  z.string().min(1).max(100),
  name:  z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
```

#### WebSocket message discriminated union
```typescript
const WsMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cursor'),     x: z.number(), y: z.number() }),
  z.object({ type: z.literal('draw'),       canvas: z.string() }),
  z.object({ type: z.literal('draw-delta'), added: z.array(z.unknown()), modified: z.array(z.unknown()), removed: z.array(z.string()) }),
  z.object({ type: z.literal('commit'),     sha: z.string(), message: z.string(), canvas: z.string() }),
  z.object({ type: z.literal('fullsync-request') }),
  z.object({ type: z.literal('profile'),    name: z.string().max(50), color: z.string() }),
  // ...other message types
]);
```

### 3. Create a reusable validation helper
```typescript
// lib/api/validate.ts
import { ZodSchema, ZodError } from 'zod';
import { NextResponse } from 'next/server';

export function validate<T>(schema: ZodSchema<T>, data: unknown):
  | { success: true; data: T }
  | { success: false; response: NextResponse }
{
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    response: NextResponse.json(
      { errors: result.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })) },
      { status: 422 },
    ),
  };
}
```

### 4. Apply validation at all API boundaries
```typescript
// app/api/auth/register/route.ts
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const validated = validate(RegisterSchema, body);
  if (!validated.success) return validated.response;
  const { email, password, name } = validated.data; // fully typed
  ...
}
```

### 5. Export schemas for client-side reuse
Where the same validation applies to both the server API and a React form, export the Zod schema from the route file (or a shared `lib/schemas/` folder) and import it in the form component to use with `react-hook-form` and `@hookform/resolvers/zod`.

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `app/api/auth/register/route.ts` | Add `RegisterSchema`; validate before business logic |
| `server.ts` (after P013) | Add `WsQuerySchema` for upgrade params; `WsMessageSchema` for message routing |
| `lib/api/validate.ts` | New shared validation helper (to be created) |
| `lib/schemas/` | Optional: centralized schema definitions for shared client/server use |
| `package.json` | Add `zod` dependency |

## Additional Considerations

### Zod vs. alternatives
- **Valibot**: Smaller bundle, similar API. Consider if bundle size is a constraint.
- **class-validator**: Decorator-based, heavier; not idiomatic in functional Next.js code.
- **Yup**: Older, less type-safe inference. Zod is the modern standard for TypeScript-first projects.

### Avoiding double validation
Once Zod schemas are defined server-side, use them directly with `@hookform/resolvers/zod` in React forms to ensure client and server validation logic are always in sync.

### Rate limiting interaction
Validation should run before rate-limit counting (see P015) so that clearly malformed requests are rejected cheaply before any database or rate-limit store is consulted.

### Error message i18n
If the application expands its i18n support (P009), Zod error messages can be mapped to i18n keys using a custom `errorMap`:
```typescript
z.setErrorMap((issue, ctx) => ({ message: t(`errors.${issue.code}`) }));
```
