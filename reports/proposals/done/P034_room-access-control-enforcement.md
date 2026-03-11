# P034 – Enforce Room Access Control on WebSocket Connections

## Title
Enforce Room Membership and Visibility Rules on WebSocket Connection Upgrade

## Brief Summary
The WebSocket server currently accepts any authenticated or unauthenticated client into any room identified by a UUID, without checking whether the room is public or whether the connecting user has the required membership. The `Room.isPublic` field and the `RoomMembership` model with OWNER/EDITOR/VIEWER roles exist in the database schema but are never consulted during the WebSocket upgrade. Any client that knows (or guesses) a room ID can join as a full participant regardless of the room's privacy setting. This proposal adds access control checks to the WebSocket connection handler and enforces role-based permissions for write operations (drawing and committing).

## Current Situation
`server.ts` accepts every WebSocket upgrade that passes the Origin check and per-IP rate limit:
```typescript
wss.on("connection", async (ws, reqUrl) => {
  const roomId = safeRoomId(reqUrl.searchParams.get("room"));
  // … no membership check, no isPublic check …
  room.set(clientId, client);
  await dbEnsureRoom(roomId, client.userId);
  sendTo(client, { type: "welcome", roomId, clientId });
  // client immediately receives fullsync and can send draw/commit messages
});
```

The `isPublic` and membership columns were introduced as part of P007 (Authentication) to support future access control, but the enforcement was explicitly deferred. The schema has:
- `Room.isPublic` (default `true`) — whether anonymous users can view/join.
- `RoomMembership.role` — `OWNER`, `EDITOR`, or `VIEWER`.

A room created by a logged-in user with `isPublic = false` is intended to be private, but any client can currently join it by guessing the UUID.

## Problem with Current Situation
1. **No privacy guarantee**: A user who creates a room expecting privacy (e.g. by setting `isPublic = false` through a future UI) gets no actual protection because the WebSocket server ignores the field.
2. **Viewer role not enforced**: The `VIEWER` role in `RoomMembership` is intended for read-only access, but a VIEWER-role client can currently send `draw`, `draw-delta`, and `commit` messages without restriction.
3. **Schema–runtime mismatch**: The database carefully models access control concepts (roles, membership, public/private) that are never applied at the application layer. This is misleading to developers reading the schema and creates a false sense of security.
4. **Attack surface for private rooms**: UUID room IDs (generated with `randomUUID()`) have 122 bits of entropy and are not practically guessable by brute force. However, if a room ID is leaked (e.g. in server logs, browser history, or a shared link), there is no secondary access control barrier.
5. **Scalability of open rooms**: Without membership enforcement, the server cannot implement invitation-only rooms even when explicitly requested.

## Goal to Achieve
1. Check `Room.isPublic` during WebSocket upgrade. If the room exists and `isPublic = false`, reject anonymous (unauthenticated) connections with `403 Forbidden`.
2. Check `RoomMembership` for authenticated users connecting to private rooms. Only members with OWNER, EDITOR, or VIEWER roles can join.
3. Enforce write restrictions: VIEWER-role users and unauthenticated users on public rooms can receive `draw` / `draw-delta` / `fullsync` messages but their own `draw`, `draw-delta`, and `commit` messages are silently ignored (or responded to with a `{ type: "error", code: "FORBIDDEN" }` message).
4. Automatically add the connecting user as an EDITOR member of a new room if they are authenticated and the room does not yet exist (preserving current creation-on-join semantics for authenticated users).
5. Keep the change backward-compatible for all existing public rooms (`isPublic = true` — the default).

## What Needs to Be Done

### 1. Add a `checkRoomAccess` helper to `lib/db/roomRepository.ts`
```typescript
export type RoomAccessResult =
  | { allowed: true; role: 'OWNER' | 'EDITOR' | 'VIEWER' | 'ANONYMOUS' }
  | { allowed: false; reason: 'ROOM_NOT_FOUND' | 'PRIVATE_ROOM' | 'NOT_A_MEMBER' };

export async function checkRoomAccess(
  roomId: string,
  userId: string | null,
): Promise<RoomAccessResult>
```
Logic:
- If the room does not exist → `{ allowed: true, role: 'ANONYMOUS' }` (creation-on-join for new rooms).
- If `room.isPublic === true` → `{ allowed: true, role: userId ? resolveRole(userId, roomId) : 'ANONYMOUS' }`.
- If `room.isPublic === false` and `userId === null` → `{ allowed: false, reason: 'PRIVATE_ROOM' }`.
- If `room.isPublic === false` and `userId !== null` → check membership; if member, resolve role; if not a member, `{ allowed: false, reason: 'NOT_A_MEMBER' }`.

