# P059 – WebSocket Per-Message Deflate Compression

## Title
Enable WebSocket Per-Message Deflate Compression to Reduce Real-time Bandwidth Usage for Large Canvas Payloads

## Brief Summary
The `ws` library used for real-time collaboration supports the `permessage-deflate` WebSocket extension (RFC 7692) natively. Enabling it on the server with sensible window size and threshold settings can reduce the bandwidth used by `canvas-sync`, `draw-delta`, and `fullsync` messages by 60–80%, since canvas JSON is highly repetitive text. This is a zero-code-change on the client side (browsers handle the negotiation automatically) and requires only a configuration change in `server.ts`.

## Current Situation
The WebSocket server is created in `server.ts` with:
```typescript
const wss = new WebSocketServer({ server, path: '/ws' });
```
No `perMessageDeflate` option is passed, so compression is disabled. Every WebSocket message—including large `canvas-sync` payloads that may contain full Fabric.js JSON (potentially 50–500 KB per snapshot)—is sent as raw uncompressed text over the network.

The `ws` library (v8, which is already a dependency) supports the `permessage-deflate` extension natively. Clients that connect via any modern browser automatically advertise support for the extension during the WebSocket handshake; no client-side changes are required.

### Relevant files
```
server.ts                  ← WebSocketServer creation, no compression config
package.json               ← ws@^8.x already installed
```

### Message types that carry large payloads
| Message type | Typical payload size | Sent frequency |
|--------------|---------------------|----------------|
| `canvas-sync` | 10–500 KB | On every commit save |
| `fullsync` / `fullsync-reply` | 10–500 KB (full room snapshot) | On client reconnect |
| `draw-delta` (P006) | 1–50 KB | Up to 10×/sec per drawing user |
| `commit` | 10–500 KB | On user commit |

## Problem with Current Situation
1. **High bandwidth for canvas payloads**: Fabric.js JSON is highly repetitive (repeated property names, numeric coordinates, hex color strings). Uncompressed, a 100-object canvas is typically 50–100 KB per message. Without compression, a room with 5 active collaborators exchanging `draw-delta` messages at 10 Hz generates 5 × 10 × 50 KB = 2.5 MB/s of server → client traffic.
2. **Unnecessary server egress cost**: Cloud providers charge for outbound bandwidth. Uncompressed WebSocket traffic multiplied across many rooms accumulates significant cost that compression would eliminate.
3. **Mobile users impacted**: Mobile clients on cellular connections experience high latency for large uncompressed messages. Even with the P006 throttling (100 ms minimum interval), large snapshots cause noticeable lag.
4. **Compression available at zero client cost**: The `permessage-deflate` extension is negotiated during the WebSocket handshake. All major browsers (Chrome, Firefox, Safari, Edge) advertise support for it automatically. No client-side code change is needed.

## Goal to Achieve
1. Enable `perMessageDeflate` on the `WebSocketServer` in `server.ts` with a configuration tuned for canvas JSON (large sliding window, reasonable threshold to skip compression of tiny messages).
2. Reduce bandwidth used by WebSocket messages by at least 60% for typical canvas payloads (measurable via browser DevTools → Network → WS frames).
3. Avoid CPU overhead for tiny messages (presence pings, `pong` frames) by setting a minimum message size threshold below which compression is skipped.
4. Document the memory implications (each compressed connection uses ~128 KB for the zlib context) so operators can tune `zlibDeflateOptions` for their deployment scale.

## What Needs to Be Done

### 1. Update `WebSocketServer` configuration in `server.ts`
```typescript
const wss = new WebSocketServer({
  server,
  path: '/ws',
  perMessageDeflate: {
    // RFC 7692 negotiation: request the maximum sliding window (15 bits = 32 KB).
    // Most clients honour this; the actual window used is the minimum of client
    // and server values.
    serverMaxWindowBits: 15,
    clientMaxWindowBits: 15,

    // Do not compress messages smaller than 1 KB – the zlib overhead exceeds
    // the saving for tiny messages (presence pings, heartbeat pong frames).
    threshold: 1024,

    // Concurrency: zlib context is created per-message; no global lock needed.
    // Leave zlibInflateOptions/zlibDeflateOptions at defaults for now.
  },
});
```

