# P046 – Redis-backed Rate Limiter for Multi-instance Correctness

## Title
Replace the In-memory Proxy Rate Limiter with a Redis-backed Sliding-Window Counter to Enforce Limits Across All Instances

## Brief Summary
The auth-endpoint rate limiter in `proxy.ts` (P015) uses a Node.js `Map` stored in the Next.js Edge/Node runtime. When the application runs as more than one instance — whether on a single machine with PM2, in a Docker Swarm, or in a Kubernetes Deployment with `replicas: N` — each instance maintains an independent counter. An attacker who distributes their brute-force requests across N instances can make `N × RATE_LIMIT_MAX` attempts within a single window before any one instance triggers a 429. The proxy.ts code already acknowledges this explicitly:
```
// For multi-instance deployments, replace the in-process Map with a Redis-
// backed counter (see P012/P015 proposals for details).
```
Since Redis is already a hard dependency when `REDIS_URL` is set (P012 wired ioredis to `server.ts`), using the same Redis connection for the rate limiter requires no new infrastructure.

## Current Situation
`proxy.ts` implements a sliding-window rate limiter using a module-level `Map<string, { count, resetAt }>`:
```typescript
const store = new Map<string, WindowEntry>();

function applyRateLimit(req: NextRequest): NextResponse | null {
  const key = `${ip}:${req.nextUrl.pathname}`;
  const entry = store.get(key);
  // … increment counter in local Map …
}
```

This function runs in Next.js middleware. Because middleware runs in the same process as the Next.js server, the `store` Map is shared across requests on a single instance, but not across separate Node.js processes or containers.

**P015 is implemented and working for single-instance deployments.** This proposal addresses the specific gap that arises when `REDIS_URL` is configured (i.e., when the operator is already running a Redis-connected multi-instance setup).

## Problem with Current Situation
1. **Brute-force bypass in multi-instance deployments**: With 3 app instances and `RATE_LIMIT_MAX=10`, an attacker can make 30 attempts per window (10 per instance) by round-robining their requests through a load balancer. Password-guessing attacks against the `/api/auth/signin` endpoint benefit from this directly.
2. **Silent degradation**: The in-memory limiter appears to work correctly in development (single instance) but silently becomes ineffective in production without any warning or configuration error.
3. **Inconsistency with Redis availability**: `REDIS_URL` is already validated and used for WebSocket pub/sub. Ignoring it for rate limiting creates two different consistency models within the same request lifecycle.
4. **Rate limit state lost on restart**: The in-memory Map is lost on pod restart, allowing an attacker to reset their counter by triggering a rolling restart or exploiting a crash.

## Goal to Achieve
1. When `REDIS_URL` is set, use Redis `INCR` + `EXPIRE` (atomic sliding-window) for rate limit counters instead of the in-memory Map.
2. When `REDIS_URL` is absent, fall back to the existing in-memory implementation unchanged (no regression for single-instance deployments).
3. Use a connection pool shared with the rest of the application — do not create a second Redis connection from within proxy middleware.
4. Keep the rate limiter logic in `proxy.ts`; the Redis client reference is passed in via an environment variable lookup at request time.
5. Survive Redis downtime gracefully: if the Redis `INCR` command fails, fall back to allowing the request (fail-open) and log the error, rather than blocking all traffic.

## What Needs to Be Done

### 1. Create a shared Redis client factory in `lib/redis.ts`
Because Next.js middleware cannot import from `server.ts`, a shared Redis singleton needs to live in `lib/`:
```typescript
// lib/redis.ts
import { createClient, RedisClientType } from 'redis';
// or using ioredis (already installed):
import Redis from 'ioredis';

let _client: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!_client) {
    _client = new Redis(process.env.REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false, // fail fast on downtime
    });
    _client.on('error', () => {}); // suppress unhandled error events
  }
  return _client;
}
```

