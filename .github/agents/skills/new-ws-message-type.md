# Skill: New WebSocket Message Type

## Purpose
Add a new real-time message type that the server broadcasts to connected room
members over WebSocket.

## Important: this is a REST-triggered broadcast, not an inbound WS handler

Older revisions of this codebase processed client-initiated actions as inbound
WebSocket messages handled inside `server.ts`. **That pattern was replaced.**
As of P067/P080, `lib/sketchgit/realtime/collaborationManager.ts` explicitly
documents (see the comment above `_postEvent()`): *"All client-initiated
events (draw, commit, branch-update, cursor, profile, object-lock/unlock,
follow-*, view-sync) are now submitted as HTTP POST requests. The server
validates, persists (where needed), and then broadcasts a WebSocket message
to all connected room members."*

`lib/api/wsSchemas.ts`'s `InboundWsMessageSchema` discriminated union only
still contains `pong`, `fullsync-request`, and `fullsync` — the WS connection
itself is now almost entirely an outbound broadcast channel plus a narrow
fullsync-relay path (see `lib/server/wsConnectionHandler.ts`'s
`handleWsMessage()`). **Do not add a new case to that inbound handler** unless
the feature genuinely requires peer-to-peer relay (like `fullsync-request`
does) rather than server-validated persistence.

## The Real Pattern (verified against `object-lock`, `view-sync`, `branch-update`)

1. **Add the type string** to the `WsMessageType` union in
   `lib/sketchgit/types.ts`:
   ```typescript
   export type WsMessageType =
     | "welcome"
     | ...
     | "your-new-type";
   ```

2. **Add a Zod schema** in `lib/api/wsSchemas.ts` if the payload needs
   validation (most do):
   ```typescript
   export const WsYourNewTypeSchema = z.object({
     type: z.literal("your-new-type"),
     // ...fields with .max() bounds
   });
   ```
   This schema is reused as (part of) the REST route's request schema — see
   `app/api/rooms/[roomId]/object-lock/route.ts`, whose
   `ObjectLockRequestSchema` extends `WsObjectLockSchema`.

3. **Create the REST route** (see the `new-api-route` skill) at
   `app/api/rooms/[roomId]/<feature>/route.ts`. After validating and checking
   `checkRoomAccess()`, call:
   ```typescript
   import { broadcastToRoom } from "@/lib/server/wsRoomBroadcaster";

   broadcastToRoom(
     roomId,
     { type: "your-new-type", /* ...validated fields */, roomId },
     clientId, // exclude the sender so they don't receive their own echo
   );
   ```
   `broadcastToRoom()` (`lib/server/wsRoomBroadcaster.ts`) is initialized once
   during server startup and is safe to call from any API route afterward —
   it also fans the message out across instances via Redis pub/sub (P012)
   when `REDIS_URL` is set, so you get horizontal-scale correctness for free.

4. **Client-side send**: in `lib/sketchgit/realtime/collaborationManager.ts`,
   add a method that calls the private `_postEvent(path, body)` helper (POSTs
   to `/api/rooms/[roomId]/<path>` with the current room ID already bound):
   ```typescript
   broadcastYourNewType(payload: YourPayloadType): void {
     if (!this.ws.isConnected()) return;
     this._postEvent('your-new-type', { type: 'your-new-type', ...payload });
   }
   ```

5. **Client-side receive**: still in `collaborationManager.ts`, find the
   `onMessage` dispatch (search for `data.type === 'object-lock'` as a
   reference point) and add a branch that updates local state / calls the
   relevant coordinator.

## When You DO Need an Inbound WS Handler Instead

Only for peer-to-peer relay where the server should not persist or validate
business logic beyond schema shape — currently just `fullsync-request` /
`fullsync`. If this genuinely applies:
- Add the schema to `InboundWsMessageSchema`'s discriminated union in
  `lib/api/wsSchemas.ts`.
- Add a branch in `handleWsMessage()` in `lib/server/wsConnectionHandler.ts`.
- Add a test case in `lib/server/wsConnectionHandler.test.ts`.

## Output Checklist
- [ ] Type string added to `WsMessageType` in `lib/sketchgit/types.ts`.
- [ ] Zod schema added to `lib/api/wsSchemas.ts` (if validation is needed).
- [ ] REST route created per the `new-api-route` skill, calling
      `broadcastToRoom()`.
- [ ] `collaborationManager.ts` updated: a `broadcast<X>()` sender method and
      an `onMessage` receive branch.
- [ ] Test coverage: the REST route's test file, plus a
      `wsRoomBroadcaster.ts` / `collaborationManager.test.ts` case if the
      dispatch logic is non-trivial.
- [ ] `npx tsc --noEmit`, `npm run lint`, and `npm test` all pass.
