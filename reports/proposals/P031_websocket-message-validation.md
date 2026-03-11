# P031 – WebSocket Message Payload Validation and Size Limiting

## Title
Validate Incoming WebSocket Message Payloads with Zod Schemas and Enforce Per-Message Size Limits

## Brief Summary
The WebSocket server accepts every incoming message from every connected client and dispatches it based on the `type` field without validating the structure, field types, or size of the payload. A malicious or buggy client can send arbitrarily large messages, unexpected field types, or unsupported message types, potentially crashing the server, corrupting room state, or triggering unhandled code paths. Adding Zod-based schema validation for every message type and enforcing a maximum payload size hardens the server against these attack vectors and improves the reliability and maintainability of the message handling code.

## Current Situation
In `server.ts` the message handler parses and dispatches without any validation:
```typescript
ws.on("message", async (data) => {
  let msg: WsMessage;
  try {
    msg = JSON.parse(data.toString()) as WsMessage;
  } catch {
    return; // only rejects invalid JSON; accepts any valid JSON payload
  }

  switch (msg.type) {
    case "draw":
      broadcastRoom(roomId, msg, clientId); // msg.delta could be any shape/size
      break;
    case "commit":
      // msg.canvas could be a 50 MB string; no size check
      await dbSaveCommit(roomId, sha, { canvas: msg.canvas as string, … }, …);
      break;
    // …
  }
});
```

There are no checks on:
- The byte length of any message.
- The required vs. optional fields for each message type.
- The type of each field (e.g. `canvas` must be a valid JSON string, not `null` or a number).
- Whether `type` is one of the known discriminants (unknown types are silently ignored, but the cast `as WsMessage` suppresses TypeScript errors).

## Problem with Current Situation
1. **Oversized payloads**: A client can send a `draw` message with a `delta` containing thousands of fabricated objects, flooding all peers with megabytes of data per event.
2. **Type confusion**: A client sending `{ type: "commit", sha: null, canvas: 12345 }` will cause `dbSaveCommit` to receive unexpected types, potentially triggering runtime exceptions or persisting garbage to the database.
3. **No authoritative message contract**: The `WsMessage` union type in `types.ts` uses `[key: string]: unknown` as an index signature, giving TypeScript a false sense of safety. Any field access is `unknown` and requires explicit casting, which is trivially bypassed.
4. **Difficult to test**: Without explicit schemas, writing tests for edge cases requires knowledge of implicit runtime assumptions scattered across the `switch` statement.
5. **Missing `draw-delta` validation**: The draw-delta protocol (P006) accepts `added`, `modified`, `removed` arrays. A malformed delta (e.g. an object without `_id`) will silently corrupt the peer's canvas state.

## Goal to Achieve
1. Define a Zod schema for every supported inbound message type.
2. Reject messages that fail schema validation with a `400 Bad Request`-equivalent WebSocket message (a `{ type: "error", code: "INVALID_PAYLOAD" }` response) and log the violation.
3. Enforce a configurable maximum message size (default: 512 KB) and close connections that exceed it.
4. Narrow the `WsMessage` type to per-variant shapes so that the `switch` body can access fields without casting.
5. Cover validation logic with unit tests.

## What Needs to Be Done

### 1. Define per-message Zod schemas in `lib/sketchgit/types.ts` or a new `lib/api/wsSchemas.ts`
Example (illustrative):
```typescript
import { z } from 'zod';

const DrawMessageSchema = z.object({
  type: z.literal('draw'),
  canvas: z.string().min(2).max(524_288), // 512 KB max
});

const DrawDeltaSchema = z.object({
  type: z.literal('draw-delta'),
  added:    z.array(z.record(z.unknown())).max(500),
  modified: z.array(z.record(z.unknown())).max(500),
  removed:  z.array(z.string()).max(500),
});

const CommitMessageSchema = z.object({
  type:     z.literal('commit'),
  sha:      z.string().min(8).max(64),
  parent:   z.string().max(64).nullable(),
  parents:  z.array(z.string().max(64)).max(10),
  branch:   z.string().min(1).max(100),
  message:  z.string().min(1).max(500),
  canvas:   z.string().min(2).max(524_288),
  isMerge:  z.boolean().default(false),
});

const CursorMessageSchema = z.object({
  type: z.literal('cursor'),
  x: z.number().finite(),
  y: z.number().finite(),
});

// … one schema per type …

export const InboundWsMessageSchema = z.discriminatedUnion('type', [
  DrawMessageSchema,
  DrawDeltaSchema,
  CommitMessageSchema,
  CursorMessageSchema,
  // …
]);

export type InboundWsMessage = z.infer<typeof InboundWsMessageSchema>;
```

