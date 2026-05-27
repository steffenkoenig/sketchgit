import { expect, test, describe, vi } from 'vitest';

// Mock NextRequest and NextResponse to prevent next/server import error
vi.mock('next/server', () => {
  return {
    NextRequest: class {},
    NextResponse: {
      json: vi.fn(),
      next: vi.fn(),
      redirect: vi.fn(),
    },
  };
});

// Mock auth
vi.mock('@/lib/auth', () => ({
  auth: vi.fn((fn) => fn),
}));

// Mock redis
vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn(() => null),
  resetRedisClient: vi.fn(),
}));

import { config } from '../../../proxy';

describe('Proxy Config', () => {
  test('has correct matcher paths', () => {
    expect(config.matcher).toContain('/dashboard/:path*');
    expect(config.matcher).toContain('/api/auth/register');
    expect(config.matcher).toContain('/api/auth/signin');
    expect(config.matcher.length).toBe(3);
  });
});
