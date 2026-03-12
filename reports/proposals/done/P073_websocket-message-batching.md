# P073 – WebSocket Outbound Message Batching

## Title
Batch Multiple Small WebSocket Messages Within a Single `requestAnimationFrame` Tick to Reduce Per-Frame TCP Overhead and Improve Throughput Efficiency

## Brief Summary
`WsClient.send()` currently calls `WebSocket.send()` immediately and synchronously for every individual message. During peak drawing activity, the P006 throttle controls frequency, but multiple messages of different types (e.g., a `cursor` update followed immediately by a `draw-delta`) may be queued within the same millisecond and sent as separate TCP frames. Batching outbound messages within a short window (one `setTimeout(fn, 0)` or `queueMicrotask` tick) and serialising them as a JSON array allows the TCP layer to combine them into a single packet, reducing protocol overhead and improving CPU efficiency on the receiver side.

## Current Situation
`WsClient.send()` in `lib/sketchgit/realtime/wsClient.ts`:
```typescript
send(data: WsMessage): void {
  const json = JSON.stringify(data);
  if (this.socket?.readyState === WebSocket.OPEN) {
    try { this.socket.send(json); } catch { /* ignore */ }
  } else {
    this.messageQueue.push(json);
  }
}
```
Each `send()` call results in one `WebSocket.send()` call, which results in one WebSocket frame (and potentially one TCP segment). During active drawing:
- `cursor` messages fire on every `mousemove` (throttled to 100 ms by P006)
- `draw-delta` messages fire on every canvas object modification (throttled to 100 ms by P006)

These two throttle timers fire independently, so within a single 100 ms window a client may send both a `cursor` and a `draw-delta` as separate WebSocket frames. On the server, each WebSocket frame wakes the `message` event handler, requiring two separate handler invocations and two Redis pub/sub publishes.

### Message size analysis
| Message type | Typical size | Send frequency |
|-------------|-------------|----------------|
| `cursor` | 80–120 bytes | Up to 10/sec per user |
| `draw-delta` (simple shape) | 500–5000 bytes | Up to 10/sec per user |
| `pong` | 20 bytes | Every 25 seconds |
| `profile` | 100 bytes | On connect |

A `cursor` message is so small that the TCP/IP header (40 bytes) represents 25–33% overhead. Batching it with a concurrent `draw-delta` message eliminates this overhead.

## Problem with Current Situation
1. **TCP fragmentation overhead**: Small messages (pong, cursor, profile) sent individually incur full TCP/IP header overhead per message, wasting bandwidth disproportionate to payload size.
2. **Duplicate server wake-ups**: Each separately sent message wakes the server's WebSocket `message` handler independently. For a room with 10 active users each sending 2 message types per tick, the server processes 20 separate `message` events instead of 10 batched events.
3. **Redis pub/sub amplification**: Each message event in `server.ts` triggers a `redisPub.publish()` call. Two separate messages double the Redis publish count versus one batched publish.
4. **No batching for reconnection queue**: When the client reconnects, the `messageQueue` flushes one message at a time. A burst of queued messages after a brief offline period creates a thundering-herd send pattern.

## Goal to Achieve
1. Add a `batchSend()` method to `WsClient` that accumulates messages in a `pendingBatch: WsMessage[]` array.
2. Flush the batch using `queueMicrotask` or `setTimeout(fn, 0)` to collect all messages enqueued within the same JavaScript task.
3. Serialize the batch as a JSON array (`WsMessage[]`) in a single `WebSocket.send()` call.
4. Update `server.ts` to handle both single-message (existing format) and batched `WsMessage[]` payloads.
5. Keep `send()` as-is for high-priority messages that should not be deferred (e.g., `pong` heartbeat responses, `disconnect` messages).

## What Needs to Be Done

### 1. Add `sendBatched()` to `WsClient`
```typescript
private pendingBatch: WsMessage[] = [];
private batchFlushScheduled = false;

/**
 * Enqueue a message in the outgoing batch.
 * The batch is flushed at the end of the current JavaScript task (via queueMicrotask).
 * Use this for high-frequency messages (cursor, draw-delta) that benefit from
 * coalescing. Use send() directly for control messages (pong, disconnect).
 */
sendBatched(data: WsMessage): void {
  if (this.socket?.readyState !== WebSocket.OPEN) {
    // Fall back to the individual queue if not connected.
    this.send(data);
    return;
  }
  this.pendingBatch.push(data);
  if (!this.batchFlushScheduled) {
    this.batchFlushScheduled = true;
    queueMicrotask(() => this._flushBatch());
  }
}

private _flushBatch(): void {
  this.batchFlushScheduled = false;
  if (this.pendingBatch.length === 0) return;
  const messages = this.pendingBatch.splice(0);
  if (messages.length === 1) {
    // Avoid wrapping single messages in an array (no overhead saving for one message)
    try { this.socket?.send(JSON.stringify(messages[0])); } catch { /* ignore */ }
  } else {
    try { this.socket?.send(JSON.stringify(messages)); } catch { /* ignore */ }
  }
}
```

