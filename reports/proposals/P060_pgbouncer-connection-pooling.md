# P060 – Database Connection Pooling with PgBouncer

## Title
Add PgBouncer Transaction-Mode Connection Pooling to Prevent PostgreSQL Connection Exhaustion Under Load

## Brief Summary
Prisma opens a connection pool per process and does not share connections between server instances. In the current deployment, both the Next.js server and the custom WebSocket/HTTP server (`server.ts`) use the same `@prisma/adapter-pg` pool. Under load, each horizontal replica opens its own set of connections directly to PostgreSQL. PostgreSQL has a default `max_connections` of 100; with Redis pub/sub (P012), a multi-instance deployment could exhaust this limit at just 10–20 replicas. Adding PgBouncer in transaction-pooling mode as a sidecar or external service limits the total number of real PostgreSQL connections while allowing many more application-level "connections."

## Current Situation
`lib/db/prisma.ts` creates a Prisma client using `@prisma/adapter-pg`:
```typescript
// lib/db/prisma.ts (simplified)
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });
```
Each Node.js process keeps up to 10 idle PostgreSQL connections open at all times. With 5 horizontal replicas (P012 Redis pub/sub), this is 50 persistent connections. With Prisma's connection pool and peak bursts, this can spike to `5 × 10 = 50` at steady state, and higher during traffic bursts.

PostgreSQL's default `max_connections` is 100. Managed PostgreSQL services (Railway, Render, Supabase free tier) typically enforce limits of 20–25 connections on entry-level plans. The current architecture will hit this limit with as few as 3 replicas on a managed service.

### Relevant files
```
lib/db/prisma.ts           ← direct pg pool to PostgreSQL
docker-compose.yml         ← Postgres service, no PgBouncer
.env.example               ← DATABASE_URL points directly to PostgreSQL
```

## Problem with Current Situation
1. **Connection exhaustion with horizontal scaling**: Each replica maintains its own persistent pool. A modest 10-replica deployment with pool size 10 opens 100 connections simultaneously, hitting the PostgreSQL default limit.
2. **Managed service connection limits**: Cloud-hosted PostgreSQL plans (Supabase, Neon, Railway) impose hard limits (often 20–25 connections on free/starter plans). The application cannot be scaled horizontally without upgrading the database plan.
3. **Cold-start connection overhead**: Establishing a new PostgreSQL connection takes 20–50 ms (TLS handshake, authentication). Prisma's pool reuses connections, but on the first request after a cold start or after all connections are idle, this overhead is visible to the user.
4. **No connection observability**: There is no way to see how many connections are currently open, how many are idle, or what queries are waiting for a connection. PgBouncer exposes this via `SHOW POOLS` and `SHOW STATS` admin commands.

## Goal to Achieve
1. Deploy PgBouncer as a Docker Compose sidecar (for local development and production Compose deployments) that sits between the application and PostgreSQL.
2. Configure PgBouncer in **transaction-mode** pooling: the most efficient mode for Prisma (which does not use PostgreSQL session features like advisory locks or `LISTEN`/`NOTIFY` that require session-mode pooling).
3. Reduce the number of real PostgreSQL connections from `N_replicas × pool_size` to a fixed pool of 10–20 connections regardless of the number of application replicas.
4. Update `docker-compose.yml` and `.env.example` so `DATABASE_URL` points to PgBouncer's port instead of PostgreSQL directly.
5. Add a `DATABASE_POOL_SIZE` env var to allow operators to tune the Prisma-side pool size independently of the PgBouncer pool size.

## What Needs to Be Done

### 1. Add PgBouncer to `docker-compose.yml`
```yaml
pgbouncer:
  image: bitnami/pgbouncer:1.23.1
  environment:
    POSTGRESQL_HOST: postgres
    POSTGRESQL_PORT: 5432
    POSTGRESQL_DATABASE: sketchgit
    POSTGRESQL_USERNAME: postgres
    POSTGRESQL_PASSWORD: postgres
    PGBOUNCER_POOL_MODE: transaction
    # PGBOUNCER_MAX_CLIENT_CONN: max simultaneous application-side connections PgBouncer will accept.
    # PGBOUNCER_DEFAULT_POOL_SIZE: max real PostgreSQL server connections PgBouncer maintains.
    # Ratio: 200 client connections share 20 server connections (10:1).
    # A 50:1 or higher ratio can cause long queuing under sustained load;
    # tune based on observed p99 transaction duration and concurrency requirements.
    PGBOUNCER_MAX_CLIENT_CONN: 200
    PGBOUNCER_DEFAULT_POOL_SIZE: 20
    PGBOUNCER_SERVER_TLS_SSLMODE: disable  # internal Docker network; TLS between app and PgBouncer separately
  ports:
    - "5433:5432"
  depends_on:
    postgres:
      condition: service_healthy
```

### 2. Update `.env.example`
```dotenv
# PostgreSQL via PgBouncer (transaction pooling)
# In local Docker Compose, PgBouncer listens on port 5433
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/sketchgit?pgbouncer=true"
```
The `?pgbouncer=true` query parameter tells Prisma to disable prepared statement caching, which is incompatible with PgBouncer transaction mode (prepared statements are session-scoped; transaction mode changes the underlying connection between transactions).

