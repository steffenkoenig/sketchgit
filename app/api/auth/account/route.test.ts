import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db/userRepository', () => ({
  verifyCredentials: vi.fn(),
  getUserForAccountDeletion: vi.fn(),
  getGitHubAccountToken: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock('@/lib/server/oauthTokenRevocation', () => ({
  revokeGitHubToken: vi.fn(),
}));

import { DELETE } from './route';
import { auth } from '@/lib/auth';
import { verifyCredentials, getUserForAccountDeletion, getGitHubAccountToken, deleteUser } from '@/lib/db/userRepository';
import { revokeGitHubToken } from '@/lib/server/oauthTokenRevocation';
import { NextRequest } from 'next/server';
import { makeUser, makeOAuthUser } from '@/lib/test/factories';

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockGetUser = getUserForAccountDeletion as ReturnType<typeof vi.fn>;
const mockGetGitHubToken = getGitHubAccountToken as ReturnType<typeof vi.fn>;
const mockDeleteUser = deleteUser as ReturnType<typeof vi.fn>;
const mockVerify = verifyCredentials as ReturnType<typeof vi.fn>;
const mockRevoke = revokeGitHubToken as ReturnType<typeof vi.fn>;

function makeRequest(body?: object) {
  const req = new NextRequest('http://localhost/api/auth/account', {
    method: 'DELETE',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return req;
}

const SESSION = { user: { id: 'usr_1' } };
const OAUTH_USER = makeOAuthUser({ id: 'usr_1', email: 'alice@example.com' });
const CREDENTIALS_USER = makeUser({ id: 'usr_1', email: 'alice@example.com', passwordHash: '$2b$12$hash' });

describe('DELETE /api/auth/account (P041)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGitHubToken.mockResolvedValue(null);
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(makeRequest());
    expect(res.status).toBe(401);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('UNAUTHENTICATED');
  });

  it('allows OAuth-only user to delete without password', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockGetUser.mockResolvedValue(OAUTH_USER);
    mockDeleteUser.mockResolvedValue(undefined);
    const res = await DELETE(makeRequest());
    expect(res.status).toBe(200);
    expect(mockDeleteUser).toHaveBeenCalledWith('usr_1');
  });

  it('returns 400 when credentials user omits password', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockGetUser.mockResolvedValue(CREDENTIALS_USER);
    const res = await DELETE(makeRequest());
    expect(res.status).toBe(400);
    expect(mockDeleteUser).not.toHaveBeenCalled();
    const json = await res.json() as { code: string };
    expect(json.code).toBe('PASSWORD_REQUIRED');
  });

  it('returns 403 when credentials user provides wrong password', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockGetUser.mockResolvedValue(CREDENTIALS_USER);
    mockVerify.mockResolvedValue(null);
    const res = await DELETE(makeRequest({ password: 'WrongPassword123!' }));
    expect(res.status).toBe(403);
    expect(mockDeleteUser).not.toHaveBeenCalled();
    const json = await res.json() as { code: string };
    expect(json.code).toBe('INVALID_CREDENTIALS');
  });

  it('deletes credentials user with correct password', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockGetUser.mockResolvedValue(CREDENTIALS_USER);
    mockVerify.mockResolvedValue({ id: 'usr_1', email: 'alice@example.com', name: null, image: null, createdAt: new Date() });
    mockDeleteUser.mockResolvedValue(undefined);
    const res = await DELETE(makeRequest({ password: 'CorrectPassword123!' }));
    expect(res.status).toBe(200);
    expect(mockDeleteUser).toHaveBeenCalledWith('usr_1');
  });

  it('clears session cookies in the response', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockGetUser.mockResolvedValue(OAUTH_USER);
    mockDeleteUser.mockResolvedValue(undefined);
    const res = await DELETE(makeRequest());
    // Headers.getSetCookie returns the Set-Cookie header values
    const setCookieHeader = res.headers.get('set-cookie') ?? '';
    expect(setCookieHeader).toContain('authjs.session-token');
  });

  describe('GAP-014 — GitHub OAuth token revocation on deletion', () => {
    it('revokes a linked GitHub token before deleting the user', async () => {
      mockAuth.mockResolvedValue(SESSION);
      mockGetUser.mockResolvedValue(OAUTH_USER);
      mockGetGitHubToken.mockResolvedValue('decrypted-gh-token');
      mockDeleteUser.mockResolvedValue(undefined);

      const res = await DELETE(makeRequest());

      expect(res.status).toBe(200);
      expect(mockRevoke).toHaveBeenCalledWith('decrypted-gh-token');
      // Revocation must happen before the user (and cascaded Account row) is gone.
      expect(mockRevoke.mock.invocationCallOrder[0]).toBeLessThan(mockDeleteUser.mock.invocationCallOrder[0]);
    });

    it('does not call revoke when the user never linked GitHub', async () => {
      mockAuth.mockResolvedValue(SESSION);
      mockGetUser.mockResolvedValue(OAUTH_USER);
      mockGetGitHubToken.mockResolvedValue(null);
      mockDeleteUser.mockResolvedValue(undefined);

      const res = await DELETE(makeRequest());

      expect(res.status).toBe(200);
      expect(mockRevoke).not.toHaveBeenCalled();
    });

    it('still deletes the account when GitHub revocation rejects', async () => {
      mockAuth.mockResolvedValue(SESSION);
      mockGetUser.mockResolvedValue(OAUTH_USER);
      mockGetGitHubToken.mockResolvedValue('decrypted-gh-token');
      mockRevoke.mockRejectedValue(new Error('GitHub API unreachable'));
      mockDeleteUser.mockResolvedValue(undefined);

      const res = await DELETE(makeRequest());

      expect(res.status).toBe(200);
      expect(mockDeleteUser).toHaveBeenCalledWith('usr_1');
    });
  });
});
