import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prevent multiple Prisma Client instances during Next.js hot reloads in development.
// https://www.prisma.io/docs/guides/performance-and-optimization/connection-management

const globalForPrisma = globalThis as unknown as {
  prismaWrite?: PrismaClient;
  prismaRead?: PrismaClient;
};

/**
 * P088 – Resolves which connection string `prismaRead` should use.
 * Falls back to the primary when no replica is configured, so read-routed
 * repository functions transparently hit the primary in single-node
 * deployments (the common case — no behavioural change from pre-P088).
 * Extracted as a pure function so it's testable without a real PrismaClient.
 */
export function resolveReadConnectionString(
  primaryUrl: string,
  replicaUrl: string | undefined,
): string {
  return replicaUrl && replicaUrl.length > 0 ? replicaUrl : primaryUrl;
}

function createPrismaClient(connectionString: string, poolSize: number): PrismaClient {
  const adapter = new PrismaPg({ connectionString, max: poolSize });

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
  // Inlined here (not extracted to a helper) so `$on`'s event-type inference
  // stays tied to this client's literal `log` config above.
  client.$on("query", (event) => {
    const { duration, query } = event;
    const sql = query.slice(0, 200);

    if (logAllQueries) {
      // Development: log every query for N+1 pattern detection.
      // ESLint allowlist only permits console.warn/error (not console.debug),
      // so WARN is used here. This is intentional for dev-mode verbosity.
      console.warn(`[prisma:query] ${sql} (${duration}ms)`);
    } else if (duration > slowQueryMs) {
      // Production: log only queries exceeding the slow-query threshold.
      console.warn(`[prisma:slow-query] ${duration}ms — ${sql}`);
    }
  });

  return client;
}

function createWriteClient(): PrismaClient {
  // Fall back to a non-connecting placeholder URL at build time when DATABASE_URL
  // is not set. Any real query will fail with a connection error, not an
  // env-missing error, which allows the Next.js build to complete successfully.
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://placeholder@placeholder/placeholder";
  // P060 – client-side pool size is independent of any PgBouncer pool sitting
  // in front of PostgreSQL. Default 10 matches pre-P060 behaviour; deployments
  // that put PgBouncer in the path should set this to a small number (1-5)
  // since PgBouncer already multiplexes connections across replicas.
  const max = parseInt(process.env.DATABASE_POOL_SIZE ?? "10", 10);
  return createPrismaClient(connectionString, max);
}

export const prismaWrite: PrismaClient =
  globalForPrisma.prismaWrite ?? createWriteClient();

/**
 * P088 – True when `err` indicates the replica connection itself is
 * unreachable (not a query/logic error) — the case where falling back to
 * the primary is safe and desirable.
 *
 * This app uses `@prisma/adapter-pg` (the driver-adapter pattern), not
 * Prisma's traditional binary query engine, so connectivity failures do NOT
 * surface as Prisma's classic P1001/P1002 engine error codes — they come
 * through as a `PrismaClientKnownRequestError` wrapping the underlying
 * `node-postgres` driver's own error code (verified empirically: killing
 * the replica mid-request produced `code: "ECONNREFUSED"` at the top level
 * of the thrown error, not a Prisma-prefixed code). Both are checked for
 * robustness: node-postgres's raw codes going forward, and Prisma's own
 * P1xxx codes / PrismaClientInitializationError in case a future Prisma
 * version or a different adapter surfaces those instead.
 *
 * A query error unrelated to connectivity (bad SQL, constraint violation)
 * is deliberately NOT matched here — retrying that against the primary
 * would just fail the same way.
 * Extracted as a pure function so it's testable without a real PrismaClient.
 */
export function isReplicaConnectionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: unknown }).name;
  if (name === "PrismaClientInitializationError") return true;
  const code = (err as { code?: unknown }).code;
  if (code === "P1001" || code === "P1002" || code === "P1017") return true;
  // node-postgres / OS-level network error codes surfaced by @prisma/adapter-pg.
  return (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "EHOSTUNREACH"
  );
}

/** Client methods that must always run against the exact instance called — never retried on a different client. */
const NON_FALLBACK_METHODS = new Set(["$connect", "$disconnect", "$on", "$transaction", "$extends", "$use"]);

