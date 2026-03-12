# P079 – Cross-Branch Peer Visibility and One-Click Branch Follow

## Title
Show Which Branch Each Peer is Currently On in the Branch List and Presence Panel, and Allow the User to Jump to Any Active Peer's Branch with a Single Click

## Brief Summary
Collaborators in the same room may be working on different branches simultaneously. Currently the presence panel shows peer names and avatar dots but gives no indication of which branch they are on. The branch list modal shows branch names and SHAs but gives no indication of whether any peer is currently there. A user who wants to see what a teammate is drawing on branch `feature/logo` has no signal that this is where the action is. Adding branch information to the presence payload — and rendering it in both the presence panel and the branch list modal — enables "social navigation": users can see at a glance which branches are active, how many peers are there, and jump to any occupied branch with one click.

## Current Situation

### `PresenceClient` type (`lib/sketchgit/types.ts`)
```typescript
export interface PresenceClient {
  clientId: string;
  name: string;
  color: string;
  userId?: string | null;
}
```
No branch information is stored.

### `ClientState` (`server.ts`)
```typescript
type ClientState = WebSocket & {
  clientId: string;
  roomId: string;
  userId: string | null;
  role: ClientRole;
  displayName: string;
  displayColor: string;
  _userId?: string | null;
  _ip: string;
};
```
No `currentBranch` or `currentHeadSha` field.

### `pushPresence()` (`server.ts`)
```typescript
localClients.push({
  clientId,
  name: client.displayName,
  color: client.displayColor,
  userId: client.userId ?? null,
});
```
Branch omitted from the presence payload.

### `profile` message handler (`server.ts`)
```typescript
if (message.type === "profile") {
  client.displayName = safeName(…);
  client.displayColor = safeColor(…);
  schedulePushPresence(roomId);
  return;
}
```
Branch not updated when the client sends a `profile` message.

### `branch-update` message handler (`server.ts` + `collaborationManager.ts`)
The P053 `branch-update` message is relayed to all peers in the room and applied locally by `collaborationManager.applyBranchUpdate()`. However, when the server receives a `branch-update` from a client, it **does not store the new branch** on `client.currentBranch`. Each client's current branch is unknown to the server.

### `BranchCoordinator.openBranchModal()` (`lib/sketchgit/coordinators/branchCoordinator.ts`)
```typescript
for (const [name, sha] of Object.entries(git.branches)) {
  const item = document.createElement('div');
  item.className = 'branch-item' + (name === git.HEAD ? ' active-branch' : '');
  // No peer avatars rendered
}
```

### `updateCollabUI()` (`lib/sketchgit/realtime/collaborationManager.ts`)
```typescript
for (const c of others) {
  const peer = document.createElement('div');
  peer.className = 'connected-peer';
  // Only name and color dot – no branch label
  peer.appendChild(document.createTextNode((c.name || 'User').slice(0, 20)));
  list.appendChild(peer);
}
```

## Problem with Current Situation
1. **No branch context in presence**: A collaborator's avatar tells you their name and colour but not where they are working. In a room with 5 branches and 8 collaborators, there is no way to know which branches are occupied without asking every peer individually.
2. **Branch modal is branch-centric, not people-centric**: The branch list shows branches and SHAs but not peer occupancy. An empty branch looks identical to a branch with 3 active collaborators.
3. **No "follow a peer" navigation**: There is no shortcut to "go to where Alice is working." The user must ask Alice which branch, remember the name, close the presence panel, open the branch modal, and click. This is a 5-step process instead of 1.
4. **Server has no record of each client's current branch**: The server cannot enforce branch-aware policies (e.g., "notify me when someone joins my branch") or emit targeted events to peers on the same branch without first knowing each client's branch state.
5. **Stale presence after branch switch**: When a client checks out a new branch (via P053 `branch-update`), the presence panel still shows no branch information. Even if branch were added to the initial `profile` message, it would not update when the user switches branch.

