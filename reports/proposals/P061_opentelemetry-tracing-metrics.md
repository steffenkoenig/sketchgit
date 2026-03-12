# P061 – OpenTelemetry Distributed Tracing and Metrics

## Title
Instrument the Application with OpenTelemetry to Enable Distributed Tracing, Metrics, and Latency Profiling Across HTTP, WebSocket, and Database Layers

## Brief Summary
The application currently uses Pino structured logging (P010) for observability, but has no tracing or metrics instrumentation. When a slow commit-save request is reported, there is no way to determine whether the latency came from the database, from WebSocket fan-out, or from the Next.js rendering layer. Adding OpenTelemetry (OTEL) SDK traces and metrics provides end-to-end request visibility, quantifiable latency percentiles per endpoint, and alertable error rates—all exportable to any OTLP-compatible backend (Jaeger, Grafana Tempo, Honeycomb, Datadog, etc.) without vendor lock-in.

## Current Situation
Observability is limited to:
- **Pino logs** in `server.ts` and API route handlers: structured text, useful for debugging individual requests but cannot answer "what is the p99 latency of `saveCommit` over the last 24 hours?"
- **No metrics**: there is no counter for WebSocket connections, no histogram for DB query duration, no gauge for in-memory room count.
- **No traces**: it is impossible to correlate an incoming HTTP request with the downstream Prisma DB call, cache lookup, or Redis pub/sub publish that it triggered.

### Relevant files
```
server.ts              ← HTTP + WebSocket server; no OTEL spans
lib/db/roomRepository.ts ← all Prisma queries; no instrumentation
lib/cache/roomSnapshotCache.ts ← LRU cache; no metrics
lib/redis.ts           ← ioredis client; no instrumentation
app/api/**/*.ts        ← Next.js API routes; no spans
```

## Problem with Current Situation
1. **No latency percentiles**: Pino logs individual request durations but there is no aggregation. It is impossible to know if the 99th percentile of `GET /api/rooms/:id/commits` is 200 ms or 2 s.
2. **No error rate visibility**: Errors are logged individually. There is no alarm that fires when `saveCommit` starts failing at a rate > 1%.
3. **No correlation between layers**: A slow WebSocket `commit` message handler involves DB write + Redis publish + WebSocket fan-out. Without traces, each is logged in isolation with no correlation ID linking them.
4. **No capacity planning data**: There are no metrics for `active_websocket_connections`, `room_snapshot_cache_hit_rate`, or `db_query_duration_p99`. Capacity decisions are made by guesswork.
5. **Vendor lock-in risk if delayed**: Adding proprietary instrumentation (e.g., Datadog APM agent) later couples the codebase to a specific vendor. OpenTelemetry provides a standard API so the exporter backend can be swapped without code changes.

## Goal to Achieve
1. Add the OpenTelemetry Node.js SDK (`@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`) to the project.
2. Auto-instrument HTTP (`node:http`), PostgreSQL (`pg` via `@opentelemetry/instrumentation-pg`), and Redis (`ioredis` via `@opentelemetry/instrumentation-ioredis`) without manual span creation in most cases.
3. Add manual spans for WebSocket message processing and LRU cache operations (which are not auto-instrumented).
4. Export traces and metrics to an OTLP endpoint (configurable via `OTEL_EXPORTER_OTLP_ENDPOINT` env var); default to a no-op exporter when the variable is not set, so the feature is opt-in for local development.
5. Add key custom metrics:
   - `sketchgit.ws.connections` (gauge): current number of active WebSocket connections.
   - `sketchgit.ws.messages` (counter): messages received, labeled by `type`.
   - `sketchgit.room.snapshot_cache_hits` / `_misses` (counters).
   - `sketchgit.db.save_commit_duration` (histogram): end-to-end `saveCommit` duration.

## What Needs to Be Done

### 1. Install OTEL packages
```bash
npm install \
  @opentelemetry/sdk-node \
  @opentelemetry/api \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http \
  @opentelemetry/instrumentation-pg \
  @opentelemetry/instrumentation-ioredis
```

### 2. Create `lib/telemetry.ts`
```typescript
/**
 * OpenTelemetry SDK initialization.
 *
 * Call `initTelemetry()` once at process start, before any other imports.
 * If OTEL_EXPORTER_OTLP_ENDPOINT is not set, a no-op SDK is used (zero overhead).
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

let sdk: NodeSDK | null = null;

export function initTelemetry(serviceName = 'sketchgit'): void {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    // Log explicitly so operators know telemetry is off and can detect typos
    // in the environment variable name before assuming it is silently failing.
    console.info('[telemetry] OpenTelemetry disabled: OTEL_EXPORTER_OTLP_ENDPOINT is not set');
    return;
  }

  sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 10_000,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk) await sdk.shutdown();
}
```