/**
 * P088 – Wraps `readClient` so that when a query fails because the replica
 * itself is unreachable, it transparently retries against `writeClient`
 * (the primary) instead of throwing. This is what makes `dbReplica:
 * "degraded"` in the health check accurate: the application keeps serving
 * reads (from the primary) rather than erroring out.  A no-op (returns
 * `readClient` unwrapped) when no replica is configured, since
 * `readClient === writeClient` already.
 */
/**
 * Exported so server.ts (which maintains its own separate PrismaClient
 * instance for the WS layer, independent of this module's singleton) can
 * apply the same replica→primary fallback to its own read-routed client.
 */
export function wrapWithReadFallback(readClient: PrismaClient, writeClient: PrismaClient): PrismaClient {
  if (readClient === writeClient) return readClient;

  const methodCache = new WeakMap<object, unknown>();

  function wrapValue(target: object, key: PropertyKey, fallbackTarget: object): unknown {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (target as any)[key];
    if (typeof value !== "function") return value;
    if (typeof key === "string" && NON_FALLBACK_METHODS.has(key)) return value.bind(target);

    return (...args: unknown[]) => {
      const result = value.apply(target, args);
      // Prisma's model methods return a lazy thenable ("PrismaPromise"), not
      // a genuine `Promise` instance — `instanceof Promise` is false for it,
      // so duck-type on `.catch` instead (verified empirically).
      if (result && typeof (result as { catch?: unknown }).catch === "function") {
        return (result as Promise<unknown>).catch((err: unknown) => {
          if (!isReplicaConnectionError(err)) throw err;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fallbackFn = (fallbackTarget as any)[key];
          return fallbackFn.apply(fallbackTarget, args);
        });
      }
      return result;
    };
  }

  return new Proxy(readClient, {
    get(target, prop, receiver) {
      const raw = Reflect.get(target, prop, receiver);
      // Only wrap top-level $-prefixed query methods (e.g. $queryRaw) and
      // model delegates (room, commit, ...); leave everything else (plain
      // properties, symbols) untouched.
      if (typeof prop !== "string") return raw;

      if (prop.startsWith("$")) {
        return wrapValue(target, prop, writeClient);
      }

      if (raw && typeof raw === "object") {
        if (methodCache.has(raw)) return methodCache.get(raw);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fallbackModel = (writeClient as any)[prop];
        const modelProxy = new Proxy(raw, {
          get(modelTarget, methodProp) {
            if (typeof methodProp !== "string") return Reflect.get(modelTarget, methodProp);
            return wrapValue(modelTarget, methodProp, fallbackModel as object);
          },
        });
        methodCache.set(raw, modelProxy);
        return modelProxy;
      }

      return raw;
    },
  }) as PrismaClient;
}

/**
 * P088 – Read-only client, routed to DATABASE_URL_REPLICA when set. When no
 * replica is configured this is literally the same client instance as
 * `prismaWrite` (not a second connection to the primary) — no extra pool is
 * opened, and read-routed repository functions behave exactly as before.
 * When a replica IS configured, queries that fail because the replica is
 * unreachable transparently retry against the primary (see
 * wrapWithReadFallback above) — this is what makes `dbReplica: "degraded"`
 * in the health check non-fatal.
 */
export const prismaRead: PrismaClient = (() => {
  if (globalForPrisma.prismaRead) return globalForPrisma.prismaRead;

  const primaryUrl =
    process.env.DATABASE_URL ?? "postgresql://placeholder@placeholder/placeholder";
  const readUrl = resolveReadConnectionString(primaryUrl, process.env.DATABASE_URL_REPLICA);

  if (readUrl === primaryUrl) return prismaWrite;

  const max = parseInt(process.env.DB_REPLICA_POOL_SIZE ?? "5", 10);
  const rawReadClient = createPrismaClient(readUrl, max);
  return wrapWithReadFallback(rawReadClient, prismaWrite);
})();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaWrite = prismaWrite;
  globalForPrisma.prismaRead = prismaRead;
}

/**
 * Backward-compatible alias for `prismaWrite`. Existing call sites and tests
 * that import `prisma` continue to work unchanged — this always points at
 * the primary (read-your-writes safe), same as before P088.
 */
export const prisma: PrismaClient = prismaWrite;
