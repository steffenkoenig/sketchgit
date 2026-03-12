# BUG-005 – `fullsync-request` missing from `InboundWsMessageSchema` breaks peer canvas sync

| Field | Value |
|---|---|
| **ID** | BUG-005 |
| **Severity** | High |
| **Category** | WebSocket / Data loss |
| **Status** | Open |

## Summary

The `fullsync-request` WebSocket message type is defined in `WsMessageType` (types.ts) and sent by every client on connect, but it is **missing from `InboundWsMessageSchema`** (wsSchemas.ts). Because the server validates every inbound message against this schema before processing, all `fullsync-request` frames are rejected with `INVALID_PAYLOAD` and silently dropped. The peer-to-peer canvas synchronization flow is completely broken: new clients joining a room with active peers never receive a fullsync of uncommitted in-memory canvas state from those peers.

## Affected Files

| File | Line | Issue |
|---|---|---|
| `lib/api/wsSchemas.ts` | 94–109 | `fullsync-request` absent from `InboundWsMessageSchema` |
| `lib/sketchgit/realtime/collaborationManager.ts` | 113 | Client sends `fullsync-request` that server always rejects |

## Root Cause

### The peer-to-peer fullsync flow

When a new client receives a `welcome` from the server, it sends a `fullsync-request` to ask any existing peers to share their current in-memory canvas state:

```ts
// collaborationManager.ts line 113 — client sends this on welcome
this.ws.send({ type: 'fullsync-request', senderId: this.wsClientId });
```

Peers handle the request by sending a `fullsync` reply:

```ts
// collaborationManager.ts lines 201–212 — peers respond
case 'fullsync-request': {
  const gitState = this.cb.getGitState();
  this.ws.send({
    type: 'fullsync',
    targetId: data.senderId as string,
    commits: gitState.commits,
    // …
  });
  break;
}
```

The server is supposed to validate and relay `fullsync-request` to all room members so peers can respond.

### The validation gate

Before any message reaches the relay logic, the server validates it against `InboundWsMessageSchema` (a Zod discriminated union):

```ts
// server.ts lines 1142–1149
for (const msg of messages) {
  const validated = InboundWsMessageSchema.safeParse(msg);
  if (!validated.success) {
    logger.warn(..., "ws: invalid message schema");
    sendTo(client, { type: "error", code: "INVALID_PAYLOAD" });
    return; // ← drops the message entirely
  }
  await handleWsMessage(client, validated.data as unknown as WsMessage, roomId, clientId);
}
```

### The missing schema

`InboundWsMessageSchema` (wsSchemas.ts lines 94–109) covers all the types listed in `WsMessageType` **except** `fullsync-request`:

```ts
// wsSchemas.ts — MISSING fullsync-request
export const InboundWsMessageSchema = z.discriminatedUnion("type", [
  WsDrawSchema,
  WsDrawDeltaSchema,
  WsCommitSchema,
  WsBranchUpdateSchema,
  WsCursorSchema,
  WsProfileSchema,
  WsPingSchema,
  WsPongSchema,
  WsObjectLockSchema,
  WsObjectUnlockSchema,
  WsViewSyncSchema,
  WsFollowRequestSchema,
  WsFollowAcceptSchema,
  WsFollowStopSchema,
  // ← fullsync-request is missing!
]);
```

## Impact

- **Every `fullsync-request` sent by a client is rejected** with `INVALID_PAYLOAD`.
- New clients joining a room with active peers never receive an in-memory fullsync from those peers.
- While the server does deliver a DB-backed `fullsync` from committed history on connection, any **uncommitted drawing changes** (the dirty canvas of active peers) are never delivered to new joiners.
- Users connecting to an active room see old committed state, not the live canvas state being drawn by their peers.
- The server logs a `WARN` for every new client connection that has peers in the room.

## Suggested Fix

Add a `WsFullsyncRequestSchema` to `wsSchemas.ts` and include it in `InboundWsMessageSchema`:

```ts
// lib/api/wsSchemas.ts
export const WsFullsyncRequestSchema = z.object({
  type: z.literal("fullsync-request"),
  senderId: z.string().max(64).optional(),
});

export const InboundWsMessageSchema = z.discriminatedUnion("type", [
  // … existing schemas …
  WsFullsyncRequestSchema, // ← add this
]);
```

The server's `handleWsMessage` already relays all unknown message types to peers via the broadcast at lines 993–1001 of `server.ts`, so no other server-side changes are required.
