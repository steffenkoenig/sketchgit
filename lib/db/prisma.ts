import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prevent multiple Prisma Client instances during Next.js hot reloads in development.
// https://www.prisma.io/docs/guides/performance-and-optimization/connection-management

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  // Fall back to a non-connecting placeholder URL at build time when DATABASE_URL
  // is not set. Any real query will fail with a connection error, not an
  // env-missing error, which allows the Next.js build to complete successfully.
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://placeholder@placeholder/placeholder";
  const adapter = new PrismaPg({ connectionString });

  // P071 – Always include `query` event emission so we can attach a runtime
  // slow-query listener.  The `query` stdout level is NOT enabled (too verbose).
  // The event emitter approach has ~50–100 μs overhead per query.
  const client = new PrismaClient({
    adapter,
    log: [
      { level: "warn", emit: "stdout" },
      { level: "error", emit: "stdout" },
      { level: "query", emit: "event" },
    ],
  });

  const slowQueryMs = parseInt(process.env.SLOW_QUERY_MS ?? "500", 10);
  const logAllQueries = process.env.LOG_QUERIES === "true";

  // P071 – Slow-query and all-query logging listener.
  // `event.query` contains the raw SQL (parameterised); `event.duration` is in ms.
  // Params are intentionally excluded from the log output to avoid logging PII.
  client.$on("query", (event) => {
    const { duration, query } = event;
    const sql = query.slice(0, 200);

    if (logAllQueries) {
      // Development: log every query for N+1 pattern detection.
      // Uses console.warn since console.debug is not in the ESLint allowlist.
      console.warn(`[prisma:query] ${sql} (${duration}ms)`);
    } else if (duration > slowQueryMs) {
      // Production: log only queries exceeding the slow-query threshold.
      console.warn(`[prisma:slow-query] ${duration}ms — ${sql}`);
    }
  });

  return client;
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