### 2. Measure baseline and post-change bandwidth in CI
Add an optional `scripts/measure-ws-compression.ts` benchmark (not part of the standard test suite) that:
- Connects two ws clients to a local server.
- Sends a synthetic 100-object canvas JSON payload 100 times.
- Reads the number of bytes transferred (using `ws`'s `bytesReceived`/`bytesSent` counters).
- Logs the compression ratio.

This script is run manually and is not wired into CI; its output is documented in this proposal for reference.

### 3. Document memory implications in `server.ts` comment
Each active WebSocket connection with `perMessageDeflate` enabled consumes approximately 128 KB of memory for the inflate/deflate context. At 1000 concurrent connections, this is 128 MB—acceptable for a server with ≥1 GB RAM. For deployments expecting >5000 concurrent connections, the `zlibDeflateOptions.memLevel` can be reduced from the default (8) to 5–6, halving the per-connection memory at the cost of ~5% compression ratio.

Add a JSDoc comment above the `perMessageDeflate` configuration block explaining these trade-offs.

### 4. Env var for tuning (optional)
Add `WS_COMPRESSION_THRESHOLD` to `lib/env.ts` with a default of `1024` (bytes) so operators can tune the threshold without redeploying code:
```typescript
WS_COMPRESSION_THRESHOLD: z.coerce.number().int().min(0).default(1024),
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `server.ts` | Add `perMessageDeflate` option to `WebSocketServer` constructor |
| `lib/env.ts` | Optional: add `WS_COMPRESSION_THRESHOLD` env var |
| `lib/env.test.ts` | Update tests if new env var is added |

## Additional Considerations

### Browser support
All modern browsers support `permessage-deflate`. Clients that do not support it (very old browsers or custom WebSocket clients) will simply connect without compression; the server gracefully falls back to uncompressed mode per the RFC.

### CPU impact
zlib compression adds CPU overhead proportional to payload size. For a single-core server, compressing 1000 messages/second of 50 KB each takes approximately 50 ms/s of CPU time (5% overhead). This is well within acceptable bounds for typical collaboration scenarios.

### Interaction with rate limiting
The P031 WebSocket payload size limit (`MAX_WS_PAYLOAD_BYTES = 512 KB`) applies to the **uncompressed** payload after the `ws` library decompresses incoming frames. The limit enforcement in `server.ts` uses `ws.on('upgrade')` to reject oversized messages at the protocol level, which happens after decompression. This ordering is correct and does not need to change.

### Proxy / load balancer considerations
Some HTTP proxies and load balancers strip the `Sec-WebSocket-Extensions` header, disabling compression negotiation. If the application is deployed behind such a proxy, compression will silently fall back to uncompressed mode. This is safe (not an error) but should be verified in the deployment environment.

## Testing Requirements
- `WebSocketServer` is created with `perMessageDeflate` enabled (unit test or integration test asserting the option is set).
- A client connecting to the local test server and sending a 10 KB JSON payload receives a compressed response (verify via `socket._socket.bytesRead` before and after).
- Presence `pong` messages (< 100 bytes) are not compressed (verify threshold is respected).
- Server handles a client that does not send `Sec-WebSocket-Extensions: permessage-deflate` without error.

## Dependency Map
- Builds on: P013 ✅ (server in TypeScript), P006 ✅ (draw-delta throttling—compression amplifies the bandwidth savings of throttling)
- Complements: P031 ✅ (payload size limits), P043 ✅ (graceful shutdown)
- Independent of: Redis, database, auth, Next.js build