### 2. Add a size-check gate in the `message` handler in `server.ts`
```typescript
const MAX_WS_PAYLOAD_BYTES = 512 * 1024; // 512 KB

ws.on("message", async (data: Buffer | string) => {
  const raw = typeof data === 'string' ? data : data.toString('utf8');
  if (raw.length > MAX_WS_PAYLOAD_BYTES) {
    logger.warn({ clientId, roomId, size: raw.length }, "ws: message exceeds size limit");
    sendTo(client, { type: "error", code: "PAYLOAD_TOO_LARGE" });
    ws.close(1009, "Message too large");
    return;
  }
  // … existing JSON parse …
});
```

### 3. Replace `as WsMessage` cast with Zod parse
```typescript
const parsed = InboundWsMessageSchema.safeParse(msg);
if (!parsed.success) {
  logger.warn({ clientId, roomId, errors: parsed.error.errors }, "ws: invalid message schema");
  sendTo(client, { type: "error", code: "INVALID_PAYLOAD" });
  return;
}
const validMsg = parsed.data; // fully typed, no cast needed
```

### 4. Update the `switch` body to use `validMsg` (no `as` casts)
Because `z.discriminatedUnion` narrows the type in each `case` branch, every field access becomes type-safe:
```typescript
case "commit":
  // validMsg.sha is string; validMsg.canvas is string (max 512 KB)
  await dbSaveCommit(roomId, validMsg.sha, { … }, client.userId);
  break;
```

### 5. Unit tests in `lib/api/wsSchemas.test.ts`
- Valid payload for each message type parses successfully.
- Missing required field returns a Zod error.
- `canvas` field exceeding 512 KB is rejected.
- Unknown `type` value is rejected by `discriminatedUnion`.

### 6. Server integration test
- Send an oversized message → connection is closed with code 1009.
- Send a message with wrong field type → `{ type: "error", code: "INVALID_PAYLOAD" }` is returned.

## Components Affected
| Component | Change |
|-----------|--------|
| `server.ts` | Add size gate; replace cast with `safeParse`; use narrowed types |
| `lib/api/wsSchemas.ts` | **New file** – Zod schemas for all inbound message types |
| `lib/sketchgit/types.ts` | Optionally update `WsMessage` to import from `wsSchemas.ts` |
| `lib/api/wsSchemas.test.ts` | **New file** – unit tests for each schema |

## Data & Database Model
No schema changes. The size limit (`MAX_WS_PAYLOAD_BYTES`) should be exposed as an environment variable so it can be tuned without code changes.

## Testing Requirements
- One positive test per message type.
- Boundary tests for string length limits (at limit, over limit).
- Discriminated union rejects unknown `type` values.
- Size gate integration test (requires a mock WebSocket).

## Linting and Type Requirements
- `eslint-disable` overrides for `as` casts in the `switch` body should be removed once the Zod-narrowed type is in place.
- `InboundWsMessage` replaces `WsMessage` as the parameter type in `broadcastRoom`, `dbSaveCommit`, and all downstream handlers that currently use `[key: string]: unknown`.

## Security Implications
This proposal directly addresses a potential Denial-of-Service vector (oversized canvas payload) and a data integrity issue (type confusion in commit persistence). It should be prioritised alongside P015 (rate limiting) and P019 (security headers) as part of the defence-in-depth strategy.

## Dependency Map
- Depends on: P013 ✅ (server in TypeScript), P014 ✅ (Zod available)
- Benefits from: P029 (bounded canvas size makes the 512 KB limit reasonable)
- Complements: P015 ✅ (rate limiting prevents frequency attacks; this proposal prevents size and schema attacks)
