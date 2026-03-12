# P075 – Redis Sentinel and Cluster Mode Support

## Title
Support Redis Sentinel (High-Availability) and Redis Cluster (Horizontal Scaling) Connection Modes via ioredis to Eliminate the Redis Single-Point-of-Failure

## Brief Summary
The current Redis client (`lib/redis.ts`) creates a single ioredis `Redis` connection from `REDIS_URL`, which only works with a standalone Redis instance. In production deployments using Redis Sentinel (the standard HA setup for managed Redis on AWS ElastiCache, Redis Cloud, or self-hosted) or Redis Cluster (for horizontal key-space partitioning), a standalone connection will fail after a failover. ioredis natively supports both Sentinel and Cluster modes via `new Redis.Sentinel([...])` and `new Redis.Cluster([...])`. Adding connection-mode detection based on the URL scheme or a `REDIS_MODE` env var enables zero-downtime failover and horizontal Redis scaling without changing any application code.

## Current Situation
`lib/redis.ts`:
```typescript
import Redis from 'ioredis';

let client: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (client) return client;
  if (!process.env.REDIS_URL) return null;
  client = new Redis(process.env.REDIS_URL, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    lazyConnect: false,
  });
  client.on('error', (err) => { /* log */ });
  return client;
}
```

`server.ts` creates two additional Redis connections (pub + sub) for Pub/Sub:
```typescript
redisPub = new Redis(env.REDIS_URL, redisOpts);
redisSub = new Redis(env.REDIS_URL, redisOpts);
```

All three connections use `new Redis(url, opts)` — the standalone mode constructor. If `REDIS_URL` points to a Sentinel sentinel address or a Cluster node, the connection fails silently (the `error` event fires, the rate limiter falls back to in-memory mode, and Pub/Sub messages are not published).

### Managed Redis endpoints that require Sentinel/Cluster
- **AWS ElastiCache with Cluster Mode Enabled**: requires `Redis.Cluster([{host, port}, ...])`.
- **Redis Cloud (Redis Enterprise)**: uses a single Sentinel-exposed endpoint; can also require `Redis.Sentinel([...])`.
- **Upstash Redis**: uses a single HTTPS URL (`rediss://`); standard standalone mode works, but Upstash cluster mode requires their SDK.
- **Render.com Redis**: standalone; current mode works.
- **Railway Redis**: standalone; current mode works.

## Problem with Current Situation
1. **Sentinel failover is not supported**: If the Redis primary fails and Sentinel promotes a replica, the existing connections do not automatically reconnect to the new primary. The application loses rate limiting and Pub/Sub for the duration of the failover (typically 15–30 seconds).
2. **Redis Cluster key hashing is not supported**: In Redis Cluster mode, keys are sharded across nodes by their hash slot. A `KEYS *` command or a Lua script that accesses multiple keys in different slots will fail. The rate-limit Lua script in `proxy.ts` accesses a single key per invocation, so this is safe, but future Redis operations must be aware of the constraint.
3. **No connection mode documentation**: Operators who deploy on managed Redis services with Sentinel enabled cannot configure SketchGit without understanding the ioredis API directly.
4. **Reconnect options differ by mode**: Standalone mode's `retryStrategy` callback does not apply to Sentinel mode (which handles retries internally). The current reconnect configuration is only correct for standalone connections.

## Goal to Achieve
1. Add `REDIS_MODE` env var (`standalone` | `sentinel` | `cluster`, default: `standalone`) to `lib/env.ts`.
2. Add `REDIS_SENTINEL_HOSTS` for Sentinel mode (comma-separated `host:port` pairs) and `REDIS_SENTINEL_NAME` for the master name.
3. Refactor `lib/redis.ts` to create the appropriate ioredis client based on `REDIS_MODE`.
4. Update `server.ts` to use the same mode-aware factory for Pub/Sub connections.
5. Document the configuration for each managed Redis provider in `.env.example`.

