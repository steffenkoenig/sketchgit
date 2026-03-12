# P074 – Room Activity Feed and Audit Log

## Title
Persist a Per-Room Activity Feed of Commits, Branch Operations, and Membership Events for Traceability and GDPR Compliance

## Brief Summary
The application currently has no record of who committed what, when branches were created or deleted, or when users joined and left rooms. This information exists transiently in the WebSocket session but is never written to the database. Adding a `RoomEvent` model (an append-only audit log) with structured event types enables features like an in-app activity timeline ("Alice committed 'Add logo' 3 hours ago"), GDPR data export (P041), per-room analytics, and retrospective debugging of collaboration sessions.

## Current Situation
The `Commit` model stores commits, but:
- Branch creation events are not persisted (a branch is only stored when it has at least one commit pointing to it in the `Branch` table).
- Membership events (join, leave) are transient — only the current presence state (Redis hash, P035) and the static `RoomMembership` table are stored. No history of when users connected or disconnected.
- Rollback events (P053 `cpRollback`) update the `Branch.headSha` in the database but leave no audit record of who did the rollback or when.
- The `RoomMembership` table records roles but has no `joinedAt` timestamp beyond `createdAt` on the `User` model.

### Relevant files
```
prisma/schema.prisma           ← no RoomEvent or activity model
lib/db/roomRepository.ts       ← saveCommit persists commits, no events
server.ts                      ← branch-update, commit, cursor WS handlers
app/api/rooms/[roomId]/        ← no activity feed endpoint
```

## Problem with Current Situation
1. **No audit trail**: There is no way to answer "Who rolled back branch X to commit Y, and when?" The `Branch.headSha` reflects the current state but not the history of changes.
2. **GDPR gap**: P041 implements account deletion (including cascade deleting commits). However, the GDPR data export (one of the six data subject rights) cannot be fulfilled comprehensively because user activity in rooms (join times, commit authorship beyond the `Commit.authorId` FK) is not systematically recorded.
3. **No in-app activity feed**: Users have no way to see recent activity in a room ("What happened while I was away?") without manually comparing the timeline.
4. **Branch creation is not persisted**: A branch that is created but never committed to (e.g., `git checkout -b feature/idea` with no commits yet) is not recorded anywhere. The `Branch` table is only populated on the first commit to a branch.
5. **Debugging collaboration issues**: When a collaboration session goes wrong (e.g., a canvas snapshot is lost or a branch is incorrectly rolled back), there is no historical record to help diagnose the sequence of events.

## Goal to Achieve
1. Add a `RoomEvent` Prisma model with structured `eventType`, `actorId`, `roomId`, `payload`, and `createdAt` fields.
2. Write events in `server.ts` and `lib/db/roomRepository.ts` for: `COMMIT`, `BRANCH_CREATE`, `BRANCH_CHECKOUT`, `ROLLBACK`, `MEMBER_JOIN`, `MEMBER_LEAVE`.
3. Expose `GET /api/rooms/[roomId]/events` for room owners/members to retrieve the recent activity feed (paginated, last 100 events).
4. Include `RoomEvent` records in the GDPR data export (P041 complement).
5. Enforce a maximum retention period for events via the pruning job (P032) to prevent unbounded growth.

## What Needs to Be Done

### 1. Add `RoomEvent` to `prisma/schema.prisma`
```prisma
enum RoomEventType {
  COMMIT
  BRANCH_CREATE
  BRANCH_CHECKOUT
  ROLLBACK
  MEMBER_JOIN
  MEMBER_LEAVE
}

model RoomEvent {
  id         String        @id @default(cuid())
  roomId     String
  eventType  RoomEventType
  actorId    String?       // null for anonymous actions
  payload    Json          // event-type-specific data (sha, branch, etc.)
  createdAt  DateTime      @default(now())

  room  Room  @relation(fields: [roomId], references: [id], onDelete: Cascade)
  actor User? @relation("RoomEventActor", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([roomId, createdAt])
  @@index([actorId])
}
```
Add the relation back-reference to `Room` and `User`:
```prisma
model Room {
  // … existing fields …
  events RoomEvent[]
}
model User {
  // … existing fields …
  roomEvents RoomEvent[] @relation("RoomEventActor")
}
```

### 2. Add `appendRoomEvent()` to `roomRepository.ts`
```typescript
import type { RoomEventType } from '@prisma/client';

export async function appendRoomEvent(
  roomId: string,
  eventType: RoomEventType,
  actorId: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  await prisma.roomEvent.create({
    data: { roomId, eventType, actorId, payload },
  });
}
```

### 3. Emit events in `server.ts`
In the WebSocket `commit` message handler (after `dbSaveCommit` succeeds):
```typescript
await appendRoomEvent(roomId, 'COMMIT', client.userId, {
  sha: message.sha, branch: message.commit.branch, message: message.commit.message,
});
```

