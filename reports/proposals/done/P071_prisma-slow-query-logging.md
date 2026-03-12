# P071 – Prisma Slow-Query Logging and Duration Alerting

## Title
Enable Prisma Query Event Instrumentation to Detect Slow Queries, Log Query Durations, and Surface N+1 Patterns in Development and Production

## Brief Summary
Prisma supports query event logging via `log: [{ level: 'query', emit: 'event' }]` and exposes a `$on('query', callback)` handler that fires after every database query with its SQL text, parameters, and execution duration. Currently `lib/db/prisma.ts` only enables `'warn'` and `'error'` log levels, so slow queries and N+1 patterns are invisible at runtime. Adding a configurable slow-query threshold (`SLOW_QUERY_MS` env var, default 500 ms) and a log-all-queries development mode (`LOG_QUERIES=true`) provides actionable performance data without requiring external APM tooling.

## Current Situation
```typescript
// lib/db/prisma.ts (relevant section)
return new PrismaClient({
  adapter,
  log:
    process.env.NODE_ENV === "development"
      ? ["warn", "error"]
      : ["error"],
});
```
In development, `warn` and `error` levels are active. In production, only `error` level is active. Prisma emits `warn` for deprecated API usage; it does not emit `warn` for slow queries. The `query` log level (which captures execution time) is never enabled.

### What is missed
- A Prisma `$transaction([...])` that issues 15 sequential queries to reconstruct delta commit chains (P033) runs invisibly—no duration is logged.
- A route handler that fetches `commits` and then separately fetches `branches` (potential N+1) leaves no trace in logs.
- The 99th-percentile query latency is unknown without external instrumentation (P061 OpenTelemetry, which is also a proposal but requires more infrastructure).

### Relevant files
```
lib/db/prisma.ts          ← PrismaClient creation, log config
lib/db/roomRepository.ts  ← all Prisma queries; no duration tracking
server.ts                 ← uses prisma directly for snapshot queries
```

## Problem with Current Situation
1. **Invisible slow queries in production**: A query that takes 5 seconds does not appear in logs unless it throws an error. Operators cannot distinguish between a network outage and a slow query.
2. **N+1 patterns undetected**: During development, no tooling warns when 100 queries are executed for a single room load. The delta chain replay (P033) uses a loop of `findFirst` calls whose total query count grows with commit history depth.
3. **No query count monitoring**: There is no per-request query count metric. A single API call could issue 200 queries without any warning.
4. **Missed optimization opportunities**: Without query duration data, it is impossible to prioritize index additions or query rewrites based on actual impact.

## Goal to Achieve
1. Enable Prisma query event instrumentation in `lib/db/prisma.ts`.
2. Log queries that exceed `SLOW_QUERY_MS` at `warn` level with SQL text (truncated), duration, and a stack trace hint.
3. In development (when `LOG_QUERIES=true`), log every query at `debug` level for N+1 detection.
4. Add a per-request query counter that can be exposed via OpenTelemetry (P061) or the health endpoint.
5. Keep the overhead negligible in production: the `query` event handler only runs the slow-query threshold check, which is a simple integer comparison.

## What Needs to Be Done

### 1. Add `SLOW_QUERY_MS` and `LOG_QUERIES` to `lib/env.ts`
```typescript
// Duration in milliseconds above which a query is logged as slow (default: 500 ms).
SLOW_QUERY_MS: z.coerce.number().int().min(0).default(500),
// Log all queries in development when set to "true" (default: false).
LOG_QUERIES: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
```

### 2. Update `lib/db/prisma.ts` to enable query events
```typescript
function createPrismaClient(): PrismaClient {
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://placeholder@placeholder/placeholder";
  const adapter = new PrismaPg({ connectionString });

  // Always include 'query' emit: 'event' so we can attach a runtime slow-query
  // listener. The 'query' stdout level is NOT enabled (it would log to stdout
  // for every query, which is too verbose in production). The event emitter
  // allows selective logging based on duration threshold.
  const client = new PrismaClient({
    adapter,
    log: [
      { level: 'warn',  emit: 'stdout' },
      { level: 'error', emit: 'stdout' },
      { level: 'query', emit: 'event' }, // ← enables $on('query', …)
    ],
  });

  const slowQueryMs = parseInt(process.env.SLOW_QUERY_MS ?? '500', 10);
  const logAllQueries = process.env.LOG_QUERIES === 'true';

  client.$on('query', (event) => {
    const duration = event.duration; // milliseconds, provided by Prisma

    if (logAllQueries) {
      // Development: log every query for N+1 detection
      console.debug(`[prisma:query] ${event.query.slice(0, 200)} (${duration}ms)`);
    } else if (duration > slowQueryMs) {
      // Production: log only slow queries
      console.warn(`[prisma:slow-query] ${duration}ms — ${event.query.slice(0, 200)}`);
    }
  });

  return client;
}
```

