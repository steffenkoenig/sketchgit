# P044 – Presence Broadcast Debouncing for Simultaneous Connects

## Title
Debounce the `pushPresence` Broadcast to Prevent Ghost-Client Flicker During Simultaneous Room Joins

## Brief Summary
When multiple users connect to the same room within a short window — a common scenario when a shared link is opened by a team, when a user refreshes their browser, or when a client reconnects after a network blip — each connection triggers an independent `pushPresence()` broadcast before receiving the others' presence. The result is a cascade of partial presence lists: user A sees only themselves, then a moment later sees A+B, then A+B+C. During this window, users appear to "pop in" one by one, creating a confusing flicker effect. A short debounce on `pushPresence` coalesces rapid successive joins into a single broadcast that reflects the stable final state.

## Current Situation
In `server.ts`, every new WebSocket connection immediately calls `pushPresence`:
```typescript
wss.on("connection", async (ws, reqUrl) => {
  // …
  room.set(clientId, client);
  await dbEnsureRoom(roomId, client.userId);

  logger.info(…);
  sendTo(client, { type: "welcome", … });
  pushPresence(roomId); // ← fires immediately for every connect
  // …
});
```

`pushPresence` broadcasts the current room's client list synchronously:
```typescript
function pushPresence(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  const clients = [];
  for (const [clientId, client] of room.entries()) {
    clients.push({ clientId, name: client.displayName, color: client.displayColor, userId: … });
  }
  broadcastLocalRoom(roomId, { type: "presence", roomId, clients });
}
```

There is no coalescing or debouncing. If 5 users open the same link simultaneously:
- Connect 1: broadcast `[A]`
- Connect 2: broadcast `[A, B]`
- Connect 3: broadcast `[A, B, C]`
- Connect 4: broadcast `[A, B, C, D]`
- Connect 5: broadcast `[A, B, C, D, E]`

Each user receives 4–5 presence updates within 100ms, with intermediate states that look like the room has fewer collaborators than it actually does.

The same issue occurs on disconnect: leaving a room triggers `pushPresence` immediately, so a user who briefly loses connectivity and reconnects within a few seconds causes the entire room to briefly show one fewer collaborator.

## Problem with Current Situation
1. **Misleading collaborator count**: Users see a count that fluctuates rapidly during join bursts, creating uncertainty about how many people are in the room.
2. **Cursor colour instability**: Collaborator colours are assigned based on presence list index. Rapid presence updates can cause a user's assigned colour to change multiple times during simultaneous joins.
3. **Unnecessary broadcast traffic**: In a room with 20 clients, 5 simultaneous joins generate 5 × 20 = 100 broadcast messages within 100ms. A single debounced broadcast generates 1 × 20 = 20 messages.
4. **Ghost clients on reconnect**: A user refreshing their browser tab triggers disconnect → presence broadcast (N-1 users) → connect → presence broadcast (N users). With a 50ms debounce, only the final stable state is broadcast.

## Goal to Achieve
1. Coalesce rapid successive `pushPresence` calls for the same room into a single debounced broadcast, fired 80ms after the last connect/disconnect event.
2. Guarantee a maximum of one presence broadcast per room per 80ms window.
3. Maintain immediate `welcome` delivery to the newly-connected client (no delay on the welcome message).
4. Work correctly in both single-instance (local map) and multi-instance (Redis pub/sub) modes.

## What Needs to Be Done

### 1. Add per-room presence debounce timers to `server.ts`
```typescript
/** Per-room debounce timers for presence broadcasts. */
const presenceDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Configurable debounce window. Expose via env: PRESENCE_DEBOUNCE_MS (default: 80). */
const PRESENCE_DEBOUNCE_MS = parseInt(process.env.PRESENCE_DEBOUNCE_MS ?? '80', 10);

/**
 * Schedule a debounced presence broadcast for the given room.
 * Multiple calls within PRESENCE_DEBOUNCE_MS are coalesced into one.
 */
function schedulePushPresence(roomId: string): void {
  const existing = presenceDebounceTimers.get(roomId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    presenceDebounceTimers.delete(roomId);
    pushPresence(roomId);
  }, PRESENCE_DEBOUNCE_MS);

  presenceDebounceTimers.set(roomId, timer);
}
```

### 2. Replace direct `pushPresence` calls with `schedulePushPresence`
Replace every `pushPresence(roomId)` call site with `schedulePushPresence(roomId)`:

```typescript
// On connect:
wss.on("connection", async (ws, reqUrl) => {
  // …
  sendTo(client, { type: "welcome", … }); // immediate – no change
  schedulePushPresence(roomId);            // debounced – was pushPresence(roomId)
  // …
});

// On disconnect:
client.on("close", () => {
  // …
  schedulePushPresence(roomId);            // debounced – was pushPresence(roomId)
  // …
});
```

### 3. Clear debounce timers on graceful shutdown
In the shutdown handler, clear all pending debounce timers so they don't fire after the server has started closing:
```typescript
presenceDebounceTimers.forEach((timer) => clearTimeout(timer));
presenceDebounceTimers.clear();
```

### 4. Add `PRESENCE_DEBOUNCE_MS` to environment validation
In `lib/env.ts`:
```typescript
PRESENCE_DEBOUNCE_MS: z.coerce.number().int().min(0).max(1000).default(80),
```

### 5. Tests
- Unit: 5 rapid `schedulePushPresence` calls → `pushPresence` called exactly once after 80ms.
- Unit: `schedulePushPresence` with 0ms debounce → behaves like direct `pushPresence`.
- Unit: `schedulePushPresence` followed by a shutdown → `pushPresence` NOT called (timer cleared).
- Integration (manual): 5 simultaneous browser tabs → presence list stabilises in one update rather than 5.

## Components Affected
| Component | Change |
|-----------|--------|
| `server.ts` | Add `presenceDebounceTimers` map, `schedulePushPresence` helper; replace all direct `pushPresence` calls; clear timers in shutdown |
| `lib/env.ts` | Add `PRESENCE_DEBOUNCE_MS` env var |
| `.env.example` | Document `PRESENCE_DEBOUNCE_MS` |

## Data & Database Model
No changes. This is a runtime timing optimisation only.

## Testing Requirements
- `schedulePushPresence` called 3 times within 80ms → `pushPresence` invoked exactly once.
- `schedulePushPresence` called, then 100ms passes, then called again → `pushPresence` invoked twice total (one per 80ms window).
- Shutdown with a pending debounce timer → `pushPresence` is NOT invoked after shutdown starts.

## Linting and Type Requirements
- `presenceDebounceTimers` typed as `Map<string, ReturnType<typeof setTimeout>>` (cross-platform timer type).
- `PRESENCE_DEBOUNCE_MS` validated via `validateEnv()` so a misconfigured value (e.g. `NaN`) fails fast.
- The 80ms default is chosen to be below the human perception threshold for "instant" (~100ms) while being large enough to absorb typical connect storms.

## Dependency Map
- Depends on: P023 ✅ (shutdown handler exists to extend)
- Complements: P035 (cross-instance presence via Redis Hash; debouncing reduces unnecessary Redis HSET calls)
- Independent of: P034 (room access control), P031 (WS payload validation)
