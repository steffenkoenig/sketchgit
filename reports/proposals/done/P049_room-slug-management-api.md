# P049 – Room Slug Management REST API

## Title
Add a `PATCH /api/rooms/[roomId]` Endpoint to Allow Room Owners to Set a Memorable Slug

## Brief Summary
The `Room` model has a `slug String? @unique` column in the Prisma schema that is intended to give rooms memorable, human-readable names. The dashboard already displays `room.slug ?? room.id` for each room card, demonstrating that slugs were designed to replace the UUID-style room ID in the UI. However, there is no API endpoint to set, update, or clear a slug. The column exists in the database but is never written. Adding `PATCH /api/rooms/[roomId]` fills this gap with a single small route, enabling users to name their rooms and share links like `/?room=my-project` instead of `/?room=8c3f-a1b2`.

## Current Situation
### Schema
```prisma
model Room {
  id        String   @id
  slug      String?  @unique   // ← exists, never written
  ownerId   String?
  isPublic  Boolean  @default(true)
  // …
}
```

### Dashboard display
```tsx
// app/dashboard/page.tsx
<span className="font-medium text-sm truncate max-w-[140px]">
  {room.slug ?? room.id}   // ← reads slug, always falls back to id
</span>
```

### Room link
```tsx
<Link href={`/?room=${encodeURIComponent(room.id)}`} …>
  // ← always links by id, never by slug
</Link>
```

### No write path
There is no `PATCH /api/rooms/[id]` route, no slug input on the dashboard, and no `updateRoomSlug` function in `roomRepository.ts`. The `slug` column will remain null for all rooms until this proposal is implemented.

## Problem with Current Situation
1. **Non-functional schema field**: A database column exists and is declared `@unique`, occupying index space and adding cognitive overhead to anyone reading the schema, but it is never populated. This is misleading.
2. **Unshared UUIDs**: Room IDs are UUIDs (8-char alphanumeric slugs like `abc12345`). Sharing a link requires copying the entire UUID. A readable slug like `team-sprint-3` is much easier to share verbally or in a chat message.
3. **Broken dashboard UX**: The dashboard shows `room.slug ?? room.id` but slugs are always null, so it always shows the raw UUID. The UX intention (readable names) is never realised.
4. **No room naming workflow**: There is no way for a team to establish a shared room name that survives URL changes. The room ID can only be shared as a UUID.

## Goal to Achieve
1. Add `PATCH /api/rooms/[roomId]` that accepts `{ slug: string | null }` and updates the room's slug.
2. Require the requester to be the room owner (or have `OWNER` role in `RoomMembership`).
3. Validate the slug: URL-safe characters only, 3–50 characters, lowercase alphanumeric and hyphens.
4. When a slug is set, allow clients to join via `/?room=<slug>` in addition to `/?room=<id>` (resolve slug to room ID on the server).
5. Show a "Rename" button on the dashboard room card that opens an inline edit field.
6. Add `PATCH` tests covering auth, validation, and ownership checks.

## What Needs to Be Done

### 1. Create `app/api/rooms/[roomId]/route.ts`
```typescript
// PATCH /api/rooms/:roomId
// Body: { slug: string | null }
import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validate } from '@/lib/api/validate';
import { prisma } from '@/lib/db/prisma';
import { getAuthSession } from '@/lib/authTypes';

const PatchRoomSchema = z.object({
  slug: z.string()
    .min(3, 'Slug must be at least 3 characters')
    .max(50, 'Slug must be at most 50 characters')
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Slug must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen')
    .nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  const session = await auth();
  const authSession = getAuthSession(session);

  if (!authSession) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const userId = authSession.user.id;
  const { roomId } = params;

  // Verify ownership
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { ownerId: true, memberships: { where: { userId, role: 'OWNER' } } },
  });

  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

  const isOwner = room.ownerId === userId || room.memberships.length > 0;
  if (!isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body: unknown = await req.json().catch(() => null);
  if (body === null) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const v = validate(PatchRoomSchema, body);
  if (!v.success) return v.response;

  try {
    const updated = await prisma.room.update({
      where: { id: roomId },
      data: { slug: v.data.slug },
      select: { id: true, slug: true },
    });
    return NextResponse.json(updated);
  } catch (err: unknown) {
    // Prisma unique constraint violation → slug already in use
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Slug is already taken' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### 2. Add `resolveRoomId` helper to `lib/db/roomRepository.ts`
Allow joining by slug OR by raw ID:
```typescript
/**
 * Resolve a room identifier that may be either a room ID or a slug.
 * Returns the canonical room ID, or null if no room matches.
 */
