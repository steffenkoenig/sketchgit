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

  // ── Optional – LOG_LEVEL (used by Pino logger) ────────────────────────────
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  // ── Optional – OAuth ───────────────────────────────────────────────────────
  GITHUB_ID: z.string().optional(),
  GITHUB_SECRET: z.string().optional(),

  // ── Optional – Redis (P012) ────────────────────────────────────────────────
  REDIS_URL: z.string().url().optional(),

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

  // ── Optional – room capacity limit (P069) ─────────────────────────────────
  // Maximum number of simultaneous WebSocket clients allowed in a single room.
  // Connections beyond this limit receive a ROOM_FULL error and are closed.
  MAX_CLIENTS_PER_ROOM: z.coerce.number().int().min(1).default(50),

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
