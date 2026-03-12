# P083 – Load and Stress Testing with k6

## Status
Not Started

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
