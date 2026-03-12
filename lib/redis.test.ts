/**
 * P075 – Tests for the mode-aware Redis client factory in lib/redis.ts.
 *
 * We mock ioredis entirely so no real Redis connection is made.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// ── ioredis mock (hoisted so vi.mock factory can reference it) ────────────────

const mocks = vi.hoisted(() => {
  const instance = { on: vi.fn(), disconnect: vi.fn() };
  class MockRedis {
    static Cluster = class { constructor(..._args: unknown[]) { return instance; } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_url?: unknown, _opts?: unknown) { return instance as any; }
    on = instance.on;
    disconnect = instance.disconnect;
  }
  return { instance, MockRedis };
});

vi.mock('ioredis', () => ({ default: mocks.MockRedis }));

// ── helpers ───────────────────────────────────────────────────────────────────

async function freshClient(): Promise<typeof import('./redis')> {
  vi.resetModules();
  vi.mock('ioredis', () => ({ default: mocks.MockRedis }));
  return import('./redis');
}

afterEach(() => {
  delete process.env.REDIS_MODE;
  delete process.env.REDIS_URL;
  delete process.env.REDIS_SENTINEL_HOSTS;
  delete process.env.REDIS_SENTINEL_NAME;
  delete process.env.REDIS_CLUSTER_NODES;
});

describe('P075 getRedisClient()', () => {
  it('returns null in standalone mode when REDIS_URL is not set', async () => {
    const { getRedisClient } = await freshClient();
    expect(getRedisClient()).toBeNull();
  });

  it('returns a client in standalone mode when REDIS_URL is set', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const { getRedisClient } = await freshClient();
    const client = getRedisClient();
    expect(client).not.toBeNull();
  });

  it('returns null in sentinel mode when REDIS_SENTINEL_HOSTS is not set', async () => {
    process.env.REDIS_MODE = 'sentinel';
    const { getRedisClient } = await freshClient();
    expect(getRedisClient()).toBeNull();
  });

  it('returns a client in sentinel mode when REDIS_SENTINEL_HOSTS is set', async () => {
    process.env.REDIS_MODE = 'sentinel';
    process.env.REDIS_SENTINEL_HOSTS = 'sentinel1:26379,sentinel2:26379';
    const { getRedisClient } = await freshClient();
    const client = getRedisClient();
    expect(client).not.toBeNull();
  });

  it('returns null in cluster mode when REDIS_CLUSTER_NODES is not set', async () => {
    process.env.REDIS_MODE = 'cluster';
    const { getRedisClient } = await freshClient();
    expect(getRedisClient()).toBeNull();
  });

  it('returns a non-null client in cluster mode when REDIS_CLUSTER_NODES is set', async () => {
    process.env.REDIS_MODE = 'cluster';
    process.env.REDIS_CLUSTER_NODES = 'node1:6379,node2:6379';
    const { getRedisClient } = await freshClient();
    const client = getRedisClient();
    expect(client).not.toBeNull();
  });

  it('resetRedisClient() allows a fresh client to be created', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const { getRedisClient, resetRedisClient } = await freshClient();
    const first = getRedisClient();
    resetRedisClient();
    const second = getRedisClient();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
  });
});
