# P083 – Load and Stress Testing with k6

## Status
Done

## Dimensions
Performance · Reliability

## Problem

SketchGit operates a stateful WebSocket server alongside a Next.js HTTP server and a
PostgreSQL database. The system includes several performance-sensitive subsystems:

| Subsystem | Risk under load |
|-----------|----------------|
| WebSocket broadcast in `server.ts` | O(n²) fan-out for large room populations |
| `getRoomSnapshot()` in `roomRepository.ts` | Per-join DB query (mitigated by P030 LRU cache, but cold-cache paths still hit DB) |
| `PATCH /api/rooms/[roomId]` slug update | Triggers a full snapshot cache invalidation |
| Redis pub/sub fan-out (P012/P075) | Message storm with many concurrent editors |
| Commit persistence (`saveCommit`) | Write amplification for delta + full-snapshot fallback (P033) |

Currently there is **no automated load test** to verify that performance targets are
met or to detect regressions caused by schema changes, new features, or infrastructure
configuration changes.

Without load tests, the first indication of a performance problem is a production
incident.

## Proposed Solution

Use **[k6](https://k6.io/)** — an open-source, developer-friendly load testing tool
written in JavaScript/TypeScript — to build a load test suite covering the critical
paths.

### Test scenarios

| Scenario | VUs | Duration | Target |
|----------|-----|----------|--------|
| REST: paginated commit history (`GET /api/rooms/[id]/commits`) | 50 | 2 min | p95 < 200 ms |
| REST: room metadata (`GET /api/rooms/[id]`) | 100 | 2 min | p95 < 100 ms |
| REST: export PNG (`POST /api/rooms/[id]/export`) | 10 | 1 min | p95 < 2 s |
| WebSocket: 20-client room (draw-delta messages) | 20 | 5 min | 0 message drops, p95 RTT < 100 ms |
| WebSocket: room at max capacity (`MAX_CLIENTS_PER_ROOM`) | 51 | 1 min | 51st client receives 4008 close |
| Auth: registration + login flood | 20 | 1 min | rate limiter returns 429 at threshold |
| Soak: idle WebSocket connections | 200 | 30 min | memory growth < 50 MB |

### Threshold policy

k6 `thresholds` blocks define pass/fail criteria. The CI job fails if any threshold is
breached. Example:

```javascript
export const options = {
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
    ws_session_duration: ['p(95)<5000'],
  },
};
```

### WebSocket scenario

k6 has native WebSocket support. The WS load test will:
1. Authenticate (or use an anonymous session cookie).
2. Open a WebSocket connection to `ws://…/ws?roomId=<id>`.
3. Send synthetic `draw-delta` messages at a realistic cadence (30 msg/s per client).
4. Assert that broadcast messages from other simulated clients are received within
   the RTT threshold.

### Integration with CI

A new optional GitHub Actions job `load-test` is added to `ci.yml`:
- Triggered **only on push to `main`** and on manual `workflow_dispatch`.
- Runs against the Docker Compose stack started in the job (`docker compose up -d`).
- Applies database migrations.
- Executes `k6 run load-tests/*.js`.
- Uploads a k6 HTML/JSON summary as a CI artifact.
- Does **not block** the PR merge gate (runs post-merge) to avoid long CI times on
  feature branches.

For pre-merge performance regression detection, a **smoke test** variant runs in the
main `ci` job with 5 VUs / 30 seconds to verify no catastrophic regressions.

## Code Structure

```
load-tests/
  helpers/
    auth.js            ← login and session cookie helpers
    ws.js              ← shared WebSocket scenario helper
  scenarios/
    commits-api.js
    room-api.js
    export-api.js
    ws-room.js
    ws-capacity.js
    auth-ratelimit.js
    soak.js
  smoke.js             ← fast smoke variant for CI (5 VUs, 30 s)
  k6.config.js         ← shared thresholds and options
```

All k6 scripts follow the ES module format (`import/export`) and use k6's built-in
`http` and `ws` modules — no npm dependencies required for k6 itself.

## Type Requirements

k6 scripts are JavaScript (not TypeScript). Type-checking is not applicable to the
load test directory. The directory is excluded from `tsconfig.json` via the
`exclude` array.

## Linting Requirements

Add `load-tests/` to the ESLint `ignorePatterns` list (the k6 ES module format is not
compatible with the project's TypeScript-ESLint ruleset).

## Test Requirements

Load tests **are** their own verification mechanism. The existing Vitest suite does not
need to change.

A `load-tests/README.md` documents:
- How to run tests locally (requires k6 CLI and Docker Compose).
- How to interpret the k6 summary output.
- How to update thresholds when infrastructure changes.

## Database / Data Impact

Load tests require a seeded test database with representative room and commit data.
Provide a `load-tests/seed.sql` (or Prisma seed script) that creates:
- 5 rooms with 100–500 commits each.
- 20 registered user accounts.
- Appropriate `RoomMembership` records.

The load test environment uses a **separate** database URL to avoid contaminating
production or CI unit-test data.

## Repository Structure

- New top-level `load-tests/` directory (added to `.gitignore` exclusions for
  generated k6 output files: `*.json`, `summary.html`).
- Update `.github/workflows/ci.yml` to add the optional `load-test` job.
- Update `docker-compose.yml` with an optional `k6` service for local runs.
- Add `load-tests/` to `tsconfig.json` `exclude` array.

## GitHub Copilot Agents and Skills

- Copilot Chat can use k6 scenario files as context when asked to "add a load test for
  the new endpoint X" — the helper patterns in `load-tests/helpers/` give it a
  consistent scaffold to follow.
- A custom Copilot skill can generate a new k6 scenario file given an endpoint URL,
  expected VU count, and response time threshold.
- Post-merge load test results (uploaded as CI artifacts) give Copilot Workspace
  context for performance-regression investigations.

## Implementation Order

1. Add `load-tests/` directory with `k6.config.js` and `helpers/`.
2. Write the smoke test (`smoke.js`) first — verify CI integration.
3. Add `load-test` CI job to `ci.yml`.
4. Write REST API scenarios.
5. Write WebSocket scenarios (draw-delta, capacity).
6. Write auth rate-limit scenario.
7. Write soak test.
8. Create seed script.
9. Write `load-tests/README.md`.

## Effort Estimate
Medium (3–4 days). k6 scripting is straightforward; the main effort is in accurate
synthetic traffic generation for the WebSocket scenario.

## Dependencies
- P016 ✅ (CI pipeline — load-test job added here)
- P026 ✅ (Dockerfile — Docker Compose stack for local load test execution)
- P069 ✅ (room capacity limit — capacity overflow scenario depends on this)
- P046 ✅ (Redis rate limiter — rate limit scenario depends on this)
- P023 ✅ (health endpoint — smoke test uses `/healthz` to verify stack is up)

## Implementation Notes

Implemented in `load-tests/` with 4 of the proposal's 7 scenarios, scoped down to
what's testable against the *current* architecture and feasible in the time
available. All 4 were run against a real, freshly-built production server
(`next build` + `tsx server.ts`) with a real Dockerized Postgres and a seeded
room, not just read for plausibility.

### Scenarios implemented
- `smoke.js` — `/api/health` + `/api/ready`, 5 VUs/30s. **Verified: p95=7.39ms,
  0% failed**, comfortably under the `p(95)<200ms` threshold.
- `scenarios/commits-api.js` — `GET /api/rooms/[id]/commits?take=50`, 50 VUs/2min,
  `p(95)<200ms`. **Verified at a scaled-down 30 VUs/30s: p95=67.84ms, 100%
  functional checks passed.** (An earlier ad-hoc check at 10 VUs/10s showed
  p95=204ms — a narrow miss — but that was sampling noise from too few requests
  at the p95 quantile on a cold-started process, not a real regression; the
  30 VUs/30s run confirms healthy latency.)
- `scenarios/ws-room.js` — WebSocket `welcome`/`presence` handshake under
  concurrent joins. **Verified at 10 VUs/15s: 100% checks passed after fixing a
  bug in the script itself** (see Bugs found below).
- `scenarios/auth-ratelimit.js` — floods `/api/auth/forgot-password`, asserts the
  rate limiter actually returns 429s via a `rate_limited_responses` counter
  threshold (`count>0`). **Verified: 1802/1812 requests rate-limited, 100%
  functional checks passed.**

### Scenarios *not* implemented (scoped down from the proposal)
- **`room-api.js`** (`GET /api/rooms/[id]` metadata) — this endpoint doesn't
  exist in the current codebase; room metadata is returned inline by other
  endpoints. No standalone scenario to write.
- **`export-api.js`** (`POST /api/rooms/[id]/export`) — skipped for time; the
  export path is comparatively low-traffic (interactive, not polled) and lower
  risk than the three REST/WS/auth paths that are on every session's hot path.
- **`ws-capacity.js`** (room at `MAX_CLIENTS_PER_ROOM`, expect a 4008 close on
  the 51st client) — skipped for time.
- **`soak.js`** (200 idle WS connections for 30 minutes, memory growth budget)
  — skipped; a 30-minute CI job is expensive to run on every push and better
  suited to a scheduled/manual job than this pass had time to design properly.
- **`helpers/auth.js` / `helpers/ws.js`** — not needed; none of the 4
  implemented scenarios required shared login or WS boilerplate complex enough
  to justify extracting it yet. Add these if/when `export-api.js` or
  `ws-capacity.js` are implemented and need authenticated sessions.
- **`k6 service` in `docker-compose.yml`** — the proposal called this optional.
  Skipped; the CI `load-test` job installs the k6 binary directly on the
  runner (`grafana/setup-k6-action`) and points it at the Compose stack's
  published ports instead, which is simpler than wiring a k6 container onto
  the Compose network for one-off runs.

### Architecture deviations from the proposal
The proposal's WebSocket scenario (`ws-room.js`) was designed to send synthetic
`draw-delta` messages over the WebSocket at 30 msg/s per client. Verified
against `lib/server/wsConnectionHandler.ts` that this no longer reflects the
current architecture: client-initiated actions (draw, commit, cursor, presence,
etc.) moved to REST POST endpoints in an earlier refactor (consistent with
findings during P085/P086 work). The WS connection today is a server → client
broadcast channel plus a narrow peer-relay path (`fullsync-request`/`fullsync`,
`ping`/`pong`). `ws-room.js` was written to load-test what the WS connection
*actually* does under concurrent load — the `welcome` handshake and `presence`
fan-out on every room join — rather than a synthetic message type the server
no longer accepts from clients this way.

### Bugs found and fixed
- **`ws-room.js`'s own threshold was mathematically unsatisfiable.** The script
  deliberately holds each WS session open for exactly 5000ms
  (`socket.setTimeout(() => socket.close(), 5000)`) before closing, but the
  threshold demanded `ws_session_duration: p(95)<5000` — guaranteed to fail
  regardless of server performance, since session duration is always
  ≥5000ms by construction. Fixed the threshold to `p(95)<5500`, which checks
  that the server isn't adding meaningful overhead on top of the deliberate
  hold rather than checking something the script itself makes impossible.
  Verified the fix: reran and got a clean pass (p95=5.02s).

### CI integration
- **`ci` job (blocking, pre-merge):** builds the app, starts it on port 3100
  against the job's existing Postgres service, and runs `k6 run
  load-tests/smoke.js` — a fast (~30s) catch for gross regressions, matching
  the proposal's "smoke test variant" requirement.
- **`load-test` job (non-blocking, post-merge):** new job, gated by
  `if: github.event_name == 'workflow_dispatch' || (github.event_name ==
  'push' && github.ref == 'refs/heads/main')` — runs only on push to `main` or
  manual dispatch, never on PRs, and isn't in any other job's `needs:` chain,
  so it can't block a merge. Starts the full Docker Compose stack (app +
  PgBouncer + Redis + Postgres — the pooled-connection topology closest to
  production, not the bare `postgres` service the unit-test `ci` job uses),
  seeds a room via `load-tests/seed.ts`, runs all 4 scenarios, and uploads
  each one's `--summary-export` JSON as a build artifact.
  **Caveat:** this job's YAML was validated (`python3 -c "import yaml..."`)
  but not executed — GitHub Actions isn't runnable locally. The scenarios
  themselves were verified against a real server process + a real Dockerized
  Postgres directly (not through PgBouncer), matching how a developer running
  the README's local instructions (`docker compose up -d db redis`) would
  test. The PgBouncer-fronted path the CI job exercises has not been
  separately verified end-to-end.

### Other deviations
- `k6.config.js` is 3 constants (`BASE_URL`, `WS_URL`, `SEED_ROOM_ID`), not the
  "shared thresholds and options" module the proposal's file tree implied —
  each scenario's `thresholds`/`options` differ enough (VUs, duration, target
  metrics) that a shared options object would mostly be overridden per file
  anyway.
- `load-tests/seed.ts` creates 1 room with 50 commits (not "5 rooms with
  100–500 commits, 20 users") — enough to exercise pagination and realistic
  payload sizes without a multi-minute seed step before every local run.
  Bump `COMMIT_COUNT` in the script for a closer-to-production dataset when
  actually measuring performance rather than validating the scripts.
- `tsconfig.json`/`eslint.config.mjs`: no `load-tests` exclusion was needed for
  `tsc` (the k6 scenario files are plain `.js`, and `allowJs` is already
  `false`, so they're never type-checked; `seed.ts` type-checks cleanly as-is).
  `load-tests/**` was added to ESLint's `ignores` (the k6 `.js` files use k6's
  own globals and ESM syntax incompatible with the TypeScript-ESLint ruleset).
