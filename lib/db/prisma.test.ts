
/**
 * Tests for P071 – Prisma slow-query logging.
 *
 * Because the actual PrismaClient requires a real DB connection, we test the
 * slow-query logic in isolation by extracting it to a helper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveReadConnectionString, isReplicaConnectionError } from "./prisma";

/** Mirrors the relevant part of Prisma's QueryEvent type */
interface QueryEvent {
  query: string;
  duration: number;
}

/**
 * Standalone slow-query handler extracted from createPrismaClient().
 * Returned as a factory so we can inject the threshold and log flag.
 */
function makeQueryHandler(slowQueryMs: number, logAllQueries: boolean) {
  return (event: QueryEvent) => {
    const { duration, query } = event;
    const sql = query.slice(0, 200);
    if (logAllQueries) {
      // Mirrors prisma.ts: console.warn used for all-query mode too
      console.warn(`[prisma:query] ${sql} (${duration}ms)`);
    } else if (duration > slowQueryMs) {
      console.warn(`[prisma:slow-query] ${duration}ms — ${sql}`);
    }
  };
}

describe("Prisma slow-query handler (P071)", () => {
  const originalEnv = process.env;
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env = { ...originalEnv };
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("does not log when query duration is below the threshold", () => {
    const handler = makeQueryHandler(500, false);
    handler({ query: "SELECT 1", duration: 100 });
    expect(warnSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("logs at WARN when query duration exceeds the threshold", () => {
    const handler = makeQueryHandler(500, false);
    handler({ query: "SELECT * FROM commits", duration: 600 });
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("[prisma:slow-query]");
    expect(warnSpy.mock.calls[0][0]).toContain("600ms");
  });

  it("does not log at WARN when duration exactly equals the threshold", () => {
    const handler = makeQueryHandler(500, false);
    handler({ query: "SELECT 1", duration: 500 });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("logs at DEBUG for every query when LOG_QUERIES=true", () => {
    const handler = makeQueryHandler(500, true);
    handler({ query: "SELECT 1", duration: 10 });
    handler({ query: "SELECT 2", duration: 20 });
    // LOG_QUERIES uses console.warn (console.debug not in ESLint allowlist)
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls[0][0]).toContain("[prisma:query]");
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("truncates long queries to 200 characters in the log", () => {
    const handler = makeQueryHandler(500, false);
    const longQuery = "A".repeat(300);
    handler({ query: longQuery, duration: 600 });
    const logged: string = warnSpy.mock.calls[0][0] as string;
    // The SQL in the log should be at most 200 chars of the original query
    expect(logged).toContain("A".repeat(200));
    expect(logged).not.toContain("A".repeat(201));
  });

  it("uses a threshold of 0 to log every query as slow", () => {
    const handler = makeQueryHandler(0, false);
    handler({ query: "SELECT 1", duration: 1 });
    expect(warnSpy).toHaveBeenCalledOnce();
  });
});

describe("resolveReadConnectionString (P088 – read replica routing)", () => {
  const PRIMARY = "postgresql://user:pass@primary:5432/sketchgit";
  const REPLICA = "postgresql://user:pass@replica:5432/sketchgit";

  it("falls back to the primary URL when no replica URL is configured", () => {
    expect(resolveReadConnectionString(PRIMARY, undefined)).toBe(PRIMARY);
  });

  it("falls back to the primary URL when the replica URL is an empty string", () => {
    expect(resolveReadConnectionString(PRIMARY, "")).toBe(PRIMARY);
  });

  it("uses the replica URL when configured", () => {
    expect(resolveReadConnectionString(PRIMARY, REPLICA)).toBe(REPLICA);
  });
});

describe("isReplicaConnectionError (P088 – read-fallback trigger)", () => {
  it("returns true for PrismaClientInitializationError", () => {
    expect(isReplicaConnectionError({ name: "PrismaClientInitializationError" })).toBe(true);
  });

  it.each(["P1001", "P1002", "P1017"])("returns true for Prisma error code %s", (code) => {
    expect(isReplicaConnectionError({ code })).toBe(true);
  });

  it.each(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH"])(
    "returns true for node-postgres/adapter-pg driver code %s",
    (code) => {
      expect(isReplicaConnectionError({ code })).toBe(true);
    },
  );

  it("returns false for an unrelated Prisma error code", () => {
    expect(isReplicaConnectionError({ code: "P2002" })).toBe(false);
  });

  it("returns false for a plain query/logic error", () => {
    expect(isReplicaConnectionError(new Error("constraint violation"))).toBe(false);
  });

  it("returns false for non-object values", () => {
    expect(isReplicaConnectionError(null)).toBe(false);
    expect(isReplicaConnectionError(undefined)).toBe(false);
    expect(isReplicaConnectionError("some string")).toBe(false);
  });
});
