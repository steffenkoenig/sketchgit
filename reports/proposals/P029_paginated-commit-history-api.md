# P029 – Paginated Commit History REST API and Fix Unbounded Commit Query

## Title
Fix Unbounded Commit Query in `roomRepository.loadRoomSnapshot` and Add a Paginated Commit History REST API

## Brief Summary
`roomRepository.loadRoomSnapshot` loads every commit for a room with no upper bound, while the inline equivalent inside `server.ts` correctly caps the result at 100 rows. Rooms with large histories will therefore silently transmit megabytes of data and risk out-of-memory errors whenever the repository function is called. Additionally, no REST endpoint exists to fetch commit history older than the 100-row cap that the WebSocket server applies, leaving clients with no way to navigate the full history of long-lived rooms. This proposal fixes the unbounded query and adds the paginated endpoint that P011 originally promised but never delivered.

## Current Situation

### Unbounded query in `lib/db/roomRepository.ts`
```typescript
const [commits, branches, state] = await Promise.all([
  prisma.commit.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } }),
  // ↑ no `take:` — loads every commit unconditionally
  prisma.branch.findMany({ where: { roomId } }),
  prisma.roomState.findUnique({ where: { roomId } }),
]);
```
A room with 10,000 commits and 100 KB of canvas JSON per commit would return ~1 GB of data from a single query.

### Divergence from `server.ts`
The `dbLoadSnapshot` function inlined into `server.ts` added `take: 100` as part of P011:
```typescript
prisma.commit.findMany({
  where: { roomId },
  orderBy: { createdAt: "desc" },
  take: 100,
}),
```
These two implementations now diverge silently. Any future caller of `roomRepository.loadRoomSnapshot` inherits the unbounded behaviour.

### Missing pagination endpoint
P011 documented the intent to provide:
> "full history can be fetched via GET /api/rooms/:id/commits?cursor=<sha>"

No such endpoint exists. When a room has more than 100 commits, older history is unreachable from any client.

## Problem with Current Situation
1. **OOM risk**: A single call to `loadRoomSnapshot` on a busy room loads all commits into heap memory and transmits them across the database connection, potentially crashing the server process.
2. **Divergent implementations**: Two functions nominally doing the same job have different behaviour. The one without pagination is silently worse and more dangerous.
3. **No escape hatch for deep history**: Users whose timeline extends beyond 100 commits see a truncated view with no UI control to load older entries. Branch operations (checkout, merge) that reference commits beyond the window may silently fail.
4. **Unbounded query time**: Without a `take:` clause the query planner cannot use the `[roomId, createdAt]` index optimally and falls back to a full index scan that grows linearly with room size.

## Goal to Achieve
1. Apply a consistent, bounded default page size (100 rows) to `loadRoomSnapshot` in `roomRepository.ts` to match the behaviour already established in `server.ts`.
2. Expose a `GET /api/rooms/[roomId]/commits` endpoint with cursor-based pagination so clients can walk the full history incrementally.
3. Return responses in a stable, type-safe shape using Zod for request validation.
4. Cover both the fix and the new endpoint with automated tests.

## What Needs to Be Done

### 1. Fix `roomRepository.loadRoomSnapshot`
Add `take: 100` (or a configurable constant) and switch to descending order + reverse (consistent with the pattern in `server.ts`):
```typescript
const PAGE_SIZE = 100;

prisma.commit.findMany({
  where: { roomId },
  orderBy: { createdAt: "desc" },
  take: PAGE_SIZE,
}),
```
Reverse the results after fetch so the returned map preserves chronological order.

### 2. Add an optional `cursor` parameter to `loadRoomSnapshot`
For programmatic callers (e.g. the new REST endpoint) that need older pages:
```typescript
export async function loadRoomSnapshot(
  roomId: string,
  options?: { cursor?: string; take?: number }
): Promise<RoomSnapshot | null>
```
When `cursor` is supplied, use Prisma cursor pagination:
```typescript
prisma.commit.findMany({
  where: { roomId },
  orderBy: { createdAt: "desc" },
  take: options?.take ?? PAGE_SIZE,
  ...(options?.cursor ? { cursor: { sha: options.cursor }, skip: 1 } : {}),
}),
```

### 3. Create `app/api/rooms/[roomId]/commits/route.ts`
```
GET /api/rooms/:roomId/commits?cursor=<sha>&take=<n>
```
Request validation (Zod):
- `cursor` – optional, string, max 64 characters
- `take` – optional, integer 1–100, default 50

Response body:
```json
{
  "commits": [ { "sha": "…", "parent": "…", "branch": "…", "message": "…", "ts": 1234567890 } ],
  "nextCursor": "<sha-of-oldest-commit-in-this-page> | null"
}
```
Note: `canvasJson` is intentionally excluded from the list response (may be fetched per-commit via a separate endpoint to avoid large payloads).

Authentication: public rooms are freely readable; private rooms require an authenticated session with at least VIEWER membership.

### 4. Add tests
- `lib/db/roomRepository.test.ts`: assert that `loadRoomSnapshot` returns at most 100 commits even when the room has 150.
- `app/api/rooms/[roomId]/commits/route.test.ts`: assert cursor pagination, default page size, and membership guard.

## Components Affected
| Component | Change |
|-----------|--------|
| `lib/db/roomRepository.ts` | Add `take` + optional cursor to `loadRoomSnapshot` |
| `app/api/rooms/[roomId]/commits/route.ts` | **New file** – REST endpoint |
| `lib/api/validate.ts` | Reused for request schema validation |
| `lib/db/roomRepository.test.ts` | New tests for bounded query |
| `app/api/rooms/[roomId]/commits/route.test.ts` | **New test file** |

## Data & Database Model
No schema changes required. The existing `@@index([roomId, createdAt])` index on `Commit` (added in P011) is the correct covering index for this cursor pattern.

## Testing Requirements
- Unit test: seeded room with 150 commits → `loadRoomSnapshot` returns exactly 100.
- Unit test: cursor provided → next page starts after the cursor SHA.
- Integration test: unauthenticated GET on private room → 403.
- Integration test: valid cursor → response contains `nextCursor` pointing to the next page boundary.

## Linting and Type Requirements
- All new functions use explicit return types.
- `CommitRecord` re-exported from `roomRepository.ts` for use in the route handler.
- Zod schema for request query string placed in `lib/api/` alongside other validation schemas.

## Dependency Map
- Depends on: P011 ✅ (index added), P014 ✅ (Zod available)
- Enables: P030 (cache can safely warm up bounded pages), P033 (delta storage needs page-aware load)
