# P088 – Database Read Replica and Connection Routing

## Status
Not Started

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
