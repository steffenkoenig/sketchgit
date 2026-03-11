# P012 – Horizontal Scalability via Redis Pub/Sub

## Title
Horizontal Scalability: Replace In-Memory Room State with Redis Pub/Sub

## Brief Summary
The custom WebSocket server in `server.mjs` keeps all room state in a Node.js `Map` that only exists in the single running process. Deploying more than one server instance—for load balancing or high availability—will split users across processes that cannot communicate, breaking real-time collaboration. Replacing the in-memory message bus with Redis Pub/Sub decouples room membership from any single process and allows the application to scale horizontally.

## Current Situation
`server.mjs` maintains two in-memory maps:
```js
const rooms = new Map();       // roomId → Map<clientId, ws>
const roomTimers = new Map();  // roomId → cleanupTimer
```
All broadcast logic iterates over these maps directly:
```js
function broadcastRoom(roomId, msg, excludeId) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const [cid, client] of room) {
    if (cid !== excludeId && client.readyState === ws.OPEN) {
      client.send(msg);
    }
  }
}
```
The deployment model implied by `package.json` (`"start": "node server.mjs"`) runs exactly one Node.js process. If a second instance is started (e.g., behind a load balancer), each instance has its own independent `rooms` map and users connected to different instances cannot exchange messages.

## Problem with Current Situation
1. **No horizontal scaling**: Adding more server instances does not increase capacity—it silently fragments users into isolated groups.
2. **Single point of failure**: If the single process crashes, all connected users lose their session. There is no standby to take over.
3. **Memory growth**: The `rooms` map and all buffered WebSocket frames accumulate in a single process heap. Under heavy load, Node.js's single-threaded event loop can become a bottleneck.
4. **No cross-process presence**: Presence information (who is in a room) is only accurate for users on the same process, making multi-instance deployments show incomplete or incorrect peer lists.
5. **Stateful deployment complexity**: Any rolling restart or auto-scaling event disconnects all active users simultaneously.

## Goal to Achieve
1. Allow multiple server instances to run in parallel and exchange messages transparently.
2. Maintain full real-time collaboration semantics (broadcast, presence, full-sync) across instances.
3. Enable zero-downtime rolling restarts by gracefully migrating connections.
4. Lay the foundation for future auto-scaling triggered by CPU/connection-count metrics.

## What Needs to Be Done

### 1. Add Redis dependency
```bash
npm install ioredis
```
Add `REDIS_URL` to `.env.example` and the deployment configuration.

### 2. Design the Pub/Sub channel scheme
```
sketchgit:room:<roomId>   → all messages for a room (draw, cursor, commit, presence, etc.)
sketchgit:presence:<roomId> → lightweight presence heartbeats only (optional separation)
```

### 3. Replace in-memory broadcast with Redis publish
When a WebSocket message arrives on instance A:
1. Relay it to locally-connected peers (as today).
2. **Publish** the message to `sketchgit:room:<roomId>` in Redis.

On every instance (including A), a Redis **subscriber** listens on all room channels and forwards incoming messages to locally-connected WebSocket clients (excluding the originating client identified by `clientId` embedded in the envelope).

```js
// Publish
redis.publish(`sketchgit:room:${roomId}`, JSON.stringify({ from: clientId, payload: msg }));

// Subscribe callback (all instances)
redisSub.on('message', (channel, data) => {
  const { from, payload } = JSON.parse(data);
  const roomId = channel.split(':')[2];
  broadcastLocalClients(roomId, payload, from); // only local ws connections
});
```

### 4. Maintain distributed presence with Redis Hash / TTL keys
Each connected client registers a key in Redis:
```
HSET sketchgit:presence:<roomId> <clientId> <clientJson>
EXPIRE sketchgit:presence:<roomId> 300
```
When a client disconnects, `HDEL` removes it immediately. Presence queries read the hash rather than the in-memory map:
```
HGETALL sketchgit:presence:<roomId>
```

### 5. Keep local-only optimization for low-latency local delivery
Continue broadcasting to locally-connected clients immediately (before Redis round-trip) to preserve sub-millisecond local latency. The Redis path serves cross-instance delivery only.

### 6. Graceful shutdown
On `SIGTERM`, mark the instance as draining, stop accepting new WebSocket upgrades, and allow existing connections to finish. Kubernetes / Docker Swarm can then route new connections to healthy instances.

### 7. Update `docker-compose.yml` to add a Redis service
```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `server.mjs` | Replace in-memory `rooms` map with Redis Pub/Sub; add graceful shutdown |
| `docker-compose.yml` | Add `redis:7-alpine` service |
| `.env.example` | Add `REDIS_URL=redis://localhost:6379` |
| `package.json` | Add `ioredis` dependency |
| Deployment configuration | Ensure `REDIS_URL` is set in production environment |

## Additional Considerations

### Redis connection pooling
Use two separate `ioredis` clients: one for publishing (`redisPub`) and one for subscribing (`redisSub`). A single connection cannot both publish and subscribe in ioredis.

### Message ordering
Redis Pub/Sub does not guarantee ordering across channels. For canvas draw events, out-of-order delivery is tolerable (last write wins per object). For commit events, include a monotonic sequence number so clients can detect and request a full-sync if a gap is detected.

### Redis Streams as an alternative
Redis Streams (`XADD`/`XREAD`) offer persistence and consumer groups in addition to Pub/Sub semantics. They allow a newly joined peer to replay recent messages without a full-sync request. This is a more powerful but more complex alternative to plain Pub/Sub.

### Session affinity (sticky sessions)
As an interim alternative to the full Redis solution, configure the load balancer to use session affinity (sticky sessions) by `roomId`. This keeps all users in the same room on the same instance. It does not eliminate the single-point-of-failure risk but avoids split-brain and is far simpler to implement.

### Security
The Redis instance should be placed in a private network and protected with `requirepass`. Never expose the Redis port to the public internet.