### 2. Add membership on room creation in `dbEnsureRoom`
When a new room is created and the connecting user is authenticated, automatically create an OWNER membership:
```typescript
await prisma.$transaction([
  prisma.room.upsert({ … }),
  ...(ownerId ? [prisma.roomMembership.upsert({
    where: { roomId_userId: { roomId, userId: ownerId } },
    create: { roomId, userId: ownerId, role: 'OWNER' },
    update: {},
  })] : []),
]);
```

### 3. Enforce access in the WebSocket connection handler
```typescript
const access = await checkRoomAccess(roomId, client.userId);
if (!access.allowed) {
  logger.warn({ roomId, userId: client.userId, reason: access.reason }, "ws: access denied");
  sendTo(client, { type: "error", code: "ACCESS_DENIED", reason: access.reason });
  ws.close(1008, "Access denied");
  return;
}
client.role = access.role; // store on the ClientState for per-message checks
```

### 4. Add per-message permission check
In the `message` handler, before processing write operations:
```typescript
if (['draw', 'draw-delta', 'commit'].includes(msg.type)) {
  if (client.role === 'VIEWER' || client.role === 'ANONYMOUS') {
    sendTo(client, { type: "error", code: "FORBIDDEN", detail: "Read-only access" });
    return;
  }
}
```

### 5. Extend `ClientState` interface
```typescript
interface ClientState extends WebSocket {
  clientId: string;
  roomId: string;
  userId: string | null;
  role: 'OWNER' | 'EDITOR' | 'VIEWER' | 'ANONYMOUS';
  // … existing fields …
}
```

### 6. Tests
`lib/db/roomRepository.test.ts`:
- `checkRoomAccess` for a new room (not yet created) → `allowed: true, role: ANONYMOUS`.
- `checkRoomAccess` for a public room, unauthenticated → `allowed: true, role: ANONYMOUS`.
- `checkRoomAccess` for a private room, unauthenticated → `allowed: false, reason: PRIVATE_ROOM`.
- `checkRoomAccess` for a private room, authenticated non-member → `allowed: false, reason: NOT_A_MEMBER`.
- `checkRoomAccess` for a private room, authenticated VIEWER → `allowed: true, role: VIEWER`.

## Components Affected
| Component | Change |
|-----------|--------|
| `server.ts` | Check access on upgrade; set `client.role`; add per-message role check |
| `lib/db/roomRepository.ts` | Add `checkRoomAccess`; update `ensureRoom` to create OWNER membership |
| `lib/sketchgit/types.ts` | Add `role` field type (re-export from Prisma or inline) |
| `lib/db/roomRepository.test.ts` | New tests for `checkRoomAccess` |

## Data & Database Model
No schema changes required. The `RoomMembership` table and `isPublic` column exist and carry the correct semantics. The `checkRoomAccess` function uses these existing structures.

## Testing Requirements
- Access matrix: public room × (anonymous, authenticated non-member, VIEWER, EDITOR, OWNER) → all should be allowed.
- Access matrix: private room × (anonymous, non-member) → denied; × (VIEWER, EDITOR, OWNER) → allowed.
- Write restriction: VIEWER role attempts to send `commit` → receives `FORBIDDEN` error.
- Room creation: first authenticated user to join a new room becomes OWNER automatically.

## Linting and Type Requirements
- `MemberRole` enum should be imported from `@prisma/client` rather than re-declared as a string literal union, to prevent drift if the schema changes.
- The `role` property on `ClientState` must be assigned before any write-operation check; TypeScript strict mode will flag uninitialized access.

## Dependency Map
- Depends on: P007 ✅ (auth/session established), P013 ✅ (server in TypeScript), P014 ✅ (Zod available)
- Complements: P031 (payload validation prevents schema attacks; this proposal prevents authorization attacks)
- Enables: future Room Settings UI where owners can toggle `isPublic` and manage invitations
