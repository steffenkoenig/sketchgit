# P015 – Rate Limiting and Brute-Force Protection

## Title
Add Rate Limiting and Brute-Force Protection to API Endpoints

## Brief Summary
The authentication endpoints (`/api/auth/register` and the NextAuth credentials callback) and the WebSocket upgrade handler are currently accessible without any request-rate restriction. An attacker can enumerate valid email addresses, brute-force passwords, or exhaust server resources through automated requests at unlimited speed. Adding rate limiting to sensitive endpoints protects users, reduces database load under attack conditions, and improves the overall reliability of the service.

## Current Situation
The registration endpoint is a plain Next.js API route that accepts `POST` requests and queries the database on every call:
```typescript
// app/api/auth/register/route.ts
export async function POST(req: Request) {
  const { email, password } = await req.json();
  const existing = await findUserByEmail(email); // DB query on every request
  if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  const user = await createUser(email, password, name);
  ...
}
```
The NextAuth credentials provider similarly performs a database lookup for every login attempt. Neither endpoint tracks request frequency, implements exponential back-off, or returns `429 Too Many Requests`.

The WebSocket upgrade handler in `server.mjs` opens a new room slot and database connection on every incoming request with no upper bound on connections per IP or per room.

## Problem with Current Situation
1. **Credential stuffing**: Automated tools can test millions of email/password combinations against the login endpoint without any throttling.
2. **Account enumeration**: The registration endpoint returns a distinct `409` for existing emails and `201` for new ones. Without rate limiting, an attacker can enumerate all registered emails within minutes.
3. **Denial of Service (DoS)**: A flood of registration or login requests can saturate the database connection pool (Prisma defaults to a pool size of 10), causing latency spikes for all users.
4. **WebSocket flood**: A single IP can open thousands of WebSocket connections, filling the `rooms` map with garbage entries and consuming file descriptors.
5. **No user feedback on overload**: Legitimate users who happen to trigger limits (e.g., a mobile app retrying rapidly) receive no useful information about why their request failed.

## Goal to Achieve
1. Limit authentication endpoint calls to a safe rate per IP address (e.g., 10 login attempts per minute per IP).
2. Limit WebSocket connection rate per IP to prevent room flooding.
3. Return `429 Too Many Requests` with a `Retry-After` header when limits are exceeded.
4. Add optional exponential lockout for repeated failures (e.g., 5 failed logins → 1-minute lockout).
5. Maintain zero friction for normal users whose request rate stays well below the limits.

## What Needs to Be Done

### 1. Choose a rate-limiting strategy

**Option A – In-process sliding window (simplest, no new dependencies)**
Use a Map-based sliding window counter keyed by IP address. Suitable for single-instance deployments (see P012 note on distributed rate limiting below).

**Option B – `@upstash/ratelimit` + Redis (recommended for multi-instance)**
Upstash provides a serverless-compatible rate-limiter built on Redis. It integrates with Next.js Middleware and is compatible with the Redis instance proposed in P012.

**Option C – Next.js Middleware with `next-rate-limit`**
A lightweight middleware wrapper that can be applied globally or to specific route patterns.

### 2. Implement rate limiting in Next.js Middleware
Create `middleware.ts` in the project root:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '60s'),
  analytics: true,
});

export async function middleware(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? '127.0.0.1';
  const { success, limit, remaining, reset } = await ratelimit.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': String(remaining),
        },
      },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/auth/register', '/api/auth/signin'],
};
```

### 3. Add per-IP connection limits to the WebSocket server
In `server.ts`, track open connections per IP and refuse the upgrade if the IP exceeds a threshold:
```typescript
const connectionsPerIp = new Map<string, number>();
const MAX_CONNECTIONS_PER_IP = 20;

wss.on('connection', (socket, req) => {
  const ip = req.socket.remoteAddress ?? 'unknown';
  const count = (connectionsPerIp.get(ip) ?? 0) + 1;
  if (count > MAX_CONNECTIONS_PER_IP) {
    socket.close(1008, 'Too many connections');
    return;
  }
  connectionsPerIp.set(ip, count);
  socket.on('close', () => {
    const remaining = (connectionsPerIp.get(ip) ?? 1) - 1;
    remaining > 0 ? connectionsPerIp.set(ip, remaining) : connectionsPerIp.delete(ip);
  });
  ...
});
```

### 4. Add exponential lockout for repeated failed logins
Extend the NextAuth credentials provider callback to track failure counts in Redis (or an in-memory Map for single-instance deployments) and introduce a lockout period:
```typescript
// auth.ts – in the credentials authorize callback
const failures = await redis.incr(`auth:failures:${email}`);
await redis.expire(`auth:failures:${email}`, 300); // 5-minute window
if (failures > 5) throw new Error('Account temporarily locked. Try again later.');
```
On successful login, reset the counter: `redis.del(...)`.

### 5. Add environment variables
```bash
# .env.example additions
UPSTASH_REDIS_REST_URL=   # Upstash Redis REST URL (if using Upstash)
UPSTASH_REDIS_REST_TOKEN= # Upstash Redis REST token
RATE_LIMIT_MAX=10         # Requests per window
RATE_LIMIT_WINDOW=60      # Window in seconds
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `middleware.ts` | New file: rate limiting for auth API routes |
| `server.ts` (after P013) | Add per-IP WebSocket connection counter |
| `lib/auth.ts` | Add failure counter and lockout logic to credentials provider |
| `.env.example` | Add rate-limit and Redis environment variables |
| `package.json` | Add `@upstash/ratelimit` and `@upstash/redis` (or chosen library) |

## Additional Considerations

### Distributed rate limiting
If multiple server instances are deployed (see P012), an in-process Map is insufficient because each instance keeps an independent counter. The Redis-based approach (Upstash or a shared ioredis client) is the correct solution for multi-instance deployments.

### IP spoofing and proxy trust
Behind a reverse proxy or CDN (Nginx, Cloudflare), the real client IP arrives in the `X-Forwarded-For` header. Never read this header unconditionally: an attacker who connects directly to the Node.js port can set any value they wish. Only read `X-Forwarded-For` after verifying the request came from a known trusted proxy (e.g., by checking `req.socket.remoteAddress` against an allowlist of proxy IPs). For production deployments sitting behind a managed load balancer or Cloudflare, use the provider-specific header (`CF-Connecting-IP`, `X-Real-IP`) rather than the raw `X-Forwarded-For` chain.

### Legitimate automation
CI/CD pipelines or integration tests that hit the API quickly may trip rate limits. Add an environment variable to disable rate limiting in test environments:
```typescript
if (process.env.DISABLE_RATE_LIMIT === 'true') return NextResponse.next();
```

### User-facing messaging
When a `429` response is shown in the UI, display a helpful message such as "Too many attempts. Please wait 60 seconds before trying again." rather than a generic error. This ties into the i18n work from P009.

### Monitoring
Log all `429` responses (with IP, endpoint, and timestamp) to the Pino logger (P010) and set up an alert if the rate exceeds a threshold—sudden spikes may indicate an active attack.
