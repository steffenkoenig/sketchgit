/**
 * Custom OpenTelemetry metrics (P061).
 *
 * These use the OTel API's meter, which is a safe no-op until
 * lib/otelRegister.mjs calls NodeSDK.start() (i.e. zero overhead when
 * OTEL_EXPORTER_OTLP_ENDPOINT is unset — see that file).
 */
import { metrics, type ObservableGauge, type Counter, type Histogram } from "@opentelemetry/api";

const meter = metrics.getMeter("sketchgit");

export const wsConnectionGauge: ObservableGauge = meter.createObservableGauge("sketchgit.ws.connections", {
  description: "Number of active WebSocket connections",
});

export const wsMessageCounter: Counter = meter.createCounter("sketchgit.ws.messages", {
  description: "WebSocket messages received, labeled by type",
});

export const cacheHitCounter: Counter = meter.createCounter("sketchgit.room.snapshot_cache_hits", {
  description: "Room snapshot cache hits",
});

export const cacheMissCounter: Counter = meter.createCounter("sketchgit.room.snapshot_cache_misses", {
  description: "Room snapshot cache misses",
});

export const saveCommitHistogram: Histogram = meter.createHistogram("sketchgit.db.save_commit_duration", {
  description: "Duration of the saveCommit DB operation",
  unit: "ms",
});