export async function resolveRoomId(idOrSlug: string): Promise<string | null> {
  const room = await prisma.room.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: { id: true },
  });
  return room?.id ?? null;
}
```

### 3. Add slug resolution to the WebSocket upgrade handler in `server.ts`
```typescript
// In the 'upgrade' handler, after safeRoomId():
const rawRoomId = reqUrl.searchParams.get("room");
const resolvedRoomId = await resolveRoomId(rawRoomId ?? "default");
const roomId = resolvedRoomId ?? safeRoomId(rawRoomId);
```

### 4. Add "Rename" UI on the dashboard
```tsx
// app/dashboard/page.tsx – inline rename input per room card
<button
  onClick={() => setEditingSlug(room.id)}
  className="text-xs text-slate-500 hover:text-violet-400"
  aria-label={`Rename room ${room.slug ?? room.id}`}
>
  ✏ Rename
</button>
```

On save, call `PATCH /api/rooms/:id` with the new slug. On success, refetch the room list.

### 5. Update room links to use slug when available
```tsx
<Link href={`/?room=${encodeURIComponent(room.slug ?? room.id)}`} …>
```

### 6. Tests in `app/api/rooms/[roomId]/route.test.ts`
- Non-owner PATCH → 403.
- Valid slug → 200, slug stored.
- Duplicate slug → 409 with `{ error: "Slug is already taken" }`.
- Invalid slug (spaces, uppercase, too short) → 422 with Zod error.
- Clear slug with `{ slug: null }` → 200, slug set to null.
- Unauthenticated → 401.

## Components Affected
| Component | Change |
|-----------|--------|
| `app/api/rooms/[roomId]/route.ts` | **New file** – PATCH endpoint |
| `lib/db/roomRepository.ts` | Add `resolveRoomId` helper |
| `server.ts` | Use `resolveRoomId` in the WS upgrade handler |
| `app/dashboard/page.tsx` | Add "Rename" button + inline edit form |
| `app/api/rooms/[roomId]/route.test.ts` | **New file** – unit tests |

## Data & Database Model
No schema changes. `Room.slug` already exists as `String? @unique`. The `resolveRoomId` function uses a `findFirst` with `OR: [{ id }, { slug }]` which is efficient because `id` is the primary key and `slug` has a unique index.

**Slug format rules** (enforced by Zod + Postgres unique constraint):
- 3–50 characters
- Lowercase alphanumeric and hyphens only: `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`
- Cannot start or end with a hyphen (URL-friendly)
- Must be unique across all rooms

## Testing Requirements
- Owner can set slug: verified.
- Non-owner (EDITOR, VIEWER) cannot set slug: 403.
- Slug with spaces: 422.
- Slug starting with hyphen: 422.
- Slug `"ab"` (too short): 422.
- Slug `"a".repeat(51)` (too long): 422.
- Slug already used by another room: 409.
- Setting `null` clears the slug.
- WS join by slug (`?room=my-slug`) connects to correct room.

## Dependency Map
- Depends on: P003 ✅ (Prisma + Room.slug in schema), P007 ✅ (auth for ownership check), P014 ✅ (Zod validation)
- Complements: P034 (room access control — owner check in PATCH aligns with membership role system)
- Enables: Shareable vanity URLs, QR codes for rooms, team-friendly room names
