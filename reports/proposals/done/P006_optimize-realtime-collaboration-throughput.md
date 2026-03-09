# P006 – Optimize Real-time Collaboration Throughput

## Title
Optimize Real-time Collaboration Throughput

## Brief Summary
The current real-time collaboration system broadcasts the full serialized canvas JSON on every drawing update and sends cursor position messages on every mouse-move event. For canvases with many objects or rooms with several participants, this generates substantial redundant network traffic and unnecessary CPU work. Introducing delta encoding, message batching, and cursor throttling will reduce bandwidth consumption and improve responsiveness for all users.

## Current Situation
Every drawing action triggers a call equivalent to:
```javascript
broadcast({ type: 'draw', canvas: fabric.canvas.toJSON() })
```
This serializes the entire canvas state—every object, every property—and sends it to every connected peer, regardless of how small the change was (e.g., moving a single object by one pixel triggers a full snapshot broadcast).

Cursor movement is broadcast similarly:
```javascript
socket.send(JSON.stringify({ type: 'cursor', x, y }))
```
This fires on every `mousemove` event, which in a browser can fire at up to 60–120 times per second. With N peers in a room, the server relays each message to N-1 other clients, multiplying the traffic.

Neither broadcast is debounced, throttled, or batched. There is no compression applied to WebSocket messages.

## Problem with Current Situation
- **Bandwidth waste**: A 50-object canvas might serialize to 20–50 KB of JSON per update. On a slow or metered connection, this is prohibitive.
- **CPU overhead**: `fabric.canvas.toJSON()` traverses and serializes all canvas objects on every update. For large canvases, this is a significant synchronous operation on the main thread.
- **Peer receiver overhead**: Each peer must deserialize and re-render the full canvas on every `draw` message, even if only one object changed.
- **Cursor spam**: At 60 events/second per user × N users × M objects per message, cursor messages alone can saturate a WebSocket connection under active use.
- **Latency perception**: Large messages take longer to transmit and process, making collaboration feel sluggish.
- **Server relay cost**: The server blindly forwards every message to every room member with no deduplication or batching.

## Goal to Achieve
1. Reduce average `draw` message size by 90%+ for typical incremental edits.
2. Reduce cursor message frequency to ≤10 updates per second per user.
3. Batch rapid-fire updates so that a burst of drawing events results in a single broadcast.
4. Maintain the user experience of smooth real-time collaboration.
5. Apply lossless compression to all WebSocket messages.

## What Needs to Be Done

### 1. Implement delta/diff encoding for canvas updates
Instead of broadcasting the full canvas JSON on every change, broadcast only what changed:

**Delta message format:**
```json
{
  "type": "draw-delta",
  "added": [...],       // new objects (full JSON for new objects only)
  "modified": [...],    // changed objects (id + changed properties only)
  "removed": ["id1"]    // IDs of deleted objects
}
```

**Implementation approach:**
- Maintain a `lastBroadcastSnapshot` map of `id → objectJSON` on the client.
- On each drawing event, compute the diff against this snapshot.
- Broadcast the delta if it is non-empty; update `lastBroadcastSnapshot`.
- Peers apply the delta by patching their local canvas state rather than replacing it.

This reduces a typical "move object" message from ~20 KB (full canvas) to ~200 bytes (id + new position).

### 2. Debounce/batch drawing broadcasts
Many drawing actions (freehand pen strokes, object resizing) fire dozens of intermediate events before the user releases the mouse. These intermediate states do not need to be broadcast at full frequency.

**Strategy:**
- **During active drawing** (mouse down, moving): send deltas at most 10–15 times/second (throttle with `requestAnimationFrame` or a 60–100 ms interval).
- **On mouse up / end of action**: immediately send the final authoritative delta.

This ensures peers see smooth updates without drowning in intermediate states.

### 3. Throttle cursor broadcasts
Reduce cursor broadcast frequency from "every mousemove" to a maximum of **10 updates per second**:
```javascript
// Throttle: send cursor at most every 100 ms
```
At 10 updates/second, cursor movement is still visibly smooth (human perception threshold for smooth motion is ~10–15 fps for pointer positions).

### 4. Apply permessage-deflate compression
The `ws` library (already used) supports the `permessage-deflate` WebSocket extension natively. Enable it on the server:
```javascript
const wss = new WebSocketServer({ server, perMessageDeflate: true });
```
And on the client:
```javascript
// Browsers automatically negotiate permessage-deflate when the server supports it
```
This is a one-line change that provides lossless compression (typically 60–80% size reduction for JSON payloads) transparently.

### 5. Reduce full-canvas syncs
The `fullsync` message (sent when a new user joins) must still send the full canvas. Optimize this specific case:
- Compress the payload with `pako` (gzip in the browser) before sending.
- On the server, cache the latest compressed full-sync payload per room and serve it to new joiners without round-tripping to an existing peer (requires P003 for persistence).

### 6. Server-side message coalescing (optional advanced optimization)
If two `draw-delta` messages arrive at the server for the same object within 50 ms from the same client, merge them before relaying to peers. This reduces relay work and peer rendering churn.

### 7. Profile and set performance budgets
After implementing the above changes, measure:
- Average `draw` message size (target: < 1 KB for typical operations)
- Peak cursor messages per second per room
- `toJSON()` call duration for canvases of 10, 50, 100, 200 objects
- Time-to-render for peers receiving a delta vs. full canvas

Establish performance budgets and add lightweight performance assertions to the test suite (P002).

## What Components Are Affected
| Component | Impact |
|-----------|--------|
| `lib/sketchgit/createSketchGitApp.ts` (or `realtime/collaborationManager.ts` after P001) | Replace full-canvas broadcast with delta encoding; throttle cursor; throttle draw |
| `server.mjs` | Enable `perMessageDeflate`; optionally add server-side coalescing |
| `components/SketchGitApp.tsx` | No changes required; delta handling is transparent to the component |
| WebSocket message protocol | Add `draw-delta` message type alongside existing `draw` (for backward compatibility) |

## Additional Considerations

### Backward compatibility
Introduce `draw-delta` as a new message type alongside the existing `draw` (full snapshot). During a transition period, clients that do not understand `draw-delta` will fall back to processing `draw` messages. Once all clients are updated, the full `draw` message can be reserved for initial sync only.

### Fabric.js delta computation
Fabric.js objects have a `toJSON()` method per object. Computing a per-object delta is straightforward: serialize each object individually and compare against the cached version using a shallow property comparison.

### Ordering guarantee
Deltas must be applied in order. WebSocket over TCP guarantees message ordering for a single connection, so this is not a concern for the current architecture.

### Relationship to P003 and P004
- P003 (persistence): Allows the server to serve `fullsync` from the database rather than relaying through peers.
- P004 (reconnection): Clients that reconnect need a reliable full-state sync; delta buffering during disconnection may be needed.
