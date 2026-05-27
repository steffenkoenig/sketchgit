import { describe, it, expect, vi, beforeEach } from 'vitest';
import proxyMiddleware from './proxy';
import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: vi.fn((handler) => handler),
}));

vi.mock('next/server', () => {
  return {
    NextRequest: vi.fn(),
    NextResponse: {
      next: vi.fn(() => ({
        headers: new Headers(),
      })),
      redirect: vi.fn(),
      json: vi.fn((body, options) => ({ body, options })),
    },
  };
});

vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn(),
}));

vi.mock('@/lib/server/csp', () => ({
  buildCsp: vi.fn(() => 'csp-header'),
}));

vi.mock('node:crypto', () => ({
  randomBytes: vi.fn(() => ({
    toString: vi.fn(() => 'mocked-nonce'),
  })),
}));

describe('proxy.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DISABLE_RATE_LIMIT = "false";
  });

  // Basic mock request
  const createMockReq = (pathname = '/api/auth/signin', ip = '127.0.0.1') => {
    return {
      nextUrl: {
        pathname,
        origin: 'http://localhost:3000',
        href: 'http://localhost:3000' + pathname,
      },
      headers: new Headers({
        'x-forwarded-for': ip,
      }),
    } as unknown as NextRequest;
  };

  describe('Rate Limiting Error Paths (fail-open)', () => {
    it('should fail-open and return next() when redis.eval throws an exception', async () => {
      vi.mocked(getRedisClient).mockReturnValue({
        eval: vi.fn().mockRejectedValue(new Error('Redis EVAL error')),
        ttl: vi.fn().mockResolvedValue(55),
      } as any);

      const req = createMockReq();
      const response = await proxyMiddleware(req, {} as any);

      // Expected to allow traffic since it should fail-open
      expect(response).toBeDefined();
      expect(vi.mocked(NextResponse.next)).toHaveBeenCalled();
    });

    it('should fail-open and return next() when redis.ttl throws an exception', async () => {
      // Simulate a scenario where eval succeeds but ttl throws
      vi.mocked(getRedisClient).mockReturnValue({
        eval: vi.fn().mockResolvedValue(100), // Exceeds max (10)
        ttl: vi.fn().mockRejectedValue(new Error('Redis TTL error')),
      } as any);

      const req = createMockReq();
      const response = await proxyMiddleware(req, {} as any);

      // Expected to allow traffic since it should fail-open
      expect(response).toBeDefined();
      expect(vi.mocked(NextResponse.next)).toHaveBeenCalled();
    });
  });
});
