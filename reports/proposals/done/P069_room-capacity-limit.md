# P069 – Per-Room WebSocket Connection Capacity Limit

## Title
Enforce a Configurable Maximum Number of WebSocket Clients per Room to Prevent Resource Exhaustion from Oversized Collaboration Sessions

## Brief Summary
`server.ts` already enforces a per-IP WebSocket connection limit (20 connections per IP, `MAX_CONNECTIONS_PER_IP`), but there is no limit on the number of clients within a single room. A single room can accumulate hundreds of WebSocket connections—intentionally (viral public rooms) or unintentionally (load-test bots)—consuming unbounded server memory, CPU for presence broadcasts, and Redis pub/sub message fan-out. Adding a `MAX_CLIENTS_PER_ROOM` limit (default: 50, configurable via env var) is a one-line check in the WebSocket upgrade handler and closes this denial-of-service vector.

## Current Situation
In `server.ts`, the upgrade handler checks per-IP connection counts but has no room-level limit:
```typescript
// P015 – per-IP WebSocket connection counter
const connectionsPerIp = new Map<string, number>();
const MAX_CONNECTIONS_PER_IP = 20;

// … in the upgrade handler:
const currentCount = connectionsPerIp.get(ip) ?? 0;
if (currentCount >= MAX_CONNECTIONS_PER_IP) {
  socket.destroy();
  return;
}
```
After the upgrade, clients are added to the room's `Map<string, ClientState>` without any size check:
```typescript
// No room size check before this:
room.set(clientState.clientId, clientState);
```

### Room size impact
Each additional client in a room:
- Receives every `draw-delta`, `cursor`, and `presence` message broadcast by every other client.
- Occupies a `ClientState` entry in the `rooms` Map (≈2–4 KB per socket).
- Triggers a presence broadcast (debounced by P044) on join and leave.
- Increments the Redis presence hash (P035) on every join.

A room with 200 clients broadcasting `draw-delta` at 10 Hz generates `200 × 10 × 200 = 400,000` message deliveries per second on the server. With P059 compression enabled, this is still a significant CPU workload.

## Problem with Current Situation
1. **No room capacity limit**: A viral room link can attract hundreds of simultaneous connections. Each new client increases the fan-out quadratically (O(N²) for fully-connected presence).
2. **Denial-of-service vector**: A single attacker with 20 different IP addresses can fill a room with `20 × 20 = 400` connections (20 connections per IP × 20 IPs), completely disabling it for legitimate users.
3. **Unbounded Redis fan-out**: Each message published to a room's Redis channel is relayed to every instance that has clients in that room. A room with 200 clients across 5 server instances generates `200 × 5 = 1000` Redis message deliveries per event.
4. **Uninformative rejection**: When the server is overloaded, connections are dropped silently with a TCP RST. A room-capacity error message (`{ type: 'error', code: 'ROOM_FULL' }`) sent before closing the connection gives the client a recoverable user-facing error.

## Goal to Achieve
1. Add `MAX_CLIENTS_PER_ROOM` to `lib/env.ts` with a default of 50.
2. In the WebSocket upgrade handler, reject connections to rooms that are already at capacity with a `ROOM_FULL` error code.
3. Send a structured error message to the connecting client before destroying the socket, so the client can display a user-facing message rather than silently failing.
4. Log the rejection at `warn` level with `{ roomId, currentSize, limit }` context.

## What Needs to Be Done

### 1. Add `MAX_CLIENTS_PER_ROOM` to `lib/env.ts`
```typescript
MAX_CLIENTS_PER_ROOM: z.coerce.number().int().min(1).default(50),
```

### 2. Add the room capacity check in `server.ts`
In the WebSocket upgrade handler, immediately after resolving `roomId` and before adding the new client to the room:
```typescript
const MAX_CLIENTS_PER_ROOM = env.MAX_CLIENTS_PER_ROOM;

// … existing IP limit check …

const existingRoom = rooms.get(roomId);
if (existingRoom && existingRoom.size >= MAX_CLIENTS_PER_ROOM) {
  logger.warn({ roomId, currentSize: existingRoom.size, limit: MAX_CLIENTS_PER_ROOM },
    'ws: room at capacity, rejecting new connection');
  // Send a structured error so the client can show a user-facing message.
  // The WebSocket handshake has already been accepted at the HTTP level;
  // we send one JSON message then close.
  const ws = new WebSocket(socket as unknown as string);
  // … or use the underlying ws object created during the upgrade:
  ws.send(JSON.stringify({ type: 'error', code: 'ROOM_FULL', message: 'This room is at capacity.' }));
  ws.close(1008, 'Room at capacity');
  return;
}
```

