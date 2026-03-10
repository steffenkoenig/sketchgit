/**
 * Next.js Middleware – in-process sliding-window rate limiter (P015).
 *
 * Applies to authentication endpoints to prevent brute-force attacks and
 * credential stuffing. Limits are configurable via environment variables
 * RATE_LIMIT_MAX (default 10) and RATE_LIMIT_WINDOW (default 60 seconds).
 *
 * For multi-instance deployments, replace the in-process Map with a Redis
 * backed counter (see P012 / P015 proposals for details).
 *
 * Set DISABLE_RATE_LIMIT=true to bypass rate limiting in test environments.
 */
import { NextRequest, NextResponse } from "next/server";

interface WindowEntry {
  count: number;
  resetAt: number;
}

// In-process sliding window store keyed by `ip:endpoint`.
// NOTE: In multi-instance deployments this state is not shared across instances.
// Replace with a Redis-backed counter (see P012/P015 proposals) for clustering.
const store = new Map<string, WindowEntry>();

// Sweep out expired entries when the store exceeds this size to bound memory
// usage without a background timer (opportunistic GC on each request).
const MAX_STORE_ENTRIES = 10_000;

function getRateLimit(): { max: number; windowMs: number } {
  const max = parseInt(process.env.RATE_LIMIT_MAX ?? "10", 10);
  const windowSec = parseInt(process.env.RATE_LIMIT_WINDOW ?? "60", 10);
  return {
    max: Number.isFinite(max) && max > 0 ? max : 10,
    windowMs: Number.isFinite(windowSec) && windowSec > 0 ? windowSec * 1000 : 60_000,
  };
}

export function middleware(req: NextRequest) {
  if (process.env.DISABLE_RATE_LIMIT === "true") {
    return NextResponse.next();
  }

  // NOTE: IP resolution relies on proxy-set headers (x-forwarded-for / x-real-ip),
  // which can be spoofed in setups where the proxy does not strip and re-set them.
  // In production, ensure your reverse proxy (nginx, Caddy, ALB, etc.) is configured
  // to overwrite these headers from the trusted upstream network address only.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "127.0.0.1";

  // Key on IP + pathname only (not query params or method) to ensure consistent
  // limiting regardless of query string variations. This means GET and POST to
  // the same path share the same counter, which is acceptable for auth routes.
  const key = `${ip}:${req.nextUrl.pathname}`;
  const { max, windowMs } = getRateLimit();
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
    // If expired-entry removal was insufficient, drop the oldest active entries.
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
    return NextResponse.next();
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/auth/register", "/api/auth/signin"],
};
