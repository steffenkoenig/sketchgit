# P004 – WebSocket Reconnection & Connection Resilience

## Title
WebSocket Reconnection & Connection Resilience

## Brief Summary
The WebSocket client has no automatic reconnection logic. When the connection drops—due to a network hiccup, server restart, or idle timeout—the user is silently disconnected with no recovery path other than manually refreshing the browser. Adding exponential-backoff reconnection, heartbeat detection, and transparent state re-synchronisation will make collaboration reliable under real-world network conditions.

## Current Situation
`createSketchGitApp.ts` (lines ~1,130–1,350) establishes a WebSocket connection via `connectToPeer()`. The `onclose` handler currently only calls `updatePresenceList()` to reflect the disconnection in the UI; there is no reconnection attempt. The `onerror` handler is not implemented.

The `fullsync` mechanism (requesting the full canvas state from another connected peer) works only if at least one other client is in the room at the time of reconnection. If the user is the last person in the room—or if they reconnect after a server restart—they receive an empty state, losing all unsaved work.

Key observations:
- No `onerror` handler on the WebSocket object.
- No `ping`/`pong` heartbeat to detect stale connections.
- No reconnection timer, backoff strategy, or retry count.
- `onclose` does not distinguish between normal close and abnormal close (code 1006 = abnormal).
- Full state recovery depends on another peer being present; if the server restarts, no peer is available.

## Problem with Current Situation
- **Silent data loss**: A momentary network drop disconnects the user without them noticing. Subsequent changes are not broadcast, and they miss incoming changes from peers.
- **No recovery signal**: There is no toast, banner, or status indicator telling the user they are offline.
- **Peer-dependent sync**: Re-joining a room only works if another peer holds the current state in memory. After a server restart with no active peers, the room appears empty even if it previously contained hours of work.
- **Unreliable collaboration**: In practice, mobile users or those on unstable connections (VPN, Wi-Fi handoff) frequently experience disconnections. Without auto-reconnect, SketchGit is unreliable for these users.
- **No heartbeat**: Long-lived idle connections may be silently dropped by proxies, load balancers, or firewalls without triggering `onclose`, leaving the client in a zombie state.

## Goal to Achieve
1. Automatically reconnect after any unexpected disconnect, with exponential backoff, up to a configurable maximum number of retries.
2. Show the user a clear, unobtrusive offline/reconnecting status indicator.
3. Re-synchronise canvas state seamlessly after reconnection, using persisted state from the server when available (requires P003) or the best available peer.
4. Detect stale connections proactively via a heartbeat mechanism.
5. Resume gracefully without requiring a full page refresh.

## What Needs to Be Done

### 1. Implement a reconnection manager

Create a `ReconnectionManager` (in `lib/sketchgit/realtime/wsClient.ts` after P001) that wraps the native WebSocket:

```
ReconnectionManager
├── connect()           – creates WebSocket, attaches handlers
├── disconnect()        – closes cleanly (no reconnect)
├── onConnected()       – reset retry count, trigger fullsync-request
├── onDisconnected()    – schedule reconnect with backoff
└── scheduleReconnect() – setTimeout with jittered backoff delay
```

**Backoff strategy:**
- Base delay: 1 second
- Multiplier: 2× per attempt
- Maximum delay: 30 seconds
- Jitter: ±20% random variance to avoid thundering herd
- Maximum attempts: 10 (then surface persistent error to user)

### 2. Add an `onerror` handler
Log the error (or report to a future observability layer per P010) and let `onclose` handle the reconnect scheduling, since `onerror` is always followed by `onclose`.

### 3. Implement a heartbeat / keep-alive
- Server sends a `ping` message every 25 seconds to all connected clients.
- Client responds with a `pong` message within 5 seconds.
- If the server receives no `pong`, it closes the connection (triggering `onclose` on the client and normal reconnect flow).
- On the client side, if no message is received for 35 seconds, proactively close and reconnect.

This detects zombie connections that are "connected" at the TCP layer but not actually delivering data.

### 4. Add a connection status indicator to the UI
Show a small status badge in the collaboration panel:
- 🟢 **Connected** – normal operation
- 🟡 **Reconnecting (attempt N/10)…** – during backoff
- 🔴 **Offline** – after maximum retries exhausted; show "Refresh page" link

The badge should be updated by `ReconnectionManager` events so no component needs to know the reconnection details.

### 5. Re-synchronise state after reconnect
On successful reconnection:
1. Broadcast a `fullsync-request` to the room.
2. If P003 (persistence) is implemented, the server satisfies the request from the database—no peer required.
3. If no persistence is available, request from the first available peer as today.
4. Merge incoming state with any local unsent changes (optimistic update reconciliation).

### 6. Queue outgoing messages during disconnection (optional enhancement)
Buffer `draw`, `cursor`, and `commit` messages while offline. Flush the queue in order on reconnection. This prevents the user from losing work done during a brief disconnect.

### 7. Update the server-side close handler
In `server.mjs`, confirm that room cleanup on disconnect does not prematurely destroy room state before all clients have had a chance to reconnect (e.g., delay cleanup by 60 seconds after last client leaves).

## What Components Are Affected
| Component | Impact |
|-----------|--------|
| `lib/sketchgit/createSketchGitApp.ts` (or `realtime/wsClient.ts` after P001) | Replace raw WebSocket with `ReconnectionManager`; add heartbeat logic |
| `server.mjs` | Add server-side `ping` broadcasts; adjust room cleanup timing |
| `components/SketchGitApp.tsx` / `AppTopbar.tsx` | Add connection status badge to the UI |
| WebSocket message protocol | Add `ping` and `pong` message types |

## Additional Considerations

### Dependency on P003
Without persistence, reconnection after a server restart cannot recover room state from a database. The reconnection mechanism works fully for transient network drops even without P003, but for the full benefit (server-restart recovery) P003 should be implemented first or in parallel.

### Testing reconnection
Automated tests for reconnection logic require a mock WebSocket server. Libraries like `mock-socket` can simulate disconnect/reconnect scenarios in unit tests. End-to-end tests (P002) can test real reconnection using Playwright's network throttling capabilities.

### Existing `connectToPeer` function
The current function is ~220 lines and handles both connection setup and all message routing. After P001 splits this into `wsClient.ts` and `collaborationManager.ts`, reconnection logic belongs solely in `wsClient.ts`, keeping the separation clean.