### 2. Update `collaborationManager.ts` to use `sendBatched()`
```typescript
// In _flushDrawDelta():
this.ws.sendBatched({ type: 'draw-delta', delta: patches, senderId: this.wsClientId });

// In broadcastCursor():
this.ws.sendBatched({ type: 'cursor', x, y, clientId: this.wsClientId });
```
Control messages remain using `send()` directly:
```typescript
// heartbeat pong (must not be delayed):
this.ws.send({ type: 'pong' });
// room join:
this.ws.send({ type: 'profile', name, color });
```

### 3. Update `server.ts` to handle batched payloads
```typescript
wss.on('connection', (ws: ClientState, req) => {
  ws.on('message', async (rawData) => {
    let messages: WsMessage[];

    try {
      const parsed: unknown = JSON.parse(rawData.toString());
      // Support both single message and batched array:
      messages = Array.isArray(parsed) ? parsed as WsMessage[] : [parsed as WsMessage];
    } catch {
      logger.warn({ clientId: ws.clientId }, 'ws: failed to parse message');
      return;
    }

    for (const message of messages) {
      // Validate with InboundWsMessageSchema (P031):
      const validated = InboundWsMessageSchema.safeParse(message);
      if (!validated.success) continue;
      await handleMessage(ws, validated.data);
    }
  });
});
```

### 4. Add `_flushBatch()` call in `disconnect()`
When the client disconnects, flush any pending batched messages synchronously:
```typescript
disconnect(): void {
  this._flushBatch(); // flush before closing
  this.intentionalClose = true;
  // … rest of disconnect …
}
```

### 5. Update `destroy()` to clear pending batch
```typescript
destroy(): void {
  this.pendingBatch = [];
  this.batchFlushScheduled = false;
  // … rest of destroy …
}
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `lib/sketchgit/realtime/wsClient.ts` | Add `pendingBatch`, `sendBatched()`, `_flushBatch()` |
| `lib/sketchgit/realtime/collaborationManager.ts` | Use `sendBatched()` for `draw-delta` and `cursor` messages |
| `server.ts` | Parse both single `WsMessage` and `WsMessage[]` arrays |
| `lib/api/wsSchemas.ts` | Optional: add schema for the batched array format |

## Additional Considerations

### `queueMicrotask` vs. `setTimeout(fn, 0)`
`queueMicrotask` flushes at the end of the current microtask checkpoint (before the next macrotask), while `setTimeout(fn, 0)` adds a macrotask. For message batching, `queueMicrotask` is preferred because it collects all messages sent within a single synchronous code path (e.g., all `sendBatched()` calls within one `_flushDrawDelta()` and one `broadcastCursor()` call that happen in the same event loop turn).

### Backward compatibility
The server already handles single `WsMessage` objects. The proposed change adds support for `WsMessage[]` arrays while keeping the existing single-message handling. Old clients that do not use `sendBatched()` continue to work without any changes.

### Batch size limit
To prevent a degenerate case where thousands of messages accumulate in a single batch (e.g., during a reconnection flush), add a maximum batch size:
```typescript
private MAX_BATCH_SIZE = 20;

sendBatched(data: WsMessage): void {
  if (this.pendingBatch.length >= this.MAX_BATCH_SIZE) {
    this._flushBatch(); // flush early if batch is full
  }
  // … rest of sendBatched …
}
```

### Interaction with P059 (per-message deflate)
WebSocket per-message deflate (P059) compresses each WebSocket frame independently. Batching two 100-byte messages into one 200-byte message and then compressing produces better compression than compressing two 100-byte messages separately, because the deflate algorithm exploits repeated patterns across the combined payload. The combination of P073 batching + P059 compression produces the maximum bandwidth reduction.

## Testing Requirements
- `sendBatched()` with two messages flushes them as a JSON array in a single `WebSocket.send()` call.
- `sendBatched()` with one message flushes it as a single JSON object (not an array).
- `server.ts` handles a JSON array payload by processing each element as a separate message.
- `server.ts` handles a single JSON object payload (existing behaviour unchanged).
- `destroy()` clears `pendingBatch` without sending (no post-destroy sends).
- `disconnect()` flushes pending batch before closing.
- Heartbeat `pong` messages use `send()` directly and are not deferred.

## Dependency Map
- Builds on: P004 ✅ (WsClient reconnect), P006 ✅ (draw-delta throttling — batching accumulates the already-throttled output), P031 ✅ (WS message validation — server processes each batched message through the validator)
- Complements: P059 (compression — batching + compression gives the best bandwidth reduction)
- Independent of: Redis, database, auth, Next.js build
