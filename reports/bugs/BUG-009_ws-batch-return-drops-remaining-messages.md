# BUG-009 – `return` in WS batch loop silently drops messages after any invalid one

| Field | Value |
|---|---|
| **ID** | BUG-009 |
| **Severity** | High |
| **Category** | WebSocket / Data loss |
| **Status** | Open |

## Summary

The P073 batch WebSocket message handler in `server.ts` uses `return` (exits the entire handler) instead of `continue` (skips only the invalid message) when a message in a batch fails schema validation. In a batch frame (`WsMessage[]`), any invalid message causes all subsequent messages in the same batch to be silently dropped — they are never processed and no error is reported for them.

## Affected File

| File | Line | Issue |
|---|---|---|
| `server.ts` | 1142–1150 | `return` inside the `for` loop exits the whole batch handler |

## Root Cause

```ts
// server.ts lines 1142-1150 — WRONG
const messages: unknown[] = Array.isArray(parsed) ? parsed : [parsed];

for (const msg of messages) {
  const validated = InboundWsMessageSchema.safeParse(msg);
  if (!validated.success) {
    logger.warn({ clientId, roomId, errors: validated.error.issues }, "ws: invalid message schema");
    sendTo(client, { type: "error", code: "INVALID_PAYLOAD" });
    return;  // ← exits the asyncHandler callback; drops all remaining messages in the batch
  }
  await handleWsMessage(client, validated.data as unknown as WsMessage, roomId, clientId);
}
```

The `asyncHandler("ws:message", async (raw) => { ... })` is the function that `return` exits. In a 3-message batch `[A, B (invalid), C]`:
1. `A` is validated and processed.
2. `B` fails validation: `INVALID_PAYLOAD` is sent to the client, then `return` exits the arrow function.
3. **`C` is never seen by the server.**

### Interaction with BUG-005

BUG-005 means that `fullsync-request` is currently rejected by the schema. The client sends `fullsync-request` as a standalone `send()` (not batched), so there is no direct interaction today. However, if a future change moves `fullsync-request` into a batch, or if any other valid message type ends up in a batch after an invalid one, messages will be silently dropped.

In the current codebase, `sendBatched()` is used for:
- `cursor` updates
- `draw-delta` updates  
- `object-lock` / `object-unlock`
- `view-sync` (presenter mode)

These are coalesced by `queueMicrotask`. If, for example, a `cursor` update fires in the same microtask as an `object-lock` message, and the `cursor` message is somehow invalid (e.g. a NaN coordinate), then the `object-lock` message is silently dropped, and the peer's remote lock overlay will not be shown or cleared.

## Impact

- In any batch frame where an early message is invalid, all subsequent messages are silently dropped.
- The dropped messages receive neither processing nor an individual error notification — the client cannot know which specific messages in the batch were accepted.
- No log entry is written for the dropped messages; they vanish without trace.
- Most harmful when the invalid message is the FIRST in a batch (e.g. due to BUG-005 producing invalid messages) — all other messages in the batch would be dropped.

## Suggested Fix

Replace `return` with `continue` to skip only the invalid message and keep processing the rest of the batch:

```ts
// server.ts — CORRECT
for (const msg of messages) {
  const validated = InboundWsMessageSchema.safeParse(msg);
  if (!validated.success) {
    logger.warn({ clientId, roomId, errors: validated.error.issues }, "ws: invalid message schema");
    sendTo(client, { type: "error", code: "INVALID_PAYLOAD" });
    continue;  // ← skip this one message; continue with the rest of the batch
  }
  await handleWsMessage(client, validated.data as unknown as WsMessage, roomId, clientId);
}
```
