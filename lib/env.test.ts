import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateEnv } from './env';

describe('validateEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns a parsed env object when all required variables are present', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.AUTH_SECRET = 'a-secret-that-is-at-least-32-chars-long';
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    delete process.env.SKIP_ENV_VALIDATION;

    const env = validateEnv();
    expect(env.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/db');
    expect(env.AUTH_SECRET).toBe('a-secret-that-is-at-least-32-chars-long');
    expect(env.NEXTAUTH_URL).toBe('http://localhost:3000');
    expect(env.PORT).toBe(3000);
    expect(env.RATE_LIMIT_MAX).toBe(10);
    expect(env.RATE_LIMIT_WINDOW).toBe(60);
    expect(env.PRESENCE_DEBOUNCE_MS).toBe(80);
  });

  it('applies defaults for optional numeric fields', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.AUTH_SECRET = 'a-secret-that-is-at-least-32-chars-long';
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    delete process.env.PORT;
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.PRESENCE_DEBOUNCE_MS;
    delete process.env.SKIP_ENV_VALIDATION;

    const env = validateEnv();
    expect(env.PORT).toBe(3000);
    expect(env.RATE_LIMIT_MAX).toBe(10);
    expect(env.PRESENCE_DEBOUNCE_MS).toBe(80);
  });

  it('accepts a custom PRESENCE_DEBOUNCE_MS value', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.AUTH_SECRET = 'a-secret-that-is-at-least-32-chars-long';
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    process.env.PRESENCE_DEBOUNCE_MS = '200';
    delete process.env.SKIP_ENV_VALIDATION;

    const env = validateEnv();
    expect(env.PRESENCE_DEBOUNCE_MS).toBe(200);
  });

  it('exits with code 1 when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    process.env.AUTH_SECRET = 'a-secret-that-is-at-least-32-chars-long';
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    delete process.env.SKIP_ENV_VALIDATION;

    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    expect(() => validateEnv()).toThrow('process.exit called');
    expect(exit).toHaveBeenCalledWith(1);
    exit.mockRestore();
  });

  it('exits with code 1 when AUTH_SECRET is too short', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.AUTH_SECRET = 'tooshort';
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    delete process.env.SKIP_ENV_VALIDATION;

    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    expect(() => validateEnv()).toThrow('process.exit called');
    expect(exit).toHaveBeenCalledWith(1);
    exit.mockRestore();
  });

  it('bypasses validation when SKIP_ENV_VALIDATION is true', () => {
    delete process.env.DATABASE_URL;
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_URL;
    process.env.SKIP_ENV_VALIDATION = 'true';

    // Should not throw or call process.exit
    expect(() => validateEnv()).not.toThrow();
  });
});