> **Implementation note**: In `server.ts`, the upgrade handler creates the `WebSocket` object via `wss.handleUpgrade`. The capacity check must happen *after* `handleUpgrade` is called (so we have a `ws` object to send the error on) but *before* the client is added to `rooms`. The correct pattern is to call `handleUpgrade`, then check capacity, then either proceed with `wss.emit('connection', ws, req)` or close the socket:
```typescript
wss.handleUpgrade(req, socket, head, (ws) => {
  const existingRoom = rooms.get(roomId);
  if (existingRoom && existingRoom.size >= MAX_CLIENTS_PER_ROOM) {
    logger.warn({ roomId, currentSize: existingRoom.size, limit: MAX_CLIENTS_PER_ROOM },
      'ws: room at capacity');
    ws.send(JSON.stringify({ type: 'error', code: 'ROOM_FULL', message: 'Room is at capacity.' }));
    ws.close(1008, 'Room at capacity');
    return;
  }
  wss.emit('connection', ws, req);
});
```

### 3. Handle `ROOM_FULL` error in the client
In `wsClient.ts`, handle the `error` message type with code `ROOM_FULL`:
```typescript
case 'error': {
  if (data.code === 'ROOM_FULL') {
    showToast('⚠ This room is full. Please try a different room.', true);
    this.intentionalClose = true; // suppress reconnect
  }
  break;
}
```

### 4. Expose room capacity in `/api/health`
Update the `/api/health` response to include the largest room size:
```typescript
const maxRoomSize = Math.max(0, ...[...rooms.values()].map((r) => r.size));
// Include: roomCount, maxRoomSize, capacityLimit: MAX_CLIENTS_PER_ROOM
```

### 5. Add `MAX_CLIENTS_PER_ROOM` to `.env.example`
```dotenv
# Maximum WebSocket clients per room (default: 50). Reduce for low-memory deployments.
# MAX_CLIENTS_PER_ROOM=50
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `lib/env.ts` | Add `MAX_CLIENTS_PER_ROOM` env var |
| `lib/env.test.ts` | Update tests for new env var |
| `server.ts` | Add room capacity check in upgrade handler |
| `lib/sketchgit/realtime/wsClient.ts` | Handle `error` message type; suppress reconnect on `ROOM_FULL` |
| `lib/api/wsSchemas.ts` | Add `error` message type to `WsMessage` union |
| `lib/sketchgit/types.ts` | Add `ErrorWsMessage` type |
| `.env.example` | Document `MAX_CLIENTS_PER_ROOM` |

## Additional Considerations

### Capacity vs. rate limiting
The per-IP connection limit (P015) and the room capacity limit are complementary:
- Per-IP limit: prevents one source from monopolising server connections.
- Room capacity limit: prevents one room from monopolising the server's message fan-out budget.
Both limits can be hit simultaneously. The per-IP check should remain first (cheaper).

### Dynamic room capacity (future)
A future enhancement could allow room owners to configure per-room capacity via the `PATCH /api/rooms/[roomId]` endpoint (P049). The `Room` schema could include a `maxClients: Int?` column, defaulting to `MAX_CLIENTS_PER_ROOM` from the environment.

### Presence accuracy with capacity
When a room is at capacity, clients who were rejected are not in the presence list. The presence count displayed to users accurately reflects the number of connected clients, not the number who attempted to join.

### WebSocket close code 1008
RFC 6455 defines close code 1008 ("Policy Violation") as the appropriate code when the server rejects a connection based on its own policy (as opposed to 1013 "Try Again Later"). Both are semantically appropriate; 1008 is chosen because the client should not blindly retry without a change (e.g., trying a different room).

## Testing Requirements
- `MAX_CLIENTS_PER_ROOM=2` causes the 3rd connection to the same room to be rejected.
- The rejected client receives `{ type: 'error', code: 'ROOM_FULL' }` before the socket is closed.
- The rejection is logged at `warn` level with `roomId`, `currentSize`, and `limit`.
- A new room (no existing connections) is not affected by the check.
- `wsClient.ts` sets `intentionalClose = true` on `ROOM_FULL` to prevent automatic reconnect.
- The health endpoint includes `maxRoomSize` in its response.

## Dependency Map
- Builds on: P013 ✅ (server TypeScript), P015 ✅ (per-IP limit — same upgrade handler pattern), P031 ✅ (WS message types — error type added to schema)
- Complements: P034 ✅ (room access control — capacity check is a separate gate after access), P044 ✅ (presence debouncing — fewer clients = fewer presence bursts)
- Independent of: Redis, database, auth, Next.js build
