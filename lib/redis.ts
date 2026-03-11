/**
 * P046 – Shared ioredis client singleton.
 *
 * Exports `getRedisClient()` which returns the lazily-created ioredis instance
 * when REDIS_URL is configured, or null for single-instance deployments.
 *
 * This module lives in `lib/` so it can be imported from both `server.ts`
 * (WebSocket pub/sub) and `proxy.ts` (rate limiting middleware) without
 * creating a second connection.
 *
 * Design choices:
 * - `enableOfflineQueue: false` — commands fail immediately when Redis is
 *   unavailable rather than queuing indefinitely.
 * - `maxRetriesPerRequest: 1` — one retry on transient errors; fail-fast
 *   thereafter so the rate-limiter can fall back to in-memory gracefully.
 * - `on('error', () => {})` — suppress unhandled-error events so a Redis
 *   outage does not crash the process.
 */
import Redis from 'ioredis';

let _client: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (_client) return _client;

  _client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
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