## Goal to Achieve
1. **Extend `ClientState`** to store `currentBranch` (string, default `'main'`) and `currentHeadSha` (string | null).
2. **Update `profile` message** to optionally carry `branch` and `headSha`; the server stores these on `ClientState` and triggers a presence rebroadcast.
3. **Update `branch-update` server handler** to also store the new branch on the sending `ClientState` and trigger a presence rebroadcast.
4. **Include `branch` in the presence payload** emitted by `pushPresence()` so all peers receive each other's current branch.
5. **Extend `PresenceClient`** with `branch?: string` and `headSha?: string`.
6. **Branch modal**: render peer avatar dots next to each branch name showing who is currently there; clicking a peer's avatar or a branch name with peers follows them.
7. **Presence panel**: show the current branch name in small text below each peer's name.
8. **`collaborationManager` profile send**: include the local `git.HEAD` and current branch when sending the `profile` message on connect and on every branch switch.

## What Needs to Be Done

### 1. Extend `PresenceClient` in `lib/sketchgit/types.ts`
```typescript
export interface PresenceClient {
  clientId: string;
  name: string;
  color: string;
  userId?: string | null;
  /** The branch this client currently has checked out. */
  branch?: string;
  /** The HEAD SHA for this client's current branch tip. */
  headSha?: string | null;
}
```

### 2. Extend `ClientState` in `server.ts`
```typescript
type ClientState = WebSocket & {
  clientId: string;
  roomId: string;
  userId: string | null;
  role: ClientRole;
  displayName: string;
  displayColor: string;
  /** The branch this client currently has checked out (updated on profile + branch-update). */
  currentBranch: string;
  /** The tip SHA for the client's current branch (updated on profile + branch-update). */
  currentHeadSha: string | null;
  _userId?: string | null;
  _ip: string;
};
```
Initialise `currentBranch = 'main'` and `currentHeadSha = null` in the `connection` handler before the client is added to the room.

### 3. Update `profile` message handler in `server.ts`
```typescript
if (message.type === "profile") {
  client.displayName = safeName(
    typeof message.name === "string" ? message.name : null,
  );
  client.displayColor = safeColor(
    typeof message.color === "string" ? message.color : null,
  );
  // Update branch state if supplied (optional – backward-compatible)
  if (typeof message.branch === "string" && message.branch.length > 0) {
    client.currentBranch = safeBranchName(message.branch);
  }
  if (typeof message.headSha === "string") {
    client.currentHeadSha = message.headSha.slice(0, 64) || null;
  }
  schedulePushPresence(roomId);
  return;
}
```

### 4. Update `branch-update` server handler in `server.ts`
The `branch-update` handler (around line 929) relays the message to peers. Add branch state storage before relaying:
```typescript
if (message.type === "branch-update") {
  // Store the sender's new branch position so presence reflects it
  const newBranch = typeof message.branch === "string" ? safeBranchName(message.branch) : null;
  const newHeadSha = typeof message.headSha === "string" ? message.headSha.slice(0, 64) : null;
  if (newBranch) {
    client.currentBranch = newBranch;
    client.currentHeadSha = newHeadSha ?? null;
  }
  // Re-broadcast presence so all peers receive the updated branch state
  schedulePushPresence(roomId);
  // … existing relay logic …
}
```

### 5. Include `branch` in `pushPresence()` in `server.ts`
```typescript
for (const [clientId, client] of room.entries()) {
  localClients.push({
    clientId,
    name: client.displayName,
    color: client.displayColor,
    userId: client.userId ?? null,
    branch: client.currentBranch,        // ← new
    headSha: client.currentHeadSha,      // ← new
  });
}
```

Update the Redis presence merge to preserve `branch` and `headSha`:
```typescript
// getGlobalPresence() type annotation:
async function getGlobalPresence(
  roomId: string,
  localClients: Array<{ clientId: string; name: string; color: string; userId: string | null; branch: string; headSha: string | null }>,
): Promise<Array<{ clientId: string; name: string; color: string; userId: string | null; branch: string; headSha: string | null }>>
```