> **Note**: Use the `logger` from `pino` (server-side) rather than `console.warn/debug` once `lib/db/prisma.ts` has access to the Pino instance. For the initial implementation, `console.warn` is acceptable since Prisma client creation is server-side. A follow-up can replace it with a shared Pino logger.

### 3. Add per-request query counter (optional enhancement)
```typescript
let queryCount = 0;

client.$on('query', (event) => {
  queryCount++;
  // … slow-query check from above …
});

export function resetQueryCount(): void { queryCount = 0; }
export function getQueryCount(): number { return queryCount; }
```
This counter can be included in the `/api/health` response or in API route response headers (e.g., `X-DB-Query-Count: 3`) for development debugging.

### 4. Add a slow-query test
In `lib/db/prisma.test.ts` (create if it doesn't exist), verify that the slow-query callback fires for queries exceeding the threshold by creating a mock Prisma client and emitting a query event with a high duration.

### 5. Update `.env.example`
```dotenv
# Prisma slow query threshold in milliseconds (default: 500).
# Queries slower than this are logged as WARN. Set to 0 to log all queries.
# SLOW_QUERY_MS=500

# Log all Prisma queries (development only).
# LOG_QUERIES=true
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `lib/db/prisma.ts` | Add `log: [{ level: 'query', emit: 'event' }]` and `$on('query', …)` handler |
| `lib/env.ts` | Add `SLOW_QUERY_MS` and `LOG_QUERIES` env vars |
| `.env.example` | Document `SLOW_QUERY_MS` and `LOG_QUERIES` |
| `lib/db/prisma.test.ts` | New or updated tests for slow-query callback |

## Additional Considerations

### Performance overhead
The `query` event with `emit: 'event'` adds approximately 50–100 μs per query (the cost of emitting a JavaScript event and running the callback). For an application executing 10–50 queries per request, this is 500 μs–5 ms of overhead—well within acceptable bounds and lower than any single network round-trip.

### Prisma event data
The `QueryEvent` object contains:
- `query`: the raw SQL string (parameterized)
- `params`: query parameters as a JSON string
- `duration`: execution time in milliseconds
- `target`: the Prisma model name

The `params` field should not be logged in production (may contain user data). Only `query` (truncated) and `duration` are logged.

### Interaction with P061 (OpenTelemetry)
P061 proposes `@opentelemetry/instrumentation-pg` for automatic database span creation. Both approaches can coexist: Prisma's `$on('query')` provides application-level slow-query alerting, while OTEL provides distributed tracing. They do not conflict. If P061 is implemented, the Prisma event handler can be simplified to only alert on extremely slow queries (> 2× the `SLOW_QUERY_MS` threshold) since OTEL handles routine query duration tracking.

### N+1 detection in development
The delta replay loop in `roomRepository.ts` (`resolveCanvas()`) calls `prisma.commit.findFirst` in a `while` loop. With `LOG_QUERIES=true`, this would log each iteration, revealing the per-commit query count. A comment near the loop should note the expected query count for a given chain depth:
```typescript
// Expected: O(depth) queries (one per commit in the delta chain).
// With depth <= MAX_CHAIN_DEPTH (10,000), this is the intended behavior.
// See P033 for the design rationale.
```

## Testing Requirements
- `createPrismaClient()` does not throw when `SLOW_QUERY_MS` is set to a valid number.
- The `$on('query', …)` callback fires with `event.duration` when a query event is emitted.
- When `event.duration > SLOW_QUERY_MS`, a warning is logged.
- When `LOG_QUERIES=true`, all queries are logged at debug level regardless of duration.
- When `event.duration <= SLOW_QUERY_MS` and `LOG_QUERIES` is not set, no log line is emitted.

## Dependency Map
- Builds on: P003 ✅ (Prisma established), P011 ✅ (DB performance — slow queries indicate missing indices)
- Complements: P061 (OpenTelemetry — P071 is a simpler, Prisma-native alternative; P061 adds distributed tracing on top), P033 ✅ (delta chain — loop query count can be detected)
- Independent of: Redis, WebSocket, Next.js build
