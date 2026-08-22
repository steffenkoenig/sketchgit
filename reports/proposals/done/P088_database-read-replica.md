# P088 – Database Read Replica and Connection Routing

## Status
Done

## Dimensions
Performance · Reliability · Scalability

## Problem

All database queries in SketchGit — both reads and writes — are routed through a
**single PostgreSQL primary connection** (via the Prisma client singleton in
`lib/db/prisma.ts`). Under normal collaborative load, this is acceptable. However
several read-heavy workloads compete directly with write-critical paths:

| Read-heavy workload | Write-critical path competing for connections |
|--------------------|----------------------------------------------|
| `GET /api/rooms/[id]/commits` — paginated full history | `saveCommit()` — per-keystroke delta writes |
| `GET /api/rooms/[id]/events` — activity feed pagination | `appendRoomEvent()` — per-action audit writes |
| `GET /api/docs/openapi.json` — OpenAPI spec generation | `createUser()` registration flow |
| `getRoomSnapshot()` on reconnect (cache miss) | `pruneInactiveRooms()` bulk deletes |
| `checkRoomAccess()` on every WS upgrade | `resetPassword()` token writes |

As the number of concurrent rooms and users grows, long-running read queries can
block or delay write transactions on the single primary, increasing p99 latency for
commit persistence and user authentication.

PgBouncer connection pooling (P060) reduces **connection overhead** but does not
separate read and write traffic. A read replica is the standard solution.

## Proposed Solution

Add support for an optional **PostgreSQL read replica** with connection routing at
the repository layer.

### Architecture

```
Application
    │
    ├── prismaWrite  ─→ Primary (read-write)
    └── prismaRead   ─→ Replica (read-only, async replication lag ≤ 100 ms)
```

When `DATABASE_URL_REPLICA` is not set, `prismaRead` falls back to `prismaWrite`
(single-node mode — preserves backward compatibility).

### Implementation

#### 1. Two Prisma client instances

In `lib/db/prisma.ts`:
- `prismaWrite`: existing client, connected to `DATABASE_URL` (primary).
- `prismaRead`: new client, connected to `DATABASE_URL_REPLICA` (replica) or
  falls back to `DATABASE_URL` if the replica URL is not set.

Both clients use the same `@prisma/adapter-pg` with the same pool configuration.
The read client uses a **smaller** connection pool (default: half of the write pool
size) since replica connections are cheaper to restart.

#### 2. Repository-layer routing convention

Each repository function declares its intent:

- Functions that **only read** use `prismaRead`.
- Functions that **write or require read-your-writes** use `prismaWrite`.
- Functions that **read immediately after writing** (e.g. `createUser()` then return
  the created user) use `prismaWrite` for both operations.

```typescript
// Read-only → replica
export async function getRoomSnapshot(roomId: string) {
  return prismaRead.commit.findMany({ … });
}

// Write → primary
export async function saveCommit(data: CommitData) {
  return prismaWrite.commit.create({ … });
}
```

#### 3. Routing table

| Repository function | Client | Rationale |
|--------------------|--------|-----------|
| `ensureRoom` | `prismaWrite` | Creates room on first access |
| `getRoomSnapshot` | `prismaRead` | Pure read; stale-OK (cache refreshed by commits) |
| `saveCommit` | `prismaWrite` | Write path |
| `checkRoomAccess` | `prismaRead` | Read-only; replication lag < typical WS upgrade delay |
| `listCommits` (paginated) | `prismaRead` | Read-only |
| `appendRoomEvent` | `prismaWrite` | Write path |
| `listRoomEvents` | `prismaRead` | Read-only |
| `createUser` | `prismaWrite` | Write; read-your-writes |
| `verifyCredentials` | `prismaRead` | Read-only; timing-safe (P054) |
| `createPasswordResetToken` | `prismaWrite` | Write path |
| `resetPassword` | `prismaWrite` | Write + immediate read |
| `pruneInactiveRooms` | `prismaWrite` | Bulk delete |

