/**
 * Tests for GET /api/share/[token] (P091)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db/roomRepository', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/db/roomRepository')>();
  return {
    ...mod,
    getShareLinkByToken: vi.fn(),
    consumeShareLink: vi.fn(),
    addRoomMember: vi.fn(),
  };
});
vi.mock('@/lib/server/shareLinkTokens', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/server/shareLinkTokens')>();
  return {
    ...mod,
    verifyShareLinkSignature: vi.fn().mockReturnValue(true),
    signScopeCookie: vi.fn().mockReturnValue('fakecookie'),
  };
});

import { GET } from './route';
import { auth } from '@/lib/auth';
import {
  getShareLinkByToken,
  consumeShareLink,
  addRoomMember,
} from '@/lib/db/roomRepository';
import { NextRequest } from 'next/server';

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockGetShareLinkByToken = getShareLinkByToken as ReturnType<typeof vi.fn>;
const mockConsumeShareLink = consumeShareLink as ReturnType<typeof vi.fn>;
const mockAddRoomMember = addRoomMember as ReturnType<typeof vi.fn>;

const TOKEN = 'a'.repeat(64);
const ROOM_ID = 'room_1';
const SESSION = { user: { id: 'usr_1' } };

function makeRequest(token: string, extra: Record<string, string> = {}) {
  const base = `http://localhost/api/share/${token}`;
  const params = new URLSearchParams({
    roomId: ROOM_ID,
    scope: 'ROOM',
    sig: 's'.repeat(64),
    ...extra,
  });
  return new NextRequest(`${base}?${params.toString()}`);
}

function makeRoomLink(overrides: Partial<{
  roomId: string;
  scope: string;
  permission: string;
  expiresAt: Date | null;
  maxUses: number | null;
  useCount: number;
  branches: string[];
  commitSha: string | null;
  isPublic: boolean;
}> = {}) {
  return {
    id: 'sl_1',
    roomId: ROOM_ID,
    scope: 'ROOM',
    permission: 'VIEW',
    expiresAt: null,
    maxUses: null,
    useCount: 0,
    branches: [],
    commitSha: null,
    room: { isPublic: true },
    ...overrides,
  };
}

describe('GET /api/share/[token] (P091)', () => {
  const params = Promise.resolve({ token: TOKEN });

  beforeEach(() => vi.clearAllMocks());

  it('returns 400 for missing roomId', async () => {
    const req = new NextRequest(`http://localhost/api/share/${TOKEN}?sig=s`);
    const res = await GET(req, { params });
    expect(res.status).toBe(400);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('SHARE_LINK_INVALID');
  });

  it('returns 404 when token not found in DB', async () => {
    mockGetShareLinkByToken.mockResolvedValue(null);
    const res = await GET(makeRequest(TOKEN), { params });
    expect(res.status).toBe(404);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('SHARE_LINK_INVALID');
  });

  it('returns 410 when link is expired', async () => {
    mockGetShareLinkByToken.mockResolvedValue(
      makeRoomLink({ expiresAt: new Date(Date.now() - 1000) }),
    );
    const res = await GET(makeRequest(TOKEN), { params });
    expect(res.status).toBe(410);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('SHARE_LINK_EXPIRED');
  });

  it('returns 410 when link is exhausted', async () => {
    mockGetShareLinkByToken.mockResolvedValue(
      makeRoomLink({ maxUses: 1, useCount: 1 }),
    );
    const res = await GET(makeRequest(TOKEN), { params });
    expect(res.status).toBe(410);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('SHARE_LINK_EXHAUSTED');
  });

  it('returns 410 when consumeShareLink returns false (race condition)', async () => {
    mockGetShareLinkByToken.mockResolvedValue(makeRoomLink());
    mockConsumeShareLink.mockResolvedValue(false);
    mockAuth.mockResolvedValue(SESSION);
    const res = await GET(makeRequest(TOKEN), { params });
    expect(res.status).toBe(410);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('SHARE_LINK_EXHAUSTED');
  });

  it('redirects to room URL for a valid ROOM-scoped link', async () => {
    mockGetShareLinkByToken.mockResolvedValue(makeRoomLink());
    mockConsumeShareLink.mockResolvedValue(true);
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest(TOKEN), { params });
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain(`/?room=${ROOM_ID}`);
  });

  it('sets sketchgit_share_scope cookie on success', async () => {
    mockGetShareLinkByToken.mockResolvedValue(makeRoomLink());
    mockConsumeShareLink.mockResolvedValue(true);
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest(TOKEN), { params });
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('sketchgit_share_scope=');
  });

  it('redirects to commit URL for COMMIT-scoped link', async () => {
    const sha = 'c'.repeat(64);
    mockGetShareLinkByToken.mockResolvedValue(
      makeRoomLink({ scope: 'COMMIT', commitSha: sha }),
    );
    mockConsumeShareLink.mockResolvedValue(true);
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest(TOKEN, { scope: 'COMMIT' }), { params });
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain(`commit=${sha}`);
    expect(location).toContain('readonly=1');
  });

  it('redirects to branch URL for BRANCH-scoped link', async () => {
    mockGetShareLinkByToken.mockResolvedValue(
      makeRoomLink({ scope: 'BRANCH', branches: ['feature/x', 'main'] }),
    );
    mockConsumeShareLink.mockResolvedValue(true);
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest(TOKEN, { scope: 'BRANCH' }), { params });
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('branch=feature%2Fx');
  });

  it('upserts membership for authenticated user with ROOM + WRITE permission', async () => {
    mockGetShareLinkByToken.mockResolvedValue(
      makeRoomLink({ permission: 'WRITE' }),
    );
    mockConsumeShareLink.mockResolvedValue(true);
    mockAuth.mockResolvedValue(SESSION);
    mockAddRoomMember.mockResolvedValue(undefined);

    await GET(makeRequest(TOKEN), { params });
    expect(mockAddRoomMember).toHaveBeenCalledWith(ROOM_ID, 'usr_1', 'COMMITTER');
  });

  it('does NOT upsert membership for VIEW-only links', async () => {
    mockGetShareLinkByToken.mockResolvedValue(makeRoomLink({ permission: 'VIEW' }));
    mockConsumeShareLink.mockResolvedValue(true);
    mockAuth.mockResolvedValue(SESSION);

    await GET(makeRequest(TOKEN), { params });
    expect(mockAddRoomMember).not.toHaveBeenCalled();
  });

  it('does NOT upsert membership for BRANCH-scoped links', async () => {
    mockGetShareLinkByToken.mockResolvedValue(
      makeRoomLink({ scope: 'BRANCH', branches: ['main'], permission: 'WRITE' }),
    );
    mockConsumeShareLink.mockResolvedValue(true);
    mockAuth.mockResolvedValue(SESSION);

    await GET(makeRequest(TOKEN, { scope: 'BRANCH' }), { params });
    expect(mockAddRoomMember).not.toHaveBeenCalled();
  });

  it('redirects unauthenticated user to sign-in for private ROOM link', async () => {
    mockGetShareLinkByToken.mockResolvedValue(
      makeRoomLink({ permission: 'WRITE', room: { isPublic: false } }),
    );
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest(TOKEN), { params });
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/auth/signin');
  });
});