## What Needs to Be Done

### 1. Add env vars to `lib/env.ts`
```typescript
REDIS_MODE: z.enum(['standalone', 'sentinel', 'cluster']).default('standalone'),
// Standalone: single Redis URL
REDIS_URL: z.string().url().optional(),
// Sentinel: comma-separated host:port pairs (e.g., "sentinel1:26379,sentinel2:26379")
REDIS_SENTINEL_HOSTS: z.string().optional(),
// Sentinel master name (e.g., "mymaster")
REDIS_SENTINEL_NAME: z.string().default('mymaster'),
// Cluster: comma-separated host:port pairs for cluster nodes
REDIS_CLUSTER_NODES: z.string().optional(),
```

### 2. Create `lib/redis.ts` mode-aware factory
```typescript
import type Redis from 'ioredis';
import type { Cluster } from 'ioredis';

type RedisLike = Redis | Cluster;

let client: RedisLike | null = null;

function parseSentinelHosts(raw: string): Array<{ host: string; port: number }> {
  return raw.split(',').map((entry) => {
    const [host, portStr] = entry.trim().split(':');
    return { host: host ?? 'localhost', port: parseInt(portStr ?? '26379', 10) };
  });
}

function parseClusterNodes(raw: string): Array<{ host: string; port: number }> {
  return raw.split(',').map((entry) => {
    const [host, portStr] = entry.trim().split(':');
    return { host: host ?? 'localhost', port: parseInt(portStr ?? '6379', 10) };
  });
}

export async function createRedisClient(
  mode: 'standalone' | 'sentinel' | 'cluster' = 'standalone',
): Promise<RedisLike | null> {
  const { default: Redis } = await import('ioredis');

  const onError = (err: Error) =>
    console.error('[redis] connection error:', err.message);

  if (mode === 'sentinel') {
    const hostsRaw = process.env.REDIS_SENTINEL_HOSTS;
    if (!hostsRaw) {
      console.warn('[redis] REDIS_MODE=sentinel but REDIS_SENTINEL_HOSTS is not set');
      return null;
    }
    return new Redis({
      sentinels: parseSentinelHosts(hostsRaw),
      name: process.env.REDIS_SENTINEL_NAME ?? 'mymaster',
      enableOfflineQueue: false,
      // Sentinel mode handles automatic reconnection to the promoted primary.
    }).on('error', onError);
  }

  if (mode === 'cluster') {
    const nodesRaw = process.env.REDIS_CLUSTER_NODES;
    if (!nodesRaw) {
      console.warn('[redis] REDIS_MODE=cluster but REDIS_CLUSTER_NODES is not set');
      return null;
    }
    return new Redis.Cluster(parseClusterNodes(nodesRaw), {
      enableOfflineQueue: false,
      redisOptions: { enableReadyCheck: true },
    }).on('error', onError);
  }

  // Default: standalone
  if (!process.env.REDIS_URL) return null;
  return new Redis(process.env.REDIS_URL, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 200, 5_000),
  }).on('error', onError);
}

export function getRedisClient(): RedisLike | null {
  return client;
}

export async function initRedisClient(
  mode: 'standalone' | 'sentinel' | 'cluster' = 'standalone',
): Promise<RedisLike | null> {
  if (!client) {
    client = await createRedisClient(mode);
  }
  return client;
}
```

### 3. Update `server.ts` Pub/Sub connections for Sentinel mode
In Sentinel mode, Pub/Sub connections use the same `sentinels` and `name` configuration. When the primary fails over, Sentinel mode ioredis automatically reconnects to the new primary for Pub/Sub:
```typescript
if (env.REDIS_MODE === 'sentinel') {
  redisPub = new Redis({
    sentinels: parseSentinelHosts(env.REDIS_SENTINEL_HOSTS!),
    name: env.REDIS_SENTINEL_NAME,
  });
  redisSub = new Redis({
    sentinels: parseSentinelHosts(env.REDIS_SENTINEL_HOSTS!),
    name: env.REDIS_SENTINEL_NAME,
  });
} else if (env.REDIS_MODE === 'cluster') {
  // Redis Cluster pub/sub: subscribe must be to the specific slot owner.
  // For simplicity, use cluster-aware pub/sub by creating a Cluster client per connection.
  // Note: Cluster pub/sub with wildcards (PSUBSCRIBE) requires all nodes to
  // support the pattern; use SUBSCRIBE instead of PSUBSCRIBE.
}
```