#### 4. New environment variables

Add to `lib/env.ts`:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL_REPLICA` | Read replica connection string | `""` (falls back to `DATABASE_URL`) |
| `DB_REPLICA_POOL_SIZE` | Replica connection pool size | `5` |

#### 5. Health check integration

Extend the `/healthz` endpoint (P023) to report replica connectivity:

```json
{
  "status": "ok",
  "db": "ok",
  "dbReplica": "ok"
}
```

If the replica is degraded, `dbReplica` reports `"degraded"` and the application
**continues serving** (all reads fall back to primary) — the health check reports
degraded but not unhealthy.

### Replication lag consideration

Read-your-writes consistency is **not** required for most read paths in SketchGit.
The LRU snapshot cache (P030) already accepts a bounded staleness window. The only
paths where stale reads are unacceptable are:
- `verifyCredentials` after `createUser` (handled by keeping both on `prismaWrite` if
  called in the same request).
- `consumeInvitation` (use-count decrement + re-read — must use `prismaWrite`).

## Code Structure

```
lib/db/
  prisma.ts              ← exports prismaWrite and prismaRead (+ backward-compat prisma alias)
  roomRepository.ts      ← updated routing (see table above)
  userRepository.ts      ← updated routing
  prisma.test.ts         ← updated mocks for both clients
