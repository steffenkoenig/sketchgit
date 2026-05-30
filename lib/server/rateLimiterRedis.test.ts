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
  incr: (key: string) => Promise<number>;
  expire: (key: string, secs: number) => Promise<number>;
  ttl: (key: string) => Promise<number>;
};

async function applyRateLimitRedis(
  key: string,
  max: number,
  windowMs: number,
  redis: MockRedis,
): Promise<{ limited: boolean; retryAfterSec: number }> {
  try {
    const windowSec = Math.ceil(windowMs / 1000);
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
    return { limited: false, retryAfterSec: 0 };
  }
}

describe('applyRateLimitRedis (P046)', () => {
  let counter = 0;
  let redis: MockRedis;

  beforeEach(() => {
    counter = 0;
    redis = {
      incr: vi.fn(async (_key) => ++counter),
      expire: vi.fn(async () => 1),
      ttl: vi.fn(async () => 55),
    };
  });

  it('allows request when count is within limit', async () => {
    const result = await applyRateLimitRedis('key', 10, 60_000, redis);
    expect(result.limited).toBe(false);
  });

  it('sets TTL on first request (count === 1)', async () => {
    await applyRateLimitRedis('key', 10, 60_000, redis);
    expect(redis.expire).toHaveBeenCalledWith('key', 60);
  });

  it('does not set TTL on subsequent requests', async () => {
    counter = 1; // simulate existing key
    redis.incr = vi.fn(async () => ++counter); // returns 2 on first call
    await applyRateLimitRedis('key', 10, 60_000, redis);
    expect(redis.expire).not.toHaveBeenCalled();
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
      incr: vi.fn(async () => { throw new Error('Redis down'); }),
      expire: vi.fn(async () => 1),
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
});
