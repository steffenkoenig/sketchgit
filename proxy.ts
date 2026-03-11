/**
 * Next.js proxy (replaces "middleware" in Next.js 16).
 *
 * - Rate-limits authentication endpoints to prevent brute-force attacks.
 *   P046: When REDIS_URL is set, uses a Redis INCR+EXPIRE sliding-window counter
 *   shared across all instances. Falls back to the in-process Map when Redis is
 *   absent or unavailable (fail-open).
 * - Protects /dashboard: unauthenticated users are redirected to /auth/signin.
 * - P056: Generates a per-request nonce and sets a nonce-based CSP header,
 *   replacing `'unsafe-inline'` for script-src and style-src.
 * - All other routes (including the canvas app) are publicly accessible so
 *   that anonymous users experience no friction.
 *
 * Limits are configurable via RATE_LIMIT_MAX (default 10) and
 * RATE_LIMIT_WINDOW (default 60 seconds). Set DISABLE_RATE_LIMIT=true to
 * bypass rate limiting in test environments.
 */
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { getRedisClient } from "@/lib/redis";
import { randomBytes } from "node:crypto";
import { buildCsp } from "@/lib/server/csp";

// ── In-process sliding-window rate limiter ────────────────────────────────────

interface WindowEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, WindowEntry>();

// Sweep out expired entries when the store exceeds this size to bound memory
// usage without a background timer (opportunistic GC on each request).
const MAX_STORE_ENTRIES = 10_000;

const RATE_LIMITED_PATHS = new Set(["/api/auth/register", "/api/auth/signin"]);

function getRateLimit(): { max: number; windowMs: number } {
  const max = parseInt(process.env.RATE_LIMIT_MAX ?? "10", 10);
  const windowSec = parseInt(process.env.RATE_LIMIT_WINDOW ?? "60", 10);
  return {
    max: Number.isFinite(max) && max > 0 ? max : 10,
    windowMs: Number.isFinite(windowSec) && windowSec > 0 ? windowSec * 1000 : 60_000,
  };
}

// ── P046 – Redis sliding-window rate limit helper ─────────────────────────────

/**
 * Atomic Redis INCR+EXPIRE sliding-window counter.
 * Returns `{ limited: false }` on any Redis error (fail-open).
 */
async function applyRateLimitRedis(
  key: string,
  max: number,
  windowMs: number,
): Promise<{ limited: boolean; retryAfterSec: number }> {
  const redis = getRedisClient();
  if (!redis) return { limited: false, retryAfterSec: 0 };
  try {
    const windowSec = Math.ceil(windowMs / 1000);
    const count = await redis.incr(key);
    if (count === 1) {
      // First hit in this window – set TTL atomically.
      await redis.expire(key, windowSec);
    }
    if (count > max) {
      const ttl = await redis.ttl(key);
      return { limited: true, retryAfterSec: Math.max(ttl, 0) };
    }
    return { limited: false, retryAfterSec: 0 };
  } catch {
    // Redis unavailable → fail-open (allow request, do not block traffic).
    return { limited: false, retryAfterSec: 0 };
  }
}

function applyRateLimitInMemory(
  key: string,
  max: number,
  windowMs: number,
): NextResponse | null {
  const now = Date.now();

  // Opportunistic cleanup: when the store is over the cap, first evict all
  // expired entries.  If it is still over the cap afterwards (e.g. under an
  // IP-spoofing flood where all keys are within an active window), evict entries
  // in insertion order (oldest first – Map preserves insertion order) until we
  // are back under the limit.  This is O(n) and avoids a sort.
  if (store.size > MAX_STORE_ENTRIES) {
    for (const [k, v] of store) {
      if (now >= v.resetAt) store.delete(k);
    }
    if (store.size > MAX_STORE_ENTRIES) {
      const overflow = store.size - MAX_STORE_ENTRIES;
      let removed = 0;
      for (const k of store.keys()) {
        store.delete(k);
        if (++removed >= overflow) break;
      }
    }
  }

  const entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  entry.count += 1;
  if (entry.count > max) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
          "X-RateLimit-Limit": String(max),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
        },
      },
    );
  }
  return null;
}

function applyRateLimit(req: NextRequest): NextResponse | null | Promise<NextResponse | null> {
  if (process.env.DISABLE_RATE_LIMIT === "true") return null;

  // NOTE: IP resolution relies on proxy-set headers (x-forwarded-for / x-real-ip),
  // which can be spoofed in setups where the proxy does not strip and re-set them.
  // In production, ensure your reverse proxy (nginx, Caddy, ALB, etc.) is configured
  // to overwrite these headers from the trusted upstream network address only.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "127.0.0.1";

  const key = `rate:${ip}:${req.nextUrl.pathname}`;
  const { max, windowMs } = getRateLimit();

  // P046: When Redis is available, use a shared counter across all instances.
  if (getRedisClient()) {
    return applyRateLimitRedis(key, max, windowMs).then(({ limited, retryAfterSec }) => {
      if (!limited) return null;
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSec),
            "X-RateLimit-Limit": String(max),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    });
  }

  // Fall back to in-memory Map (single-instance mode).
  return applyRateLimitInMemory(key, max, windowMs);
}

// ── Auth proxy handler ────────────────────────────────────────────────────────

export default auth(async (req) => {
  const pathname = req.nextUrl.pathname;

  if (RATE_LIMITED_PATHS.has(pathname)) {
    const rateLimitResponse = await applyRateLimit(req);
    if (rateLimitResponse) return rateLimitResponse;
  }

  const isLoggedIn = !!req.auth;
  const isDashboard = pathname.startsWith("/dashboard");

  if (isDashboard && !isLoggedIn) {
    const loginUrl = new URL("/auth/signin", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }

  // P056 – Generate a per-request nonce and forward it so layout.tsx can use it
  const nonce = randomBytes(16).toString("base64");
  const isProd = process.env.NODE_ENV === "production";

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", buildCsp(nonce, isProd));
  return response;
});

export const config = {
  matcher: ["/dashboard/:path*", "/api/auth/register", "/api/auth/signin"],
};