### 3. Update `lib/db/prisma.ts` – reduce pool size
When PgBouncer is in the path, the application-side pool can be much smaller (even 1–2 connections per replica) because PgBouncer handles the multiplexing:
```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DATABASE_POOL_SIZE ?? '5', 10),
});
```

### 4. Add `DATABASE_POOL_SIZE` to `lib/env.ts`
```typescript
DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(5),
```
With PgBouncer: `DATABASE_POOL_SIZE=2` (PgBouncer multiplexes). Without PgBouncer: `DATABASE_POOL_SIZE=10` (keep existing default).

### 5. Update CI to include PgBouncer
In `.github/workflows/ci.yml`, add a PgBouncer service alongside the existing PostgreSQL service:
```yaml
pgbouncer:
  image: bitnami/pgbouncer:1.23.1
  env:
    POSTGRESQL_HOST: localhost
    POSTGRESQL_PORT: 5432
    POSTGRESQL_DATABASE: sketchgit_test
    POSTGRESQL_USERNAME: postgres
    POSTGRESQL_PASSWORD: postgres
    PGBOUNCER_POOL_MODE: transaction
    PGBOUNCER_MAX_CLIENT_CONN: 50   # 5:1 ratio vs pool size (adequate for CI)
    PGBOUNCER_DEFAULT_POOL_SIZE: 10
  ports:
    - "5433:5432"
```
Update `DATABASE_URL` in CI to use port 5433.

### 6. Document Prisma incompatibilities with transaction-mode pooling
The following Prisma features are **incompatible** with PgBouncer transaction-mode pooling:
- `prisma.$transaction([…])` with **interactive transactions** (sequential `await tx.xxx()` calls) — these require a session; use batch transactions (array form) or keep a direct `DATABASE_DIRECT_URL` for migrations and interactive transactions.
- `$queryRaw` with session-scoped PostgreSQL functions (`pg_advisory_lock`, `LISTEN`/`NOTIFY`) — not currently used in this codebase.

Prisma supports a separate `directUrl` for migrations that bypasses PgBouncer:
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")       // PgBouncer URL
  directUrl = env("DATABASE_DIRECT_URL") // Direct PostgreSQL URL (for migrations)
}
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `docker-compose.yml` | Add `pgbouncer` service |
| `.env.example` | Update `DATABASE_URL` to PgBouncer port; add `DATABASE_DIRECT_URL`; add `DATABASE_POOL_SIZE` |
| `prisma/schema.prisma` | Add `directUrl = env("DATABASE_DIRECT_URL")` to datasource |
| `lib/db/prisma.ts` | Read `DATABASE_POOL_SIZE` from env for pool `max` |
| `lib/env.ts` | Add `DATABASE_POOL_SIZE` and `DATABASE_DIRECT_URL` validation |
| `.github/workflows/ci.yml` | Add `pgbouncer` service; update `DATABASE_URL` to port 5433 |

## Additional Considerations

### Transaction-mode vs session-mode
PgBouncer's **session mode** assigns one server connection per client connection for the lifetime of the TCP session. This is compatible with all PostgreSQL features but provides little multiplexing benefit when clients hold connections for minutes at a time. **Transaction mode** is the recommended mode for web applications using an ORM, as it multiplexes many clients over a small pool of server connections within the duration of each transaction.

Current codebase assessment: all DB writes in `roomRepository.ts` use Prisma's batch transaction (array form: `prisma.$transaction([...operations])`), which is compatible with transaction-mode pooling. No interactive transactions (`prisma.$transaction(async (tx) => { ... })`) exist in the codebase today.

### Managed database services
Several managed PostgreSQL services (Supabase, Neon, PlanetScale-style serverless) include a built-in connection pooler. If the application is deployed on such a service, PgBouncer should not be added as a sidecar—instead, the service's pooler URL should be used as `DATABASE_URL` and the direct URL as `DATABASE_DIRECT_URL`.

### Monitoring PgBouncer
PgBouncer exposes an admin database on `port 6432` (or the same port with `SHOW POOLS;`). Adding PgBouncer monitoring to the `/api/health` endpoint (P023) would surface pool saturation before it becomes an outage.

## Testing Requirements
- Docker Compose `up` with PgBouncer starts without errors; the application connects and runs migrations.
- Prisma batch transactions complete successfully via PgBouncer.
- A load test with 50 concurrent connections through PgBouncer results in ≤ 20 real PostgreSQL connections.
- `DATABASE_POOL_SIZE=2` reduces Prisma's idle connection count as observed in `pg_stat_activity`.
- Migrations run via `DATABASE_DIRECT_URL` (bypassing PgBouncer) to avoid the prepared-statement incompatibility.

## Dependency Map
- Builds on: P003 ✅ (PostgreSQL + Prisma), P012 ✅ (horizontal scaling motivation)
- Complements: P023 ✅ (health check — PgBouncer stats can be surfaced there)
- Independent of: Redis, auth, Next.js build, WebSocket