### 2. Implement `applyRateLimitRedis` in `proxy.ts`
```typescript
async function applyRateLimitRedis(
  key: string,
  max: number,
  windowMs: number,
  redis: Redis,
): Promise<{ limited: boolean; retryAfterSec: number }> {
  try {
    const windowSec = Math.ceil(windowMs / 1000);
    // Atomic: INCR returns the new count; EXPIRE only sets TTL if key is new.
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSec);
    }
    if (count > max) {
      const ttl = await redis.ttl(key);
      return { limited: true, retryAfterSec: Math.max(ttl, 0) };
    }
    return { limited: false, retryAfterSec: 0 };
  } catch {
    // Redis unavailable → fail-open (allow request)
    return { limited: false, retryAfterSec: 0 };
  }
}
```

### 3. Extend `applyRateLimit` to delegate to Redis when available
```typescript
function applyRateLimit(req: NextRequest): NextResponse | null | Promise<NextResponse | null> {
  if (process.env.DISABLE_RATE_LIMIT === 'true') return null;

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? '127.0.0.1';
  const key = `rate:${ip}:${req.nextUrl.pathname}`;
  const { max, windowMs } = getRateLimit();

  const redis = getRedisClient();
  if (redis) {
    // Async Redis path
    return applyRateLimitRedis(key, max, windowMs, redis).then(({ limited, retryAfterSec }) => {
      if (!limited) return null;
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSec),
            'X-RateLimit-Limit': String(max),
            'X-RateLimit-Remaining': '0',
          },
        },
      );
    });
  }

  // Fall back to in-memory Map (single-instance mode)
  return applyRateLimitInMemory(req, key, max, windowMs);
}
```

Note: `proxy.ts` is a Next.js middleware file. Next.js 16 middleware can be async, but care must be taken to ensure the `auth()` wrapper also handles the async rate limit result correctly.

### 4. Tests
- Unit: `applyRateLimitRedis` with a mock Redis client that increments — after `max+1` calls, returns `limited: true`.
- Unit: `applyRateLimitRedis` with a Redis client that throws — returns `{ limited: false }` (fail-open).
- Unit: Two separate "instances" using the same mock Redis counter — confirms shared state is enforced across them.
- Integration (manual): start two server processes with the same `REDIS_URL`, send `max` requests to instance A, confirm `max+1` request to instance B returns 429.

## Components Affected
| Component | Change |
|-----------|--------|
| `proxy.ts` | Extend `applyRateLimit` to use Redis when available; add `applyRateLimitRedis` helper |
| `lib/redis.ts` | **New file** – lazy ioredis singleton exported for use in Next.js middleware |
| `.env.example` | No change (REDIS_URL already documented) |

## Data & Database Model
No schema changes. Rate limit counters are ephemeral Redis keys with TTL equal to the rate-limit window.

**Redis key format**: `rate:<IP>:<path>` (e.g., `rate:192.168.1.1:/api/auth/signin`)

**Key lifecycle**: Auto-expired by Redis TTL; no manual cleanup needed.

## Testing Requirements
- Redis path: `max` requests succeed, `max+1` returns 429.
- Redis failure path: returns `null` (allow), no thrown exception.
- In-memory fallback: when `REDIS_URL` is unset, existing behavior is unchanged.
- Multi-instance simulation: shared counter enforced across two independent in-process calls using the same mocked Redis state.

## Linting and Type Requirements
- `applyRateLimit` return type changes from `NextResponse | null` to `NextResponse | null | Promise<NextResponse | null>`. The caller in the `auth()` wrapper must `await` it.
- `lib/redis.ts` added to the `lib/db/**` ESLint file glob that maps to Node.js globals.
- `getRedisClient()` must not throw; ioredis connection errors are suppressed via `on('error', () => {})`.

## Dependency Map
- Depends on: P012 ✅ (ioredis installed), P015 ✅ (in-memory rate limiter exists to extend), P027 ✅ (REDIS_URL validated)
- Complements: P034 (room access control), P019 ✅ (security headers)
- Required for: correct multi-instance brute-force protection when REDIS_URL is configured
