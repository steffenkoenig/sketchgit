/**
 * P046 – Shared ioredis client singleton.
 * P075 – Extended to support standalone, Sentinel, and Cluster modes.
 *
 * Connection mode is selected by REDIS_MODE (default: standalone):
 *   standalone – connects to REDIS_URL directly (default, unchanged behaviour)
 *   sentinel   – connects via Redis Sentinel HA using REDIS_SENTINEL_HOSTS
 *                (comma-separated "host:port" pairs) and REDIS_SENTINEL_NAME
 *   cluster    – connects to Redis Cluster using REDIS_CLUSTER_NODES
 *                (comma-separated "host:port" pairs)
 *
 * Returns null when no Redis is configured, allowing graceful fallback to
 * in-memory rate limiting and single-instance presence.
 */
import Redis, { type Cluster } from 'ioredis';

export type RedisLike = Redis | Cluster;

/** Parse a comma-separated "host:port" string into ioredis node objects. */
function parseNodes(csv: string): Array<{ host: string; port: number }> {
  return csv.split(',').map((entry) => {
    const trimmed = entry.trim();
    const lastColon = trimmed.lastIndexOf(':');
    if (lastColon === -1) return { host: trimmed, port: 6379 };
    return {
      host: trimmed.slice(0, lastColon),
      port: parseInt(trimmed.slice(lastColon + 1), 10) || 6379,
    };
  });
}

let _client: RedisLike | null = null;

export function getRedisClient(): RedisLike | null {
  if (_client) return _client;

  const mode = process.env.REDIS_MODE ?? 'standalone';

  const baseOpts = {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  };

  if (mode === 'sentinel') {
    const hostsEnv = process.env.REDIS_SENTINEL_HOSTS;
    if (!hostsEnv) return null;
    const sentinels = parseNodes(hostsEnv);
    const name = process.env.REDIS_SENTINEL_NAME ?? 'mymaster';
    _client = new Redis({ sentinels, name, ...baseOpts });
  } else if (mode === 'cluster') {
    const nodesEnv = process.env.REDIS_CLUSTER_NODES;
    if (!nodesEnv) return null;
    const nodes = parseNodes(nodesEnv);
    _client = new Redis.Cluster(nodes, {
      redisOptions: baseOpts,
      // Cluster mode: commands fail immediately on error (no indefinite queue)
      clusterRetryStrategy: (times: number) => Math.min(times * 100, 2000),
    });
  } else {
    // standalone (default)
    if (!process.env.REDIS_URL) return null;
    _client = new Redis(process.env.REDIS_URL, baseOpts);
  }

  // Suppress unhandled-error events; Redis outages are handled per-command.
  _client.on('error', () => {});
  return _client;
}

/** Disconnect and reset the singleton (used in tests). */
export function resetRedisClient(): void {
  if (_client) {
    _client.disconnect();
    _client = null;
  }
}
