/**
 * Tests for GET /api/invitations/[token]
 *
 * Validates the invitation-token consumption endpoint (P066).
 * Uses vi.mock to stub auth, roomRepository, and invitationTokens so no real
 * database or HMAC key is needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/authTypes', () => ({
  getAuthSession: vi.fn(),
}));
vi.mock('@/lib/db/roomRepository', () => ({
  getInvitationByToken: vi.fn(),
  consumeInvitationToken: vi.fn(),
  addRoomMember: vi.fn(),
}));
vi.mock('@/lib/server/invitationTokens', () => ({
  verifyInvitationSignature: vi.fn(),
}));

import { GET } from './route';
import { auth } from '@/lib/auth';
import { getAuthSession } from '@/lib/authTypes';
import {
  getInvitationByToken,
  consumeInvitationToken,
  addRoomMember,
} from '@/lib/db/roomRepository';
import { verifyInvitationSignature } from '@/lib/server/invitationTokens';
import { NextRequest } from 'next/server';

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockGetAuthSession = getAuthSession as ReturnType<typeof vi.fn>;
const mockGetInvitationByToken = getInvitationByToken as ReturnType<typeof vi.fn>;
const mockConsumeInvitationToken = consumeInvitationToken as ReturnType<typeof vi.fn>;
const mockAddRoomMember = addRoomMember as ReturnType<typeof vi.fn>;
const mockVerifyInvitationSignature = verifyInvitationSignature as ReturnType<typeof vi.fn>;

const TOKEN = 'a'.repeat(64);
const ROOM_ID = 'room_1';
const EXP = Date.now() + 3_600_000;
const SIG = 's'.repeat(64);

function makeRequest(token: string, params: Record<string, string> = {}) {
  const url = new URL(`http://localhost/api/invitations/${token}`);
  url.searchParams.set('roomId', params.roomId ?? ROOM_ID);
  url.searchParams.set('exp', params.exp ?? String(EXP));
  url.searchParams.set('sig', params.sig ?? SIG);
  return new NextRequest(url.toString());
}

const VALID_INVITATION = {
  roomId: ROOM_ID,
  expiresAt: new Date(Date.now() + 86_400_000),
  maxUses: 5,
  useCount: 0,
  room: { isPublic: true },
};

describe('GET /api/invitations/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyInvitationSignature.mockReturnValue(true);
    mockGetInvitationByToken.mockResolvedValue(VALID_INVITATION);
    mockConsumeInvitationToken.mockResolvedValue(true);
    mockAuth.mockResolvedValue(null);
    mockGetAuthSession.mockReturnValue(null);
  });

  // ── Missing / malformed query params ─────────────────────────────────────────

  it('returns 400 when roomId is missing', async () => {
    const url = new URL(`http://localhost/api/invitations/${TOKEN}`);
    url.searchParams.set('exp', String(EXP));
    url.searchParams.set('sig', SIG);
    const res = await GET(new NextRequest(url.toString()), { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(400);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('INVITATION_INVALID');
  });

  it('returns 400 when exp is not a number', async () => {
    const url = new URL(`http://localhost/api/invitations/${TOKEN}`);
    url.searchParams.set('roomId', ROOM_ID);
    url.searchParams.set('exp', 'not-a-number');
    url.searchParams.set('sig', SIG);
    const res = await GET(new NextRequest(url.toString()), { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(400);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('INVITATION_INVALID');
  });

  // ── Signature validation ──────────────────────────────────────────────────────

  it('returns 400 when the HMAC signature is invalid', async () => {
    mockVerifyInvitationSignature.mockReturnValue(false);
    const res = await GET(makeRequest(TOKEN), { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(400);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('INVITATION_INVALID');
  });

  // ── Database lookup failures ──────────────────────────────────────────────────

  it('returns 404 when the invitation is not found in the database', async () => {
    mockGetInvitationByToken.mockResolvedValue(null);
    const res = await GET(makeRequest(TOKEN), { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(404);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('INVITATION_INVALID');
  });

  it('returns 404 when the invitation roomId does not match', async () => {
    mockGetInvitationByToken.mockResolvedValue({ ...VALID_INVITATION, roomId: 'other_room' });
    const res = await GET(makeRequest(TOKEN), { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(404);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('INVITATION_INVALID');
  });

  it('returns 410 for an expired invitation', async () => {
    mockGetInvitationByToken.mockResolvedValue({
      ...VALID_INVITATION,
      expiresAt: new Date(Date.now() - 1000),
    });
    const res = await GET(makeRequest(TOKEN), { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(410);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('INVITATION_EXPIRED');
  });

  it('returns 410 when the invitation has reached its use limit', async () => {
    mockGetInvitationByToken.mockResolvedValue({
      ...VALID_INVITATION,
      useCount: 5,
      maxUses: 5,
    });
    const res = await GET(makeRequest(TOKEN), { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(410);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('INVITATION_EXHAUSTED');
  });

  // ── Public room ──────────────────────────────────────────────────────────────

  it('redirects to the room after consuming the token for a public room', async () => {
    const res = await GET(makeRequest(TOKEN), { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain(`room=${encodeURIComponent(ROOM_ID)}`);
    expect(mockConsumeInvitationToken).toHaveBeenCalledWith(TOKEN, VALID_INVITATION.maxUses);
    expect(mockAddRoomMember).not.toHaveBeenCalled();
  });

  // ── Private room ─────────────────────────────────────────────────────────────

  it('redirects to sign-in for an unauthenticated user accessing a private room', async () => {
    mockGetInvitationByToken.mockResolvedValue({ ...VALID_INVITATION, room: { isPublic: false } });
    mockGetAuthSession.mockReturnValue(null);

    const res = await GET(makeRequest(TOKEN), { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/auth/signin');
    expect(mockConsumeInvitationToken).not.toHaveBeenCalled();
  });

  it('adds the authenticated user as a member and redirects for a private room', async () => {
    mockGetInvitationByToken.mockResolvedValue({ ...VALID_INVITATION, room: { isPublic: false } });
    const session = { user: { id: 'usr_1' } };
    mockAuth.mockResolvedValue(session);
    mockGetAuthSession.mockReturnValue(session);

    const res = await GET(makeRequest(TOKEN), { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain(`room=${encodeURIComponent(ROOM_ID)}`);
    expect(mockAddRoomMember).toHaveBeenCalledWith(ROOM_ID, 'usr_1', 'EDITOR');
    expect(mockConsumeInvitationToken).toHaveBeenCalled();
  });

  // ── Race condition ────────────────────────────────────────────────────────────

  it('returns 410 when a concurrent request already consumed the last use', async () => {
    mockConsumeInvitationToken.mockResolvedValue(false);
    const res = await GET(makeRequest(TOKEN), { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(410);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('INVITATION_EXHAUSTED');
  });
});
