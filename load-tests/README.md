# Load Tests (P083)

Load and stress tests for SketchGit using [k6](https://k6.io/). k6 is a
Go binary, not an npm package — install it separately: `brew install k6`
(macOS) or see [k6's install docs](https://k6.io/docs/get-started/installation/).

## Running locally

1. Start the app and a database (`docker compose up -d db redis` or your
   own Postgres), then run migrations and start the app:
   ```bash
   npx prisma migrate deploy
   npm run start   # or npm run dev
   ```
2. Seed a room with commit history (required for the commits-api and
   ws-room scenarios):
   ```bash
   DATABASE_URL=... npx tsx load-tests/seed.ts
   ```
3. Run a scenario:
   ```bash
   k6 run -e BASE_URL=http://localhost:3000 load-tests/smoke.js
   k6 run -e BASE_URL=http://localhost:3000 load-tests/scenarios/commits-api.js
   k6 run -e BASE_URL=http://localhost:3000 -e WS_URL=ws://localhost:3000/ws load-tests/scenarios/ws-room.js
   k6 run -e BASE_URL=http://localhost:3000 load-tests/scenarios/auth-ratelimit.js
   ```

`BASE_URL` and `WS_URL` default to `http://localhost:3000` /
`ws://localhost:3000/ws` (see `load-tests/k6.config.js`). `SEED_ROOM_ID`
defaults to `load-test-room`, matching `seed.ts`'s default.

## Interpreting output

k6 prints a summary at the end of each run: request counts, pass/fail per
`check()`, and whether each `thresholds` entry passed. A threshold failure
exits with a non-zero code — that's what fails the CI job. Key metrics:

- `http_req_duration` — request latency (p95 is what the thresholds target).
- `http_req_failed` — fraction of requests with a non-2xx/3xx status or a
  network error.
- `ws_connecting` / `ws_session_duration` — WebSocket handshake time and
  total connection lifetime.
- Custom counters (e.g. `rate_limited_responses` in `auth-ratelimit.js`)
  appear in the summary under their own name.

## Updating thresholds

If a scenario's threshold starts failing because of a deliberate
infrastructure or architecture change (e.g. moving to a smaller database
instance, adding a network hop), update the `thresholds` block in that
scenario file and note *why* in the commit message — a threshold is a
promise about acceptable latency, not an arbitrary number.

## Scenarios implemented

| Scenario | File | What it checks |
|----------|------|-----------------|
| Smoke (CI-safe, fast) | `smoke.js` | `/api/health` + `/api/ready`, 5 VUs / 30s |
| Paginated commit history | `scenarios/commits-api.js` | `GET /api/rooms/[id]/commits`, 50 VUs / 2min |
| WebSocket room join | `scenarios/ws-room.js` | `welcome`/`presence` handshake under concurrent joins, 20 VUs / 2min |
| Auth rate limiter | `scenarios/auth-ratelimit.js` | `/api/auth/forgot-password` actually returns 429 under a flood, 20 VUs / 1min |

**Not implemented** (scoped down from the proposal — see the P083 report's
Implementation Notes for why): export-PNG load test, room-at-capacity
(`MAX_CLIENTS_PER_ROOM`) test, and the 30-minute idle-connection soak test.
The `ws-room.js` scenario also does not send `draw-delta` messages over the
WebSocket, unlike the proposal's original design — verified against the
current server that client-initiated actions (draw, commit, cursor, etc.)
moved to REST POST endpoints; the WS connection today is a server → client
broadcast channel plus a narrow peer-relay path.