### 6. Send `branch` in `profile` message from `collaborationManager.ts`
In `_onConnected()` (the `connected` case of the status change handler), include the current git state when sending `profile`:
```typescript
// Access git state via the callback registered in app.ts:
const gitState = this.callbacks.getGitState();
const currentBranch = gitState.detached ? undefined : gitState.HEAD;
const currentHeadSha = gitState.detached
  ?? gitState.branches[gitState.HEAD]
  ?? undefined;

this.ws.send({
  type: 'profile',
  name: this.ws.name,
  color: this.ws.color,
  branch: currentBranch,
  headSha: currentHeadSha,
});
```

### 7. Re-send `profile` after every local branch switch
In `BranchCoordinator.openBranchModal()`, after the checkout action:
```typescript
item.addEventListener('click', () => {
  // … existing checkout logic …
  // Announce new branch position to peers via an updated profile
  const newHeadSha = git.branches[name];
  ctx.ws.send({
    type: 'profile',
    name: ctx.ws.name,
    color: ctx.ws.color,
    branch: name,
    headSha: newHeadSha ?? null,
  });
});
```
The server will store the new `currentBranch` and trigger a presence rebroadcast, updating the branch position for all peers. (Note: `branch-update` is already sent for rollback/checkout in P053; the `profile` message here handles the non-rollback checkout case, ensuring the server always has an accurate `currentBranch` for all clients regardless of message order.)

### 8. Update `updateCollabUI()` in `collaborationManager.ts` to show branch
```typescript
updateCollabUI(): void {
  const others = this.presenceClients.filter((c) => c.clientId !== this.wsClientId);

  const list = document.getElementById('connectedList');
  if (list) {
    list.replaceChildren();
    for (const c of others) {
      const peer = document.createElement('div');
      peer.className = 'connected-peer';

      // Colour dot
      const dot = document.createElement('div');
      dot.style.cssText = 'width:6px;height:6px;background:' + (c.color || 'var(--a3)') + ';border-radius:50%;flex-shrink:0';
      peer.appendChild(dot);

      // Name + branch label column
      const info = document.createElement('div');
      info.style.cssText = 'display:flex;flex-direction:column;overflow:hidden';

      const nameEl = document.createElement('span');
      nameEl.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.8rem';
      nameEl.textContent = (c.name || 'User').slice(0, 20);
      info.appendChild(nameEl);

      if (c.branch) {
        const branchEl = document.createElement('span');
        branchEl.style.cssText = 'font-size:0.65rem;color:var(--a3,#7c6eff);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0.8';
        branchEl.textContent = '⎇ ' + c.branch.slice(0, 24);
        info.appendChild(branchEl);
      }

      peer.appendChild(info);
      list.appendChild(peer);
    }
  }

  // … existing avatarRow rendering (unchanged) …
}
```