### 3. Initialize OTEL in `server.ts`
```typescript
// Must be the FIRST import in server.ts
import { initTelemetry, shutdownTelemetry } from './lib/telemetry';
initTelemetry();
```

### 4. Add manual WebSocket spans
In `server.ts`, wrap each WebSocket message handler in an OTEL span:
```typescript
import { trace } from '@opentelemetry/api';
const tracer = trace.getTracer('sketchgit-ws');

wss.on('message', (ws, rawData) => {
  const span = tracer.startSpan(`ws.message.${message.type}`);
  try {
    // existing handler logic
  } finally {
    span.end();
  }
});
```

### 5. Add custom metrics
Create `lib/server/metrics.ts`:
```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('sketchgit');

export const wsConnectionGauge = meter.createObservableGauge('sketchgit.ws.connections', {
  description: 'Number of active WebSocket connections',
});

export const wsMessageCounter = meter.createCounter('sketchgit.ws.messages', {
  description: 'WebSocket messages received',
});

export const cacheHitCounter = meter.createCounter('sketchgit.room.snapshot_cache_hits');
export const cacheMissCounter = meter.createCounter('sketchgit.room.snapshot_cache_misses');

export const saveCommitHistogram = meter.createHistogram('sketchgit.db.save_commit_duration', {
  description: 'Duration of saveCommit DB operation in milliseconds',
  unit: 'ms',
});
```

### 6. Add `OTEL_EXPORTER_OTLP_ENDPOINT` to `lib/env.ts`
```typescript
OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
OTEL_SERVICE_NAME: z.string().default('sketchgit'),
```

### 7. Add Jaeger to `docker-compose.yml` (optional dev dependency)
```yaml
jaeger:
  image: jaegertracing/all-in-one:1.57
  ports:
    - "16686:16686"  # Jaeger UI
    - "4318:4318"    # OTLP HTTP
  environment:
    COLLECTOR_OTLP_ENABLED: "true"
```
Set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` in `.env` for local development.

### 8. Shutdown hook
In `server.ts` graceful shutdown handler, call `await shutdownTelemetry()` after draining WebSocket connections so the final span batch is flushed before the process exits.

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `package.json` | Add OTEL SDK and exporter packages |
| `lib/telemetry.ts` | New file: SDK initialization |
| `lib/server/metrics.ts` | New file: custom meter and instruments |
| `server.ts` | Call `initTelemetry()` as first statement; add WS spans; call `shutdownTelemetry()` in shutdown hook |
| `lib/db/roomRepository.ts` | Add `saveCommitHistogram.record()` around DB calls |
| `lib/cache/roomSnapshotCache.ts` | Increment `cacheHitCounter`/`cacheMissCounter` |
| `lib/env.ts` | Add `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME` |
| `.env.example` | Document optional OTEL variables |
| `docker-compose.yml` | Optional: add Jaeger service for local development |

## Additional Considerations

### Zero overhead when disabled
The OTEL API calls (e.g., `tracer.startSpan()`, `meter.createCounter()`) use the no-op implementation when the SDK is not initialized. There is no measurable overhead in production deployments that do not set `OTEL_EXPORTER_OTLP_ENDPOINT`.

### Auto-instrumentation coverage
`@opentelemetry/auto-instrumentations-node` auto-instruments:
- `node:http` / `node:https` (all incoming and outgoing HTTP requests)
- `pg` (all PostgreSQL queries via the `pg` driver used by Prisma's `@prisma/adapter-pg`)
- `ioredis` (all Redis commands)
- `dns`, `net`, `tls` (lower-level spans for connection establishment)

This means Prisma's generated queries appear as individual DB spans in the trace without any manual instrumentation.

### Sampling
For high-traffic deployments, trace every request can generate significant overhead and storage. Configure the OTLP exporter with a ratio sampler:
```typescript
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(0.1) }) // 10%
```
Make the sample rate configurable via `OTEL_SAMPLE_RATE` env var.

## Testing Requirements
- When `OTEL_EXPORTER_OTLP_ENDPOINT` is not set, `initTelemetry()` returns without error and no SDK is initialized.
- When set, the SDK starts without error and a test span can be created and ended.
- Custom metrics (`wsConnectionGauge`, `wsMessageCounter`, etc.) are registered without error in a unit test with a no-op meter provider.
- `shutdownTelemetry()` resolves without error after `initTelemetry()`.
- Existing tests are unaffected (OTEL is opt-in; test environment does not set `OTEL_EXPORTER_OTLP_ENDPOINT`).

## Dependency Map
- Builds on: P010 ✅ (Pino logging; OTEL complements rather than replaces structured logging), P013 ✅ (TypeScript server), P023 ✅ (health check)
- Complements: P012 ✅ (horizontal scaling; OTEL traces correlate requests across replicas), P043 ✅ (graceful shutdown; OTEL must flush on shutdown)
- Independent of: Next.js build, client-side code, auth