### 4. Update `.env.example`
```dotenv
# Redis connection mode (default: standalone).
# Options: standalone | sentinel | cluster
# REDIS_MODE=standalone

# Standalone Redis URL (used when REDIS_MODE=standalone):
REDIS_URL=redis://localhost:6379

# Sentinel mode (used when REDIS_MODE=sentinel):
# REDIS_SENTINEL_HOSTS=sentinel1:26379,sentinel2:26379,sentinel3:26379
# REDIS_SENTINEL_NAME=mymaster

# Cluster mode (used when REDIS_MODE=cluster):
# REDIS_CLUSTER_NODES=node1:6379,node2:6379,node3:6379
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `lib/env.ts` | Add `REDIS_MODE`, `REDIS_SENTINEL_HOSTS`, `REDIS_SENTINEL_NAME`, `REDIS_CLUSTER_NODES` |
| `lib/redis.ts` | Refactor to mode-aware factory; add `initRedisClient()` |
| `server.ts` | Use mode-aware factory for Pub/Sub connections |
| `.env.example` | Document all three connection modes |

## Additional Considerations

### Redis Cluster and Pub/Sub
Redis Cluster has a critical limitation for Pub/Sub: `PSUBSCRIBE` (wildcard subscribe, used for cross-room message routing in P012) works differently in Cluster mode. All published messages are broadcast to all cluster nodes that have subscribed clients. This works correctly but means all nodes receive all published messages regardless of key hash slot. For large deployments, consider using a dedicated pub/sub Redis Standalone instance alongside the Cluster instance for key-value operations.

### Lua scripts and Cluster mode
The rate-limit Lua script in `proxy.ts` (`RATE_LIMIT_LUA`) uses a single key (`KEYS[1]`). In Cluster mode, single-key Lua scripts are supported and execute on the node that owns the key's slot. No changes to the Lua script are needed.

### AWS ElastiCache Cluster Mode
ElastiCache with Cluster Mode Enabled requires TLS (`rediss://`) and IAM authentication in some configurations. Add `REDIS_TLS=true` and update the connection options to include `tls: {}` when TLS is required.

### Testing Sentinel mode
A Sentinel test setup requires 3 Redis instances (1 primary + 2 replicas) plus 3 Sentinel processes. This is impractical for unit tests. Test the `parseSentinelHosts` and `parseClusterNodes` utility functions in isolation; test mode selection logic with a mock ioredis constructor.

## Testing Requirements
- `parseSentinelHosts('s1:26379,s2:26379')` returns `[{host:'s1',port:26379},{host:'s2',port:26379}]`.
- `createRedisClient('standalone')` returns a `Redis` instance when `REDIS_URL` is set.
- `createRedisClient('standalone')` returns `null` when `REDIS_URL` is not set.
- `createRedisClient('sentinel')` returns `null` and logs a warning when `REDIS_SENTINEL_HOSTS` is not set.
- `createRedisClient('cluster')` returns `null` and logs a warning when `REDIS_CLUSTER_NODES` is not set.
- `getRedisClient()` returns the singleton after `initRedisClient()`.

## Dependency Map
- Builds on: P012 ✅ (ioredis established), P046 ✅ (Redis rate limiter — Lua script is single-key safe for Cluster)
- Complements: P060 (PgBouncer — both proposals reduce single-points-of-failure in the data layer)
- Independent of: Next.js build, auth, WebSocket protocol