### 9. Update `BranchCoordinator.openBranchModal()` to show peer occupancy
```typescript
openBranchModal(): void {
  const { git, canvas } = this.ctx;

  // Build a map: branch name → list of peers currently on that branch
  const peersByBranch = new Map<string, PresenceClient[]>();
  for (const peer of this.ctx.collab.getPresenceClients()) {
    if (peer.clientId === this.ctx.collab.getMyClientId()) continue; // skip self
    const branch = peer.branch ?? 'main';
    const list = peersByBranch.get(branch) ?? [];
    list.push(peer);
    peersByBranch.set(branch, list);
  }

  const listEl = document.getElementById('branchListEl');
  if (!listEl) return;
  listEl.replaceChildren();

  for (const [name, sha] of Object.entries(git.branches)) {
    const color = git.branchColor(name);
    const peers = peersByBranch.get(name) ?? [];

    const item = document.createElement('div');
    item.className = 'branch-item' + (name === git.HEAD ? ' active-branch' : '');

    // Branch colour dot
    const dot = document.createElement('div');
    dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0`;

    // Branch name
    const nameSpan = document.createElement('span');
    nameSpan.className = 'bname';
    nameSpan.textContent = name;

    // Branch SHA
    const shaSpan = document.createElement('span');
    shaSpan.className = 'bsha';
    shaSpan.textContent = sha ? sha.slice(0, 7) : '';

    item.appendChild(dot);
    item.appendChild(nameSpan);
    item.appendChild(shaSpan);

    // ── Peer avatars for this branch ──────────────────────────────────────
    if (peers.length > 0) {
      const avatarGroup = document.createElement('div');
      avatarGroup.className = 'branch-peers';
      avatarGroup.style.cssText = 'display:flex;gap:2px;align-items:center;margin-left:auto;flex-shrink:0';
      avatarGroup.title = peers.map((p) => p.name || 'User').join(', ');

      const MAX_SHOWN = 3;
      for (const peer of peers.slice(0, MAX_SHOWN)) {
        const av = document.createElement('div');
        av.style.cssText = `width:16px;height:16px;border-radius:50%;background:${peer.color || '#7c6eff'};display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:600;flex-shrink:0`;
        av.textContent = (peer.name || 'U').slice(0, 1).toUpperCase();
        av.title = peer.name || 'User';
        avatarGroup.appendChild(av);
      }
      if (peers.length > MAX_SHOWN) {
        const extra = document.createElement('span');
        extra.style.cssText = 'font-size:9px;color:var(--a3,#7c6eff);font-weight:600;flex-shrink:0';
        extra.textContent = `+${peers.length - MAX_SHOWN}`;
        avatarGroup.appendChild(extra);
      }

      item.appendChild(avatarGroup);
    }

    // ── Checkout on click (existing behaviour preserved) ──────────────────
    item.addEventListener('click', () => {
      const branchTip = git.branches[name];
      git.checkout(name);
      const c = git.commits[branchTip];
      if (c) canvas.loadCanvasData(c.canvas);
      canvas.clearDirty();
      closeModal('branchModal');
      this.refresh();
      showToast(`Switched to branch '${name}'`);
      this.ctx.ws.send({ type: 'branch-update', branch: name, headSha: branchTip, isRollback: false });
      // Update server's record of our branch position via profile
      this.ctx.ws.send({
        type: 'profile',
        name: this.ctx.ws.name,
        color: this.ctx.ws.color,
        branch: name,
        headSha: branchTip ?? null,
      });
    });

    listEl.appendChild(item);
  }
  openModal('branchModal');
}
```

### 10. Expose `getPresenceClients()` and `getMyClientId()` on `CollaborationManager`
The branch coordinator currently accesses `this.ctx.collab` but `presenceClients` and `wsClientId` are private. Add two accessor methods:
```typescript
// In collaborationManager.ts:
getPresenceClients(): PresenceClient[] {
  return [...this.presenceClients];
}

getMyClientId(): string {
  return this.wsClientId ?? '';
}
```

### 11. Add `PresenceClient` import to `branchCoordinator.ts`
```typescript
import type { PresenceClient } from '../types';
```

### 12. Update `lib/api/wsSchemas.ts` (P031 validation)
Add `branch` and `headSha` as optional fields to the `profile` message schema:
```typescript
// In InboundWsMessageSchema (or the profile-specific sub-schema):
z.object({
  type: z.literal('profile'),
  name: z.string().max(50).optional(),
  color: z.string().max(20).optional(),
  branch: z.string().max(100).optional(),   // ← new
  headSha: z.string().max(64).optional(),   // ← new
}),
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `lib/sketchgit/types.ts` | Add `branch?` and `headSha?` to `PresenceClient` |
| `server.ts` | Add `currentBranch` + `currentHeadSha` to `ClientState`; update `profile` and `branch-update` handlers; include branch in `pushPresence()` |
| `lib/api/wsSchemas.ts` | Add optional `branch` + `headSha` to profile schema |
| `lib/sketchgit/realtime/collaborationManager.ts` | Send branch in `profile`; add `getPresenceClients()` + `getMyClientId()`; update `updateCollabUI()` to show branch label |
| `lib/sketchgit/coordinators/branchCoordinator.ts` | Render peer avatars in branch modal; send `profile` after checkout |

## Additional Considerations

### Backward compatibility
The `branch` field is added as an **optional** field to `profile` and `PresenceClient`. Clients that do not send a branch (e.g., older cached JavaScript) will have `currentBranch = 'main'` (the server-side default). The branch label will show `main` for these clients, which is a safe fallback.