```

## Type Requirements

- Both `prismaWrite` and `prismaRead` are typed as `PrismaClient` — no new type aliases needed.
- The backward-compatible `prisma` export (for existing tests) should be an alias for
  `prismaWrite` so no existing tests break.

## Linting Requirements

No new ESLint rules required. A custom ESLint rule to enforce the routing convention
(warn when a known read-only function uses `prismaWrite`) is **out of scope** but noted
as a future improvement.

## Test Requirements

- All existing tests mock `prisma` from `lib/db/prisma.ts`. After this change, tests
  that import `prismaRead` must also mock it.
- Update `lib/test/setup.ts` to mock both `prismaWrite` and `prismaRead`.
- Add tests for `prisma.ts` verifying that:
  - When `DATABASE_URL_REPLICA` is unset, `prismaRead === prismaWrite`.
  - When `DATABASE_URL_REPLICA` is set, `prismaRead` uses the replica URL.
- Add integration test (CI with replica service) to verify read operations succeed
  against the replica.

## Database / Data Impact

- No schema changes.
- A replica is provisioned externally (managed PostgreSQL service, or
  `docker-compose.yml` extended with a `db-replica` service for local development).
- Update `docker-compose.yml` to add an optional `db-replica` service (PostgreSQL
  streaming replication via `pg_basebackup` or a simplified hot-standby config).

## Repository Structure

- Update `lib/db/prisma.ts` to export two clients.
- Update `lib/db/roomRepository.ts` and `lib/db/userRepository.ts` with routing.
- Update `lib/env.ts` for new vars.
- Update `lib/env.test.ts`.
- Update `.env.example`.
- Update `docker-compose.yml` (optional replica service).
- Update `README.md` with replica setup instructions.

## GitHub Copilot Agents and Skills

- The routing table above can be referenced by Copilot Chat when writing new
  repository functions: "should this new function use `prismaRead` or `prismaWrite`?"
- A custom `new-repository-function` Copilot skill (see P086) should ask whether
  the function is read-only and emit the correct client reference.

## Implementation Order

1. Add `DATABASE_URL_REPLICA` to `lib/env.ts` and `.env.example`.
2. Update `lib/db/prisma.ts` to create `prismaRead`.
3. Update `lib/test/setup.ts` and `lib/db/prisma.test.ts`.
4. Update repository functions per the routing table.
5. Update the health check endpoint.
6. Update `docker-compose.yml` with optional replica service.
7. Update `README.md`.

## Effort Estimate
Medium (2–3 days). The Prisma client duplication is trivial; the main work is
auditing every repository function and ensuring tests mock both clients correctly.

## Dependencies
- P003 ✅ (Prisma established — both clients use the same schema)
- P060 (PgBouncer — pooling should be configured for both primary and replica)
- P023 ✅ (health check — extended with replica status)
- P030 ✅ (LRU cache — replica replication lag is acceptable due to the cache TTL)

## Implementation Notes

Implemented largely as designed — dual Prisma clients with fallback routing,
env vars, health check integration, per-function routing across all three
repository files, and a resilience mechanism the proposal didn't originally
specify but that live testing showed was necessary. All verified against
real infrastructure (two independent Dockerized Postgres instances, seeded
with distinguishable sentinel data, hit through a real production build),
not just unit tests.

### Core implementation
- `lib/db/prisma.ts` — exports `prismaWrite` (primary), `prismaRead`
  (routes to `DATABASE_URL_REPLICA` when set, else literally `=== prismaWrite`
  — no second connection pool opened in the common single-node case), and
  `prisma` (unchanged alias for `prismaWrite`, so no existing call site or
  test needed to change just to keep working).
- `lib/env.ts` — added `DATABASE_URL_REPLICA` (optional URL) and
  `DB_REPLICA_POOL_SIZE` (default 5), plus tests in `lib/env.test.ts`.
- `lib/db/roomRepository.ts`, `lib/db/userRepository.ts`,
  `lib/db/featureFlagRepository.ts` — every exported function routed to
  `prismaRead` or `prismaWrite` per a read/write classification (not just the
  proposal's original routing table, which only covered `roomRepository.ts`).
  Rule applied: a function that only reads → `prismaRead`; a function that
  writes, or reads immediately before/after a write in the same call, →
  `prismaWrite` for its *entire* body (not just the write call) — e.g.
  `setRoomMemberRole` reads the existing role and owner count before writing,
  and both stay on `prismaWrite` to avoid a stale read racing the write it
  gates. `verifyCredentials` is the one deliberately mixed function: its
  login-critical lookup uses `prismaRead` (timing-safe per P054, replication
  lag is harmless — a stale-miss just runs the constant-time dummy-hash path,
  same as a genuinely unregistered email), while its non-blocking background
  bcrypt→Argon2id re-hash write uses `prismaWrite` (matches the proposal's
  own routing table exactly).
- `lib/auth.ts` — no changes needed; `PrismaAdapter(prisma)` keeps using the
  unchanged `prisma` alias, correct since the NextAuth adapter both reads and
  writes (OAuth account linking, session/user creation).
- `server.ts` / `lib/server/wsConnectionHandler.ts` — server.ts maintains its
  *own* independent `PrismaClient` instance (a pre-existing architectural
  fact, not something this proposal changed) rather than importing
  `lib/db/prisma.ts`'s singleton, so it needed its own parallel replica
  client (`prismaReplica`, falling back to `prisma` when unset, same rule).
  `ConnectionHandlerDeps` gained a `prismaRead` field; the WS reconnect
  snapshot-load path (`dbLoadSnapshot`, explicitly named in the proposal's
  Problem table as a read-heavy path) now uses it. `authorizeClient`
  (invitation-token consumption + membership upsert) stays on the write
  client — it reads then writes in the same call.

### Health check (P023 extension)
`/api/health` now reports `dbReplica: "ok" | "degraded"` alongside the
existing `database` field, checked independently via `checkDbHealth`. A
degraded replica does not flip the endpoint's overall `status` — matches the
proposal's "continues serving, not unhealthy" requirement. Verified live:
stopping the replica container flips `dbReplica` to `"degraded"` within one
health-check cycle; restarting it flips back to `"ok"`.

### Bug found via live verification: replica-outage fallback didn't fall back
The proposal's health-check section says a degraded replica should mean
"reads fall back to primary" — I initially read this as just describing what
"unset `DATABASE_URL_REPLICA`" already does, but a replica that goes *down
after being configured* needed the same behavior at the connection level,
which the proposal didn't specify a mechanism for. Implemented
`wrapWithReadFallback()` in `lib/db/prisma.ts`: a `Proxy` around the read
client that catches replica-connectivity errors on any query and
transparently retries against the primary, while leaving genuine query/logic
errors (bad input, constraint violations) to propagate normally — retrying
those against the primary would just fail the same way. Reused in
`server.ts` for `prismaReplicaRead` so both DB-access paths in the app get
identical resilience (the raw, unwrapped `prismaReplica` is kept separately
for the health check itself, since wrapping *that* would mask real replica
outages by silently succeeding against the primary).

Building and verifying this caught two real bugs before they could reach
production, found only by actually killing the replica container mid-test
rather than trusting the design on paper:
1. **Wrong error-shape assumption.** This app uses `@prisma/adapter-pg` (the
   driver-adapter pattern), not Prisma's traditional binary query engine, so
   connectivity failures do *not* surface as Prisma's classic P1001/P1002
   engine codes — they come through as a `PrismaClientKnownRequestError`
   wrapping the underlying `node-postgres` driver's own error code (verified
   empirically: killing the replica produced `code: "ECONNREFUSED"` at the
   top level of the thrown error). `isReplicaConnectionError()` checks both:
   the driver-level codes (`ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`,
   `ENOTFOUND`, `EHOSTUNREACH`) that this adapter actually produces, and
   Prisma's own P1xxx codes / `PrismaClientInitializationError` for
   robustness against a future Prisma version or different adapter.
2. **Prisma's query methods don't return real `Promise` instances.** The
   fallback wrapper's first version checked `result instanceof Promise`
   before attaching a `.catch()` — which is always `false` for Prisma's
   return value (verified empirically: `client.room.findUnique(...)
   instanceof Promise` is `false`, `constructor.name` is `"Object"`, but
   `.then`/`.catch` both exist — it's a lazy thenable, not a native Promise).
   The `instanceof Promise` check silently skipped attaching the fallback
   handler entirely, so the original design would have thrown a 500 on every
   read the instant the replica became unreachable — the opposite of the
   resilience it was meant to provide. Fixed by duck-typing on `.catch`
   instead. Live-verified after the fix: killing the replica mid-session,
   the commits endpoint kept serving (from the primary) with no error.

### Docker Compose replica service — explicitly NOT real replication
Added an optional `db-replica` service (`postgres:16-alpine`, port 5434) for
locally exercising the `DATABASE_URL_REPLICA` connection-routing code path.
This is **not** streaming replication — it's a second, independent, empty
Postgres instance, not a hot standby fed from the primary's WAL. Genuine
physical replication needs `pg_basebackup`/`pg_hba.conf`/replication-slot
configuration well beyond a docker-compose service block; that's out of
scope here. For real replica behavior, point `DATABASE_URL_REPLICA` at a
managed read replica (RDS, Cloud SQL, etc.) — the application-side routing
and fallback logic works identically either way, which is exactly what this
proposal's own local verification proved: seeded distinguishable sentinel
commits into the primary and the compose `db-replica`, confirmed the app
genuinely read from whichever one `DATABASE_URL_REPLICA` pointed at (not
just "the code compiles and unit tests mock it"), then killed the replica
container and confirmed reads kept working via the primary.

### Test changes
9 test files that mock `@/lib/db/prisma` (`lib/db/{room,user,featureFlag}Repository.test.ts`
plus 6 API route tests) were updated so the mock module exports
`prismaRead`/`prismaWrite` as the *same object reference* as `prisma` — this
matches the real no-replica-configured default (`prismaRead === prismaWrite`)
and meant zero test assertions needed to change, since `prisma.x` and
`prismaRead.x`/`prismaWrite.x` are literally the same mock function either
way. Added `lib/db/prisma.test.ts` coverage for `resolveReadConnectionString`
and `isReplicaConnectionError` (pure functions, tested without a real
PrismaClient — consistent with this file's existing P071 testing approach).
