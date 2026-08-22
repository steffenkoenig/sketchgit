/**
 * Tests for POST/GET /api/rooms/[roomId]/unlock (P093)
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/authTypes', () => ({ getAuthSession: vi.fn() }));
vi.mock('@/lib/db/roomRepository', () => ({
  getRoomPasswordHash: vi.fn(),
}));
vi.mock('@/lib/passwordHashing', () => ({
  verifyPasswordHash: vi.fn(),
}));

import { POST, GET } from './route';
import { auth } from '@/lib/auth';
import { getAuthSession } from '@/lib/authTypes';
import { getRoomPasswordHash } from '@/lib/db/roomRepository';
import { verifyPasswordHash } from '@/lib/passwordHashing';
import { hasValidRoomUnlock, ROOM_UNLOCK_COOKIE_NAME } from '@/lib/server/roomPasswordCookie';

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockGetAuthSession = getAuthSession as ReturnType<typeof vi.fn>;
const mockGetRoomPasswordHash = getRoomPasswordHash as ReturnType<typeof vi.fn>;
const mockVerifyPasswordHash = verifyPasswordHash as ReturnType<typeof vi.fn>;

const PARAMS = Promise.resolve({ roomId: 'room-1' });

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-auth-secret-that-is-at-least-32-chars';
});

function makePostReq(password: unknown, cookie?: string) {
  return new NextRequest('http://localhost/api/rooms/room-1/unlock', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify({ password }),
  });
}

function makeGetReq(cookie?: string) {
  return new NextRequest('http://localhost/api/rooms/room-1/unlock', {
    headers: cookie ? { Cookie: cookie } : {},
  });
}

describe('POST /api/rooms/[roomId]/unlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(null);
    mockGetAuthSession.mockReturnValue(null);
  });

  it('returns 400 for invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/rooms/room-1/unlock', { method: 'POST', body: 'not json' });
    const res = await POST(req, { params: PARAMS });
    expect(res.status).toBe(400);
  });

  it('returns 422 for an empty password', async () => {
    const res = await POST(makePostReq(''), { params: PARAMS });
    expect(res.status).toBe(422);
  });

  it('returns 404 when the room does not exist', async () => {
    mockGetRoomPasswordHash.mockResolvedValue(null);
    const res = await POST(makePostReq('guess'), { params: PARAMS });
    expect(res.status).toBe(404);
  });

  it('returns 400 when the room has no password set', async () => {
    mockGetRoomPasswordHash.mockResolvedValue({ passwordHash: null, ownerId: null });
    const res = await POST(makePostReq('guess'), { params: PARAMS });
    expect(res.status).toBe(400);
  });

  it('returns 401 for an incorrect password', async () => {
    mockGetRoomPasswordHash.mockResolvedValue({ passwordHash: 'hash123', ownerId: null });
    mockVerifyPasswordHash.mockResolvedValue(false);
    const res = await POST(makePostReq('wrong'), { params: PARAMS });
    expect(res.status).toBe(401);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('ROOM_PASSWORD_INCORRECT');
  });

  it('sets a signed unlock cookie and returns 200 for a correct password', async () => {
    mockGetRoomPasswordHash.mockResolvedValue({ passwordHash: 'hash123', ownerId: null });
    mockVerifyPasswordHash.mockResolvedValue(true);
    const res = await POST(makePostReq('correct'), { params: PARAMS });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(ROOM_UNLOCK_COOKIE_NAME);
    expect(setCookie).toContain('HttpOnly');

    // Extract the cookie value and confirm it actually grants access.
    const match = new RegExp(`${ROOM_UNLOCK_COOKIE_NAME}=([^;]+)`).exec(setCookie);
    expect(match).not.toBeNull();
    expect(hasValidRoomUnlock(decodeURIComponent(match![1]), 'room-1')).toBe(true);
  });

  it('merges with an existing unlock cookie rather than replacing it', async () => {
    mockGetRoomPasswordHash.mockResolvedValue({ passwordHash: 'hash123', ownerId: null });
    mockVerifyPasswordHash.mockResolvedValue(true);

    // Simulate an existing cookie unlocking a different room.
    const { grantRoomUnlock } = await import('@/lib/server/roomPasswordCookie');
    const existing = grantRoomUnlock(undefined, 'other-room');

    const res = await POST(makePostReq('correct', `${ROOM_UNLOCK_COOKIE_NAME}=${existing}`), { params: PARAMS });
    const setCookie = res.headers.get('set-cookie') ?? '';
    const match = new RegExp(`${ROOM_UNLOCK_COOKIE_NAME}=([^;]+)`).exec(setCookie);
    const newValue = decodeURIComponent(match![1]);
    expect(hasValidRoomUnlock(newValue, 'room-1')).toBe(true);
    expect(hasValidRoomUnlock(newValue, 'other-room')).toBe(true);
  });
});

describe('GET /api/rooms/[roomId]/unlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(null);
    mockGetAuthSession.mockReturnValue(null);
  });

  it('returns 404 when the room does not exist', async () => {
    mockGetRoomPasswordHash.mockResolvedValue(null);
    const res = await GET(makeGetReq(), { params: PARAMS });
    expect(res.status).toBe(404);
  });

  it('reports passwordRequired:false for an unprotected room', async () => {
    mockGetRoomPasswordHash.mockResolvedValue({ passwordHash: null, ownerId: null });
    const res = await GET(makeGetReq(), { params: PARAMS });
    const body = await res.json() as { passwordRequired: boolean };
    expect(body.passwordRequired).toBe(false);
  });

  it('reports passwordRequired:true for a protected room with no unlock', async () => {
    mockGetRoomPasswordHash.mockResolvedValue({ passwordHash: 'hash123', ownerId: null });
    const res = await GET(makeGetReq(), { params: PARAMS });
    const body = await res.json() as { passwordRequired: boolean };
    expect(body.passwordRequired).toBe(true);
  });

  it('reports passwordRequired:false when a valid unlock cookie is present', async () => {
    mockGetRoomPasswordHash.mockResolvedValue({ passwordHash: 'hash123', ownerId: null });
    const { grantRoomUnlock } = await import('@/lib/server/roomPasswordCookie');
    const cookieValue = grantRoomUnlock(undefined, 'room-1');
    const res = await GET(makeGetReq(`${ROOM_UNLOCK_COOKIE_NAME}=${cookieValue}`), { params: PARAMS });
    const body = await res.json() as { passwordRequired: boolean };
    expect(body.passwordRequired).toBe(false);
  });

  it('reports passwordRequired:false for the room owner with no unlock cookie', async () => {
    mockGetRoomPasswordHash.mockResolvedValue({ passwordHash: 'hash123', ownerId: 'usr_owner' });
    const session = { user: { id: 'usr_owner' } };
    mockAuth.mockResolvedValue(session);
    mockGetAuthSession.mockReturnValue(session);
    const res = await GET(makeGetReq(), { params: PARAMS });
    const body = await res.json() as { passwordRequired: boolean };
    expect(body.passwordRequired).toBe(false);
  });
});
