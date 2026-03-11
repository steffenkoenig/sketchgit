# P035 – Cross-Instance Presence Aggregation via Redis Hash

## Title
Aggregate Presence Across All Server Instances Using Redis Hash to Show Complete Collaborator Lists in Multi-Instance Deployments

## Brief Summary
When the Redis Pub/Sub horizontal scalability feature (P012) is active, each server instance knows only the WebSocket clients that are physically connected to it. The `presence` broadcast (`pushPresence`) sends only locally-connected clients to peers, so users on different instances never appear in each other's collaborator lists. A user connected to instance A and a user connected to instance B will each see only themselves as the sole collaborator, even though they are co-editing the same room. Storing per-instance presence data in a Redis Hash resolves this by making every instance aware of all globally connected clients.

## Current Situation
`pushPresence` in `server.ts` broadcasts only locally-connected clients:
```typescript
function pushPresence(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  const clients = [];
  for (const [clientId, client] of room.entries()) {
    clients.push({
      clientId, name: client.displayName, color: client.displayColor, userId: client.userId,
    });
  }
  // local-only broadcast
  broadcastLocalRoom(roomId, { type: "presence", roomId, clients });
}
```

The code comment explicitly acknowledges this limitation:
```
// P012: Presence is local-only – each instance knows only its own connections.
// The full-mesh cross-instance presence (via Redis HSET) is a future enhancement;
```

This means:
- With 2 server instances and 1 user per instance in the same room, each user sees "1 collaborator" (just themselves).
- Join/leave events from remote instances are never propagated.
- The presence panel in the UI becomes misleading in any horizontally-scaled deployment.

## Problem with Current Situation
1. **Incorrect presence information**: Users co-editing the same room on different instances see an incomplete list of collaborators, undermining the core real-time collaboration value proposition.
2. **Documented technical debt**: The code comment explicitly flags this as a known gap, creating a maintenance burden and developer confusion.
3. **Broken coloured cursors**: Cursor colour assignment in the frontend is based on the presence list. Missing remote users means remote cursors may appear with incorrect or duplicate colours.
4. **Inconsistent UX at scale**: The app works correctly for single-instance deployments but silently degrades for multi-instance. Users (and operators) have no way to know which mode is active.