In the `branch-update` message handler (P053):
```typescript
const eventType = message.isRollback ? 'ROLLBACK' : 'BRANCH_CHECKOUT';
await appendRoomEvent(roomId, eventType, client.userId, {
  branch: message.branch, headSha: message.headSha,
});
```

On WebSocket connection (after successful upgrade and membership check):
```typescript
await appendRoomEvent(roomId, 'MEMBER_JOIN', client.userId ?? null, {
  displayName: client.displayName,
});
```

On WebSocket close:
```typescript
await appendRoomEvent(roomId, 'MEMBER_LEAVE', client.userId ?? null, {
  displayName: client.displayName,
  durationMs: Date.now() - connectionStartTime,
});
```

### 4. Create `GET /api/rooms/[roomId]/events/route.ts`
```typescript
// Query: { cursor?: string; take?: number (max 100) }
// Returns: { events: RoomEvent[]; nextCursor: string | null }
// Auth: authenticated users who are room members; public rooms allow any authenticated user.
```

### 5. Add event pruning to the room pruning job (P032)
In the existing `pruneInactiveRooms` function, also delete events older than `ROOM_EVENT_RETENTION_DAYS` (default: 90):
```typescript
await prisma.roomEvent.deleteMany({
  where: { createdAt: { lt: new Date(Date.now() - retentionMs) } },
});
```

### 6. Add `ROOM_EVENT_RETENTION_DAYS` to `lib/env.ts`
```typescript
ROOM_EVENT_RETENTION_DAYS: z.coerce.number().int().min(1).default(90),
```

### 7. Include in GDPR export
In the account deletion route (P041 complement), before deleting the user, include `RoomEvent` records in the data export payload:
```typescript
const events = await prisma.roomEvent.findMany({
  where: { actorId: userId },
  select: { roomId: true, eventType: true, payload: true, createdAt: true },
});
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `prisma/schema.prisma` | Add `RoomEvent` model and `RoomEventType` enum |
| `prisma/migrations/` | New migration for `RoomEvent` table |
| `lib/db/roomRepository.ts` | Add `appendRoomEvent()` function |
| `server.ts` | Emit events on `commit`, `branch-update`, connection open/close |
| `app/api/rooms/[roomId]/events/route.ts` | New file: paginated activity feed endpoint |
| `lib/env.ts` | Add `ROOM_EVENT_RETENTION_DAYS` |
| `lib/db/roomRepository.ts` | Extend pruning to delete stale events |
| `.env.example` | Document `ROOM_EVENT_RETENTION_DAYS` |

## Additional Considerations

### Performance impact
`appendRoomEvent()` is a non-blocking `prisma.roomEvent.create()`. For high-frequency events like `MEMBER_JOIN`/`MEMBER_LEAVE`, this adds one INSERT per connection. For rooms with rapid reconnects (e.g., mobile users on unstable connections), this could generate bursts of events. Consider throttling `MEMBER_LEAVE` events: don't append one if the user rejoins within 5 seconds.

### Event payload schema versioning
The `payload Json` column stores event-specific data. As the application evolves, the payload shape for each `eventType` may change. Document the expected payload shape per event type in the codebase:
```typescript
// COMMIT:         { sha: string, branch: string, message: string }
// BRANCH_CREATE:  { branch: string, fromSha: string | null }
// BRANCH_CHECKOUT: { branch: string, headSha: string }
// ROLLBACK:       { branch: string, headSha: string }
// MEMBER_JOIN:    { displayName: string }
// MEMBER_LEAVE:   { displayName: string, durationMs: number }
```

### Privacy
`RoomEvent` records link user IDs to room actions. These are personal data under GDPR. The `onDelete: SetNull` on `actorId` ensures events are preserved (for room integrity) but anonymized when a user's account is deleted (P041).

### Fan-out events
The `branch-update` message (P053) is relayed to all peers in the room. Each relay recipient should NOT append a `BRANCH_CHECKOUT` event — only the server-side handler for the originating client should write the event. Add an `isRelay: true` flag to avoid duplicate event appends.

## Testing Requirements
- `appendRoomEvent()` inserts a `RoomEvent` row with the correct `eventType`, `actorId`, and `payload`.
- `GET /api/rooms/[roomId]/events` returns 401 for unauthenticated requests.
- `GET /api/rooms/[roomId]/events` returns a paginated list of events with correct structure.
- Events older than `ROOM_EVENT_RETENTION_DAYS` are deleted by the pruning job.
- Deleting a user account sets `actorId = null` on associated events (not a cascade delete).
- A cascade-deleted room removes all associated `RoomEvent` rows.

## Dependency Map
- Builds on: P003 ✅ (Prisma), P032 ✅ (pruning job — extended to prune events), P041 ✅ (GDPR — events included in data export), P053 ✅ (branch-update — events appended)
- Complements: P061 (OpenTelemetry — events complement distributed traces), P066 (invitation tokens — MEMBER_JOIN can record if access was via invitation)
- Independent of: Redis, Next.js build, client-side code