### Detached HEAD state
If a client is in detached HEAD (viewing a specific commit), `git.HEAD` will equal the commit SHA (P037 logic). In this case, the `profile` message should send `branch: undefined` and `headSha: git.detached`. The branch modal should show a special indicator (e.g., "⤵ detached" in the peer avatar tooltip) rather than matching the detached SHA against a branch name.

### Privacy: anonymous users and branch visibility
Branch information is already broadcast to all room members via P053 `branch-update` messages. Including it in presence does not expose any new information to room members. For private rooms, only members receive the presence broadcast, so branch information is not leaked to unauthenticated users.

### Redis presence and branch data
The `getGlobalPresence()` function in `server.ts` reads per-instance presence data from Redis. The branch and headSha fields are stored as part of the JSON value in the Redis Hash (same HSET key as name/color). No schema migration is needed; the JSON value in Redis simply gains two new keys. Older server instances that don't include branch in their presence entry will produce `presenceClients` with `branch: undefined` for those clients, which is handled gracefully by the optional field.

### Branch modal `active-branch` indicator
The current `active-branch` CSS class only marks the user's own current branch. After this change, branches occupied by peers also get visual treatment (peer avatar dots). The `active-branch` class remains for the user's own branch to distinguish "where I am" from "where others are."

### Performance: presence rebroadcast on every checkout
Calling `schedulePushPresence(roomId)` after every `profile` update is already the existing behaviour (the `profile` handler already calls it). Adding branch info to the presence payload adds ~30 bytes per client. For a room with 20 clients, the total presence message grows from ~600 bytes to ~1200 bytes — a negligible increase, compressed further by P059.

### "Follow peer" one-click UX
When the branch modal shows peer avatars on a branch, clicking the **branch row** already checks out that branch (existing behaviour). Users can therefore "follow Alice to her branch" by opening the branch modal, finding Alice's avatar next to a branch name, and clicking that row. No additional UI element is needed. An optional future enhancement is a "Follow" button on each peer in the presence panel that directly triggers checkout to their branch.

## Testing Requirements

### Unit tests (`lib/sketchgit/coordinators/branchCoordinator.test.ts`)
- `openBranchModal()` with `presenceClients = [{…, branch: 'feature/x'}]` renders an avatar dot next to the `feature/x` branch row.
- `openBranchModal()` with no peers on a branch renders no avatar dot.
- Clicking a branch row with peers triggers `ws.send({ type: 'profile', branch: … })`.

### Unit tests (`lib/sketchgit/realtime/collaborationManager.test.ts`)
- `updateCollabUI()` renders a `⎇ feature/x` label when `presenceClients[0].branch = 'feature/x'`.
- `updateCollabUI()` renders no branch label when `branch` is absent.
- `getPresenceClients()` returns a copy of `presenceClients` (not the internal array).

### Server tests (inline helpers mirroring `server.ts`)
- `pushPresence()` includes `branch` and `headSha` for each client.
- `profile` handler with `{ branch: 'feat/x' }` updates `client.currentBranch = 'feat/x'`.
- `branch-update` handler updates `client.currentBranch` and calls `schedulePushPresence`.
- `getGlobalPresence()` preserves `branch` and `headSha` fields when merging per-instance data.

### Integration / E2E
- Two clients in the same room: Client A checks out `feature/logo`. Client B's branch modal shows Client A's avatar next to `feature/logo`.
- Client B clicks `feature/logo` → Client B is checked out to `feature/logo`; Client A sees Client B appear in the `feature/logo` presence slot.

## Dependency Map
- Builds on: P001 ✅ (module decomposition), P004 ✅ (WsClient), P012 ✅ (Redis presence), P017 ✅ (BranchCoordinator), P031 ✅ (WS message validation), P035 ✅ (cross-instance presence), P044 ✅ (presence debounce), P053 ✅ (branch-update message)
- Complements: P063 (Copilot instructions — new convention: send `profile` after every branch checkout), P074 (activity feed — BRANCH_CHECKOUT events can use the client's branch context), P067 (object locking — lock display could indicate which branch the locking client is on)
- Independent of: database migrations (no schema change), Next.js build, auth, Redis Cluster mode