## Goal to Achieve
1. When Redis is enabled, publish each instance's connected clients to a Redis Hash keyed by `sketchgit:presence:<roomId>` with field `<instanceId>` and value JSON-encoded client list.
2. When computing the presence list to broadcast, aggregate all Hash fields (all instances' client lists) into a merged deduplicated list.
3. On client disconnect, update (or remove) the Hash field if the instance's local client list for that room becomes empty.
4. Set a TTL on the Hash to prevent stale entries surviving an unclean instance shutdown (30 seconds is sufficient given the 25-second heartbeat cycle from P004).
5. Fall back gracefully to local-only presence when Redis is unavailable (preserving current single-instance behaviour).

## What Needs to Be Done

### 1. Define the presence Hash key structure
```
Key:   sketchgit:presence:<roomId>
Field: <SERVER_INSTANCE_ID>
Value: JSON array of { clientId, name, color, userId } for clients connected to THIS instance in THIS room
TTL:   30 seconds (refreshed on every push)
```
Using a Redis pipeline to atomically execute `HSET` and `EXPIRE` as a single round-trip (prevents the Hash entry from surviving indefinitely if the server crashes between the two commands):
```typescript
const key = `${REDIS_PRESENCE_PREFIX}${roomId}`;
const pipeline = redisPub.pipeline();
pipeline.hset(key, SERVER_INSTANCE_ID, JSON.stringify(localClients));
pipeline.expire(key, 30);
await pipeline.exec();
```

### 2. Add a `getGlobalPresence` helper
```typescript
async function getGlobalPresence(roomId: string): Promise<PresenceClient[]> {
  if (!redisPub || !redisReady) {
    // Fall back to local-only presence
    return getLocalPresence(roomId);
  }
  const key = `${REDIS_PRESENCE_PREFIX}${roomId}`;
  const allFields = await redisPub.hgetall(key);
  if (!allFields) return getLocalPresence(roomId);

  const seen = new Set<string>();
  const merged: PresenceClient[] = [];
  for (const value of Object.values(allFields)) {
    const clients = JSON.parse(value) as PresenceClient[];
    for (const c of clients) {
      if (!seen.has(c.clientId)) {
        seen.add(c.clientId);
        merged.push(c);
      }
    }
  }
  return merged;
}
```

### 3. Update `pushPresence` to use global presence
```typescript
async function pushPresence(roomId: string): Promise<void> {
  const localClients = getLocalPresence(roomId);

  // 1. Publish this instance's current client list to Redis atomically
  if (redisPub && redisReady) {
    const key = `${REDIS_PRESENCE_PREFIX}${roomId}`;
    const pipeline = redisPub.pipeline();
    pipeline.hset(key, SERVER_INSTANCE_ID, JSON.stringify(localClients));
    pipeline.expire(key, 30); // refresh TTL so the entry does not linger after an unclean shutdown
    await pipeline.exec();
  }

  // 2. Fetch the global merged list
  const clients = await getGlobalPresence(roomId);

  // 3. Broadcast to local clients (they will see the global view)
  broadcastLocalRoom(roomId, { type: "presence", roomId, clients });
}
```

### 4. Trigger `pushPresence` on peer events
When a Redis `pmessage` arrives for a `draw` or other message from a peer instance, a presence push should also fire so that locally-connected clients get an up-to-date view after a new peer joins or leaves (the peer's instance will have updated the Hash). A lightweight approach: when a `presence` message arrives from a peer (broadcast by the peer's `pushPresence`), locally merge and re-broadcast:
```typescript
case 'presence':
  // Peer instance published its local presence; merge with our global view.
  // Errors are caught and logged so that presence failures do not crash
  // the pmessage handler or silently disappear.
  pushPresence(roomId).catch((err) =>
    logger.warn({ roomId, err }, "redis: pushPresence failed on peer presence event"),
  );
  break;
```

### 5. Clean up Hash field on instance shutdown
In the graceful shutdown handler (P023), delete this instance's field from all presence Hashes:
```typescript
if (redisPub && redisReady) {
  const roomIds = [...rooms.keys()];
  const pipeline = redisPub.pipeline();
  for (const roomId of roomIds) {
    pipeline.hdel(`${REDIS_PRESENCE_PREFIX}${roomId}`, SERVER_INSTANCE_ID);
  }
  await pipeline.exec();
}
```

### 6. Tests
`lib/cache/globalPresence.test.ts` (or within existing server test utilities):
- Single instance (no Redis): `getGlobalPresence` returns local-only list.
- Two instances: each publishes its list; `getGlobalPresence` returns merged deduplicated list.
- Instance shutdown cleanup: after `hdel`, `hgetall` no longer includes that instance's clients.
- TTL expiry simulation: expired field omitted from merged result.

## Components Affected
| Component | Change |
|-----------|--------|
| `server.ts` | Update `pushPresence` to publish + fetch global presence; add cleanup in shutdown handler |
| Constants | Add `REDIS_PRESENCE_PREFIX = "sketchgit:presence:"` near `REDIS_CHANNEL_PREFIX` |
| Tests | New unit tests for `getGlobalPresence` aggregation logic |

## Data & Database Model
No database schema changes. All new state lives in Redis and is ephemeral by design (30-second TTL ensures stale data does not persist beyond one heartbeat cycle).

## Testing Requirements
- Unit: `getGlobalPresence` with mocked `hgetall` returning two instance entries → merged unique list.
- Unit: `getGlobalPresence` with mocked `hgetall` returning `null` → falls back to local list.
- Unit: duplicate `clientId` across two instance entries → deduplicated in output.
- Integration: presence panel in UI shows all collaborators across instances (manual verification in Docker Compose multi-instance setup).

## Linting and Type Requirements
- `pushPresence` signature changes from `void` to `Promise<void>`; all call sites must `await` or `void`-qualify it.
- `PresenceClient` type already exists in `lib/sketchgit/types.ts`; import and reuse here.
- Redis pipeline return type is `[Error | null, unknown][]`; errors should be logged, not silently discarded.

## Dependency Map
- Depends on: P012 ✅ (Redis pub/sub infrastructure), P007 ✅ (userId available on ClientState), P023 ✅ (shutdown handler exists to extend)
- Resolves the documented TODO in `server.ts`: "The full-mesh cross-instance presence (via Redis HSET) is a future enhancement"
- Complements: P030 (cache), P031 (payload validation)
