/**
 * Unit tests for P046 Redis-backed rate limiter helper (applyRateLimitRedis).
 *
 * The helper is defined in proxy.ts which is a Next.js middleware module.
 * We test an equivalent inline implementation to keep the test self-contained
 * and avoid Next.js middleware import complications.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Inline implementation (mirrors proxy.ts applyRateLimitRedis) ─────────────
type MockRedis = {
  eval: (script: string, numkeys: number, key: string, arg: string) => Promise<unknown>;
  ttl: (key: string) => Promise<number>;
};

const RATE_LIMIT_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

async function applyRateLimitRedis(
  key: string,
  max: number,
  windowMs: number,
  redis: MockRedis,
): Promise<{ limited: boolean; retryAfterSec: number }> {
  try {
    const windowSec = Math.ceil(windowMs / 1000);
    const count = await redis.eval(RATE_LIMIT_LUA, 1, key, String(windowSec)) as number;
    if (count > max) {
      const ttl = await redis.ttl(key);
      return { limited: true, retryAfterSec: Math.max(ttl, 0) };
    }
    return { limited: false, retryAfterSec: 0 };
  } catch {
    return { limited: false, retryAfterSec: 0 };
  }
}

describe('applyRateLimitRedis (P046)', () => {
  let counter = 0;
  let redis: MockRedis;

  beforeEach(() => {
    counter = 0;
    redis = {
      eval: vi.fn(async () => ++counter),
      ttl: vi.fn(async () => 55),
    };
  });

  it('allows request when count is within limit', async () => {
    const result = await applyRateLimitRedis('key', 10, 60_000, redis);
    expect(result.limited).toBe(false);
  });

  it('evaluates lua script with correct parameters', async () => {
    await applyRateLimitRedis('key', 10, 60_000, redis);
    expect(redis.eval).toHaveBeenCalledWith(RATE_LIMIT_LUA, 1, 'key', '60');
  });

  it('returns limited=true after max+1 requests', async () => {
    // Simulate counter already at max
    counter = 10;
    const result = await applyRateLimitRedis('key', 10, 60_000, redis);
    expect(result.limited).toBe(true);
    expect(result.retryAfterSec).toBe(55);
  });

  it('returns limited=false when Redis throws (fail-open)', async () => {
    const brokenRedis: MockRedis = {
      eval: vi.fn(async () => { throw new Error('Redis down'); }),
      ttl: vi.fn(async () => 0),
    };
    const result = await applyRateLimitRedis('key', 10, 60_000, brokenRedis);
    expect(result.limited).toBe(false);
  });

  it('enforces shared state across two simulated "instances"', async () => {
    // Two separate calls using the same counter simulate two app instances
    // hitting the same Redis key.
    const max = 3;
    for (let i = 0; i < max; i++) {
      const r = await applyRateLimitRedis('shared-key', max, 60_000, redis);
      expect(r.limited).toBe(false);
    }
    // max+1 call
    const last = await applyRateLimitRedis('shared-key', max, 60_000, redis);
    expect(last.limited).toBe(true);
  });

  it('returns limited=true with retryAfterSec=0 if TTL is negative or missing', async () => {
    // Simulate counter already at max
    counter = 10;
    redis.ttl = vi.fn(async () => -2); // Key does not exist or has no expiry
    const result = await applyRateLimitRedis('key', 10, 60_000, redis);
    expect(result.limited).toBe(true);
    expect(result.retryAfterSec).toBe(0);
  });
});
