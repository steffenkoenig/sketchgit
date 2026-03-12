# P048 – Server-authoritative Fullsync for Every New Client

## Title
Send a Database-backed Fullsync to Every Connecting Client, Not Just the First

## Brief Summary
When the first client connects to an empty room, the server loads the authoritative state from the database and sends a `fullsync` message. When a second (or later) client connects to a room that already has active clients, the server sends no DB fullsync. Instead, the new client sends a `fullsync-request` that is relayed to existing peers; one of those peers responds with its own in-memory state. This peer-to-peer handoff works in the happy path but creates a hard correctness dependency on the responding peer: if that peer has uncommitted canvas changes, a branch checked out at a different commit, or diverged state from a recent rollback, the new client inherits that diverged state rather than the database-authoritative state. Changing the server to always deliver the DB snapshot to every new client, regardless of room size, eliminates this entire category of state-synchronization bug.

## Current Situation
In `server.ts`, after sending the `welcome` message:
```typescript
sendTo(client, { type: "welcome", roomId, clientId });
pushPresence(roomId);

// If this is the only client in the room, serve historical state from DB
if (room.size === 1) {
  const snapshot = await dbLoadSnapshot(roomId);
  if (snapshot) {
    sendTo(client, {
      type: "fullsync",
      targetId: clientId,
      commits: snapshot.commits,
      branches: snapshot.branches,
      HEAD: snapshot.HEAD,
      detached: snapshot.detached,
    });
  }
}
```

The `room.size === 1` guard means every subsequent client relies on peers:

In `collaborationManager.ts`:
```typescript
case 'welcome': {
  // …
  this.ws.send({ type: 'fullsync-request', senderId: this.wsClientId });
  break;
}

case 'fullsync-request': {
  // A PEER (not the server) responds with their local in-memory state
  const gitState = this.cb.getGitState();
  this.ws.send({ type: 'fullsync', targetId: data.senderId, commits: gitState.commits, … });
  break;
}
```

The responding peer's `gitState` comes from `GitModel.commits` (in-memory), which may have diverged from the database.

## Problem with Current Situation
1. **Diverged state propagation**: If peer A has drawn new shapes without committing, their canvas JSON is dirtier than what is in the DB. When peer B connects and receives a fullsync from A, B's initial state includes A's uncommitted changes. From B's perspective these objects exist; from the DB's perspective they don't. If A closes the browser, B is left with orphaned objects that cannot be committed because the parent commit chain doesn't include them.
2. **Rollback state confusion**: If peer A performs a branch rollback (`cpRollback`) that moves a branch pointer backwards, A's local `GitModel.branches` map reflects the rolled-back state. When B connects, B gets the old (rolled-back) state from A, while the DB still has the original forward state (the rollback was not persisted). B is now operating on a different history than the server.
3. **Race condition on simultaneous connect**: If clients B and C connect simultaneously within milliseconds of each other, both send `fullsync-request`. Both A, B, and C all respond to the other two's requests. B may receive a fullsync from C (who has an empty state, since they just connected) rather than from A (who has the full history). The ordering of message delivery determines which state "wins."
4. **Load amplification**: In a room with 20 clients, each new join triggers a `fullsync-request` broadcast to all 20 peers. Any one of them responds with a full JSON payload (potentially 500 KB for a complex canvas). The originating client may receive 20 duplicate responses, all of which are processed (though only the first is applied). This is `O(N)` network traffic for each join event.
5. **Peer-to-peer trust model**: The server is the source of truth. Delegating the initial state handoff to a random peer inverts this trust model. Any peer can craft a malicious `fullsync` response and inject arbitrary commit history into a new client.

## Goal to Achieve
1. Remove the `room.size === 1` condition. Always load the DB snapshot and send it to every new client as part of the join flow.
2. Retain the `fullsync-request` / peer-to-peer `fullsync` mechanism for reconnections and manual sync requests (e.g., after a network interruption), but document that the server's fullsync takes precedence.
3. Use P030's LRU snapshot cache (when implemented) to avoid a full DB query on every join; the cache makes the per-join DB load negligible.
4. For brand-new rooms with no commits, continue sending no fullsync (behaviour is identical to today for first clients in empty rooms).
5. If the DB load fails (transient error), fall back to the peer-to-peer mechanism (resilience).

