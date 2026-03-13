/**
 * Tests for POST /api/auth/reset-password
 *
 * Validates the password-reset consumption endpoint.  Uses vi.mock to stub
 * the DB call so no real database connection is needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/userRepository', () => ({
  resetPassword: vi.fn(),
}));

import { POST } from './route';
import { resetPassword } from '@/lib/db/userRepository';

const mockResetPassword = resetPassword as ReturnType<typeof vi.fn>;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 on a valid token and password', async () => {
    mockResetPassword.mockResolvedValue(true);

    const res = await POST(makeRequest({
      token: 'a'.repeat(64),
      password: 'newsecurepass123',
    }) as Parameters<typeof POST>[0]);

    expect(res.status).toBe(200);
    const json = await res.json() as { message: string };
    expect(json.message).toContain('Password updated');
    expect(mockResetPassword).toHaveBeenCalledWith('a'.repeat(64), 'newsecurepass123');
  });

  it('returns 400 with INVALID_RESET_TOKEN for an invalid or expired token', async () => {
    mockResetPassword.mockResolvedValue(false);

    const res = await POST(makeRequest({
      token: 'bad-token',
      password: 'newsecurepass123',
    }) as Parameters<typeof POST>[0]);

    expect(res.status).toBe(400);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('INVALID_RESET_TOKEN');
  });

  it('returns 422 when password is shorter than 12 characters', async () => {
    const res = await POST(makeRequest({
      token: 'some-token',
      password: 'short',
    }) as Parameters<typeof POST>[0]);

    expect(res.status).toBe(422);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it('returns 422 when token field is missing', async () => {
    const res = await POST(makeRequest({
      password: 'newsecurepass123',
    }) as Parameters<typeof POST>[0]);

    expect(res.status).toBe(422);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for a non-JSON body', async () => {
    const req = new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not json',
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('INVALID_JSON');
  });
});
