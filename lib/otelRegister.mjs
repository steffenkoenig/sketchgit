/**
 * OpenTelemetry SDK bootstrap (P061).
 *
 * This file MUST be loaded via `node --import` / `NODE_OPTIONS=--import`
 * BEFORE tsx's own loader registers itself (see the `dev`/`start` scripts in
 * package.json and the Dockerfile's `NODE_OPTIONS`). It cannot be a normal
 * `import` inside server.ts: OpenTelemetry's auto-instrumentation patches
 * `node:http`, `pg`, and `ioredis` by hooking Node's module loader the
 * moment those modules are first required. tsx transforms and loads
 * TypeScript through its own resolver, and by the time a `import` statement
 * inside a tsx-executed .ts file runs, sibling imports (next, pg, ioredis)
 * may already be resolved through tsx's pipeline — verified empirically:
 * a plain first-import inside server.ts produced zero spans, while loading
 * this file via `--import` ahead of tsx correctly instruments both
 * `node:http` and `pg` queries end to end.
 *
 * No-ops entirely (zero overhead) when OTEL_EXPORTER_OTLP_ENDPOINT is unset,
 * so telemetry is opt-in for local development and doesn't affect `next
 * build`, `prisma generate`, or the test suite.
 *
 * Note: tsx re-execs itself once to install its own loader, so this file
 * runs twice per `tsx server.ts` invocation — once in tsx's short-lived
 * bootstrap process, once in the actual long-running server process. Both
 * share the same NODE_OPTIONS. This is harmless (the bootstrap process's SDK
 * instance is simply abandoned when it exits) but produces one duplicate
 * "OpenTelemetry started" log line at startup — cosmetic only.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { ParentBasedSampler, TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-base";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (!endpoint) {
  // Log explicitly so operators know telemetry is off and can catch a typo
  // in the env var name rather than assuming it's silently failing.
  console.info("[telemetry] OpenTelemetry disabled: OTEL_EXPORTER_OTLP_ENDPOINT is not set");
} else {
  const serviceName = process.env.OTEL_SERVICE_NAME ?? "sketchgit";
  const sampleRate = Number(process.env.OTEL_SAMPLE_RATE ?? "1");

  const sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 10_000,
    }),
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(sampleRate) }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
  console.info(`[telemetry] OpenTelemetry started (service=${serviceName}, endpoint=${endpoint}, sampleRate=${sampleRate})`);

  // server.ts imports lib/telemetry.ts as a normal module and calls
  // shutdownTelemetry() during graceful shutdown, after the drain window
  // completes, so the final span/metric batch is flushed before exit. That
  // file runs through tsx as a *different* module instance than this
  // preloaded script, so the SDK handle is bridged via globalThis rather
  // than a direct import.
  globalThis.__sketchgitOtelSdk = sdk;
}