## What Needs to Be Done

### 1. Remove the `room.size === 1` guard in `server.ts`
```typescript
// Before:
if (room.size === 1) {
  const snapshot = await dbLoadSnapshot(roomId);
  if (snapshot) {
    sendTo(client, { type: "fullsync", targetId: clientId, … });
  }
}

// After:
const snapshot = await dbLoadSnapshot(roomId);
if (snapshot) {
  sendTo(client, {
    type: "fullsync",
    targetId: clientId,
    commits: snapshot.commits,
    branches: snapshot.branches,
    HEAD: snapshot.HEAD,
    detached: snapshot.detached,
  });
}
// If snapshot is null (new room with no commits), do nothing –
// the client starts with an empty canvas, which is the correct initial state.
```

### 2. Update `dbLoadSnapshot` to handle concurrent calls efficiently
The function currently runs three parallel Prisma queries. With P030's LRU cache, the result is memoized for the TTL period. Without P030, the cost is:
- Three PostgreSQL queries per client connection (instead of only the first connection)
- For a room with 10 simultaneous clients, 30 queries instead of 3

The P030 proposal should be implemented before or alongside this change to keep the per-join cost acceptable.

### 3. Keep `fullsync-request` for peer-requested syncs
The peer-to-peer fullsync is still useful when:
- A client needs to refresh their state without a full reconnect
- The server DB snapshot is stale (very recent commits may not be flushed yet)
- A client with a fresh connection receives a `fullsync` from the server and then receives late peer-sent commits that arrived after the snapshot

`fullsync-request` becomes an optional supplement, not the primary mechanism.

### 4. Handle the case where the DB load races with a new commit
When a client connects and the server starts loading the DB snapshot, another client may commit between the snapshot query and the `sendTo` call. The new client's fullsync will be missing that commit. This is acceptable: the peer-to-peer `commit` relay will deliver the missing commit to the new client via the normal `commit` message handler in `collaborationManager.ts`. The LCA algorithm ensures the git graph converges correctly.

### 5. Tests
- Unit (server): New client connects to a room with existing clients → `dbLoadSnapshot` is called (not guarded by `room.size`).
- Unit (server): New client connects to empty room → `dbLoadSnapshot` returns null → no fullsync sent.
- Unit (server): DB error during `dbLoadSnapshot` → exception caught, no fullsync sent, client still receives `welcome`.
- Integration: 3 clients connect simultaneously → each receives the DB-authoritative state, not a peer's in-memory state.

## Components Affected
| Component | Change |
|-----------|--------|
| `server.ts` | Remove `if (room.size === 1)` guard from the post-connection handler |
| `lib/sketchgit/realtime/collaborationManager.ts` | Document that `fullsync-request` is a fallback supplement, not the primary handshake |

## Data & Database Model
No schema changes. The only change is when `dbLoadSnapshot` is called (every connect vs. first connect only).

## Performance Consideration
Without P030 (LRU cache), every client connection triggers a 3-query DB load. In a 50-client room with frequent joins/leaves, this could add ~150 queries/minute. With P030 (cached snapshot with 30-second TTL), the incremental cost is near-zero. **Implementing P030 before or alongside this proposal is strongly recommended.**

## Testing Requirements
- `room.size >= 2`: new client receives `type: "fullsync"` from server (not peer).
- `room.size === 1` (first client): `dbLoadSnapshot` still called; returns null → no fullsync; client starts empty.
- DB error: client receives `welcome` but no `fullsync`; error logged; `fullsync-request` mechanism still works.
- Peer `fullsync-request` still processed (backwards compat with existing clients).

## Dependency Map
- Depends on: P013 ✅ (server TypeScript), P011 ✅ (DB indices for performant snapshot load)
- Strongly benefits from: P030 (LRU cache makes per-join DB cost negligible)
- Closes the root correctness issue that P035 (cross-instance presence) also depends on (both require a shared source of truth)
