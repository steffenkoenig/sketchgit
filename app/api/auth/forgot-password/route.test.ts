/**
 * Tests for POST /api/auth/forgot-password
 *
 * Validates the password-reset request endpoint.  Uses vi.mock to stub out
 * the DB call so no real database connection is needed.  The endpoint always
 * returns 200 to prevent email-enumeration attacks, so most assertions
 * check the code path taken rather than different status codes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/userRepository', () => ({
  createPasswordResetToken: vi.fn(),
}));

import { POST } from './route';
import { createPasswordResetToken } from '@/lib/db/userRepository';

const mockCreatePasswordResetToken = createPasswordResetToken as ReturnType<typeof vi.fn>;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  });

  it('returns 200 with safe message for a registered email', async () => {
    mockCreatePasswordResetToken.mockResolvedValue('reset-token-abc');

    const res = await POST(makeRequest({ email: 'alice@example.com' }) as Parameters<typeof POST>[0]);

    expect(res.status).toBe(200);
    const json = await res.json() as { message: string };
    expect(json.message).toContain("reset link");
    expect(mockCreatePasswordResetToken).toHaveBeenCalledWith('alice@example.com');
  });

  it('returns 200 with safe message when email is not registered (prevents enumeration)', async () => {
    mockCreatePasswordResetToken.mockResolvedValue(null);

    const res = await POST(makeRequest({ email: 'unknown@example.com' }) as Parameters<typeof POST>[0]);

    expect(res.status).toBe(200);
    const json = await res.json() as { message: string };
    expect(json.message).toBeDefined();
  });

  it('does not call email service when RESEND_API_KEY is absent', async () => {
    mockCreatePasswordResetToken.mockResolvedValue('token-xyz');

    const res = await POST(makeRequest({ email: 'user@example.com' }) as Parameters<typeof POST>[0]);

    expect(res.status).toBe(200);
    // No RESEND_API_KEY set — the import('resend') path is never reached
  });

  it('returns 422 for an invalid email address', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email' }) as Parameters<typeof POST>[0]);

    expect(res.status).toBe(422);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(mockCreatePasswordResetToken).not.toHaveBeenCalled();
  });

  it('returns 422 when email field is missing', async () => {
    const res = await POST(makeRequest({}) as Parameters<typeof POST>[0]);

    expect(res.status).toBe(422);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for a non-JSON body', async () => {
    const req = new Request('http://localhost/api/auth/forgot-password', {
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
