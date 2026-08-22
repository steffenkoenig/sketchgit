# Skill: New API Route

## Purpose
Scaffold a new Next.js API route handler under `app/api/` that follows SketchGit's
established conventions exactly, plus a companion test file.

## When to Use
The request is to add a new HTTP endpoint — e.g. "Add a POST handler to
`/api/rooms/[roomId]/tags`" or "Add a `DELETE /api/rooms/[roomId]/tags/[tagId]`
endpoint".

## Required Inputs
- **Route path**: relative to `app/api/`, e.g. `rooms/[roomId]/tags`.
- **HTTP method(s)**: `GET`, `POST`, `PATCH`, or `DELETE`.
- **Auth requirement**: whether the route requires an authenticated session, and
  whether it further requires room membership / a specific role (`OWNER`,
  `EDITOR`, `VIEWER`).
- **Request/response shape**: the fields the body accepts and what the success
  response returns.

If any of these are ambiguous, ask before generating code — a route with the
wrong auth check is a security defect, not a style nit.

## Canonical Pattern

Study `app/api/rooms/[roomId]/object-lock/route.ts` and
`app/api/rooms/[roomId]/route.ts` before writing new code — they are the
reference implementations this skill mirrors.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { checkRoomAccess /* , other repository functions */ } from "@/lib/db/roomRepository";

// Export the schema as a named constant — required so P062's OpenAPI generator
// (lib/api/openapi.ts) can introspect it.
export const <Name>RequestSchema = z.object({
  // ...fields, with .max() bounds on every string/array field
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;

  // 1. Parse JSON body defensively — req.json() throws on invalid JSON/empty body.
  const body: unknown = await req.json().catch(() => null);
  if (body === null) {
    return apiError(ApiErrorCode.INVALID_JSON, "Invalid JSON", 400);
  }

  // 2. Validate with Zod via the shared helper (returns a typed error response on failure).
  const v = validate(<Name>RequestSchema, body);
  if (!v.success) return v.response;
  const { /* destructure validated fields */ } = v.data;

  // 3. Auth — every route that reads or writes room data checks the session
  //    and calls checkRoomAccess(). Anonymous/public rooms are allowed by
  //    checkRoomAccess() itself; do not special-case them here.
  const session = await auth();
  const authSession = getAuthSession(session);
  const access = await checkRoomAccess(roomId, authSession?.user.id ?? null);
  if (!access.allowed) {
    return apiError(ApiErrorCode.FORBIDDEN, "Access denied", 403);
  }
  // For mutating routes, also check access.role !== "VIEWER" (or "OWNER" for
  // admin-only actions like share-link management — see
  // app/api/rooms/[roomId]/share-links/route.ts).

  // 4. Do the work — call a repository function in lib/db/roomRepository.ts
  //    or lib/db/userRepository.ts. NEVER import `prisma` directly in a route
  //    handler (BUG-001/BUG-006 — this is a hard rule enforced by the
  //    bug-scanner agent).

  // 5. If the action has a real-time effect other room members should see
  //    immediately, call broadcastToRoom() from lib/server/wsRoomBroadcaster.ts
  //    — see the new-ws-message-type skill for the full pattern.

  return NextResponse.json({ /* success payload */ }, { status: 200 });
}
```

### Error responses
Always use `apiError(code, message, status)` from `lib/api/errors.ts` —
never `NextResponse.json({ error: ... })` directly (BUG-002/BUG-017 territory).
Check `lib/api/errors.ts`'s `ApiErrorCode` enum for an existing code before
adding a new one.

### Rate limiting
If the route is auth-sensitive (login, password reset, registration), add it
to `RATE_LIMITED_PATHS` and `config.matcher` in `proxy.ts` — see BUG-016.

## Companion Test File

Create `<route-dir>/route.test.ts` alongside the route, mocking `@/lib/auth`
and `@/lib/db/prisma` (not the repository functions — mock at the Prisma
client boundary so the repository's own logic is exercised). Use the shared
factories from `lib/test/factories.ts` (`makeRoom`, `makeMembership`, etc.)
rather than inline literal objects. Follow the structure of
`app/api/rooms/[roomId]/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: { /* only the models/methods this route actually touches */ },
}));

import { POST } from './route';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { NextRequest } from 'next/server';
import { makeRoom, makeMembership } from '@/lib/test/factories';

describe('POST /api/rooms/[roomId]/<name>', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 on invalid JSON', async () => { /* ... */ });
  it('returns 400 on schema validation failure', async () => { /* ... */ });
  it('returns 401 when not authenticated (if auth is required)', async () => { /* ... */ });
  it('returns 403 when the caller lacks access/role', async () => { /* ... */ });
  it('returns 200/201 and the expected payload on success', async () => { /* ... */ });
});
```

Cover every status code the handler can return — the CI gate expects branch
coverage on error paths, not just the happy path.

## Output Checklist
- [ ] `app/api/<path>/route.ts` created, following the canonical pattern above.
- [ ] Zod schema exported as a named constant.
- [ ] `app/api/<path>/route.test.ts` created, covering every status code.
- [ ] `npx tsc --noEmit`, `npm run lint`, and `npm test` all pass.
- [ ] If the route is auth-sensitive, added to `proxy.ts`'s rate-limit config.
- [ ] If the route documents a new/changed Zod shape, verify
      `lib/api/openapi.ts` picks it up automatically (it introspects exported
      schemas — no manual registration needed for standard patterns).
