/**
 * Environment variable validation using Zod.
 *
 * Call `validateEnv()` at application startup to exit immediately with a clear
 * error message if any required variable is missing or malformed, rather than
 * silently running in a degraded state.
 *
 * Set SKIP_ENV_VALIDATION=true to bypass validation in unit-test contexts
 * that do not require a real database.
 */
import { z } from "zod";

const EnvSchema = z.object({
  // ── Required ───────────────────────────────────────────────────────────────
  DATABASE_URL: z
    .string()
    .url("DATABASE_URL must be a valid PostgreSQL connection URL"),
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),

  // ── Optional – PgBouncer connection pooling (P060) ────────────────────────
  // When DATABASE_URL points at PgBouncer (transaction-mode pooling),
  // DATABASE_DIRECT_URL should point directly at PostgreSQL, bypassing the
  // pooler. `prisma.config.ts` uses it for migrate/introspection commands,
  // which need a session-scoped connection PgBouncer transaction mode can't
  // provide. Falls back to DATABASE_URL when unset (no PgBouncer in path).
  DATABASE_DIRECT_URL: z.string().url().optional(),
  // Prisma's own client-side pool size (the `pg` Pool `max` option). With
  // PgBouncer already multiplexing server connections, this can be small
  // (1-5) per replica; without PgBouncer, size it to the expected concurrency.
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),

  // ── Optional – read replica connection routing (P088) ────────────────────
  // Points at a read-only PostgreSQL replica. Read-heavy repository functions
  // (paginated commit history, room-access checks, activity feed, snapshot
  // loads) route through it via `prismaRead` in lib/db/prisma.ts, leaving
  // write-critical paths on the primary. Falls back to DATABASE_URL when
  // unset (single-node mode — no behavioural change from pre-P088).
  DATABASE_URL_REPLICA: z.string().url().optional(),
  // Replica connection pool size — smaller than the primary's by default
  // since replica connections are cheaper to restart and reads are more
  // numerous but individually shorter-lived.
  DB_REPLICA_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(5),

  // ── Optional – LOG_LEVEL (used by Pino logger) ────────────────────────────
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  // ── Optional – OAuth ───────────────────────────────────────────────────────
  GITHUB_ID: z.string().optional(),
  GITHUB_SECRET: z.string().optional(),
  // GAP-014 – 32-byte base64-encoded AES-256-GCM key for encrypting OAuth
  // access/refresh/id tokens at rest in the Account table. Optional: falls
  // back to a key derived from AUTH_SECRET (see lib/server/tokenEncryption.ts)
  // so tokens are encrypted by default without requiring a new required env
  // var — same "derive, don't force a new secret" pattern as
  // EMAIL_UNSUBSCRIBE_SECRET's AUTH_SECRET fallback.
  OAUTH_TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, {
      message: "OAUTH_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded)",
    })
    .optional(),

  // ── Optional – Redis (P012, P075) ─────────────────────────────────────────
  REDIS_URL: z.string().url().optional(),
  // P075 – Redis connection mode (sentinel / cluster for HA deployments)
  REDIS_MODE: z.enum(["standalone", "sentinel", "cluster"]).default("standalone"),
  // Sentinel: comma-separated "host:port" pairs (e.g. "sentinel1:26379,sentinel2:26379")
  REDIS_SENTINEL_HOSTS: z.string().optional(),
  // Sentinel master name (default: "mymaster")
  REDIS_SENTINEL_NAME: z.string().default("mymaster"),
  // Cluster: comma-separated "host:port" node addresses
  REDIS_CLUSTER_NODES: z.string().optional(),

  // ── Optional – rate limiting (P015) ───────────────────────────────────────
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_WINDOW: z.coerce.number().int().positive().default(60),

  // ── Optional – presence debouncing (P044) ────────────────────────────────
  // Milliseconds to wait before broadcasting a presence update after a
  // burst of connects or disconnects.  Coalesces rapid successive
  // events into a single broadcast that reflects the stable final state.
  PRESENCE_DEBOUNCE_MS: z.coerce.number().int().min(0).max(1000).default(80),

  // ── Optional – shutdown drain window (P043) ─────────────────────────────
  SHUTDOWN_DRAIN_MS: z.coerce.number().int().min(0).max(30_000).default(5_000),

  // ── Optional – WebSocket payload size limit (P031) ────────────────────────
  MAX_WS_PAYLOAD_BYTES: z.coerce.number().int().positive().default(524288), // 512 KB

  // ── Optional – room pruning (P032) ────────────────────────────────────────
  PRUNE_INACTIVE_ROOMS_DAYS: z.coerce.number().int().min(1).default(30),
  PRUNE_INTERVAL_HOURS: z.coerce.number().int().min(1).default(24),

  // ── Optional – room activity email digests (P094) ─────────────────────────
  // How often the digest job checks for due subscriptions. Independent of
  // the subscription's own frequency (HOURLY/DAILY) — this just needs to be
  // frequent enough that an HOURLY subscriber's digest goes out reasonably
  // close to an hour after their window opened, not exactly on the hour.
  DIGEST_JOB_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(15),

  // ── Optional – room capacity limit (P069) ─────────────────────────────────
  // Maximum number of simultaneous WebSocket clients allowed in a single room.
  // Connections beyond this limit receive a ROOM_FULL error and are closed.
  MAX_CLIENTS_PER_ROOM: z.coerce.number().int().min(1).default(50),

  // ── Database slow-query logging (P071) ────────────────────────────────────
  // Queries slower than this threshold (ms) are logged at WARN level.
  SLOW_QUERY_MS: z.coerce.number().int().min(0).default(500),
  // Set to "true" to log every Prisma query at DEBUG level (development only).
  LOG_QUERIES: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),

  // ── WebSocket compression (P059) ──────────────────────────────────────────
  // Minimum uncompressed message size (bytes) below which zlib compression is
  // skipped. Compression adds ~50–100 µs overhead; it is not worth compressing
  // tiny messages like heartbeat pongs or cursor updates under 1 KB.
  WS_COMPRESSION_THRESHOLD: z.coerce.number().int().min(0).default(1024),

  // ── Room activity feed event retention (P074) ─────────────────────────────
  // RoomEvent rows older than this many days are deleted by the pruning job.
  ROOM_EVENT_RETENTION_DAYS: z.coerce.number().int().min(1).default(90),

  // ── Room invitation token secret (P066) ───────────────────────────────────
  // HMAC secret used to sign invitation tokens. Falls back to AUTH_SECRET when
  // not explicitly set. Must be at least 32 characters.
  INVITATION_SECRET: z.string().min(32).optional(),

  // ── Feature flags admin API (P090) ────────────────────────────────────────
  // Required to call POST/PATCH /api/admin/feature-flags — there's no
  // site-wide admin role in this app's RBAC (RoomMembership roles are
  // per-room), so a shared secret header is the simplest correct guard.
  // Unset in non-production environments disables the admin routes entirely
  // (they return 503) rather than defaulting to an insecure open state.
  ADMIN_API_SECRET: z.string().min(32).optional(),

  // ── OpenTelemetry (P061) ──────────────────────────────────────────────────
  // Unset by default: telemetry is opt-in. When set, traces and metrics are
  // exported via OTLP/HTTP to this collector endpoint (e.g. Jaeger, Grafana
  // Tempo). See lib/otelRegister.mjs, which actually starts the SDK — it must
  // load before tsx's own loader (see the `dev`/`start` scripts).
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().default("sketchgit"),
  // Fraction of traces to sample (0-1). Default 1 = sample everything; lower
  // for high-traffic deployments to control collector storage/cost.
  OTEL_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1),

  // ── Share-link token secret (P091) ────────────────────────────────────────
  // HMAC secret used to sign share-link tokens and scope cookies.
  // Falls back to INVITATION_SECRET → AUTH_SECRET when not explicitly set.
  // Must be at least 32 characters.
  SHARE_LINK_SECRET: z.string().min(32).optional(),

  // ── Runtime ────────────────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(): Env {
  if (process.env.SKIP_ENV_VALIDATION === "true") {
    // Return a partial object when skipping – only safe in unit-test contexts.
    return EnvSchema.parse({
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://invalid:invalid@invalid/invalid",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "skip-validation-secret-padding-here-xx",
      NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
      ...process.env,
    });
  }

  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    console.error(`\n❌ Environment configuration error:\n${errors}\n`);
    console.error(
      "  Copy .env.example to .env and fill in the required values.\n",
    );
    process.exit(1);
  }
  return result.data;
}
