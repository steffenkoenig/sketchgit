/**
 * Tests for POST/GET/DELETE /api/rooms/[roomId]/share-links (P091)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    shareLink: {
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock('@/lib/db/roomRepository', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/db/roomRepository')>();
  return {
    ...mod,
    resolveRoomId: vi.fn(),
    checkRoomAccess: vi.fn(),
    createShareLink: vi.fn(),
    listShareLinks: vi.fn(),
    revokeAllShareLinks: vi.fn(),
    getCommitShaInRoom: vi.fn(),
  };
});
vi.mock('@/lib/server/shareLinkTokens', () => ({
  generateShareLinkToken: vi.fn().mockReturnValue('a'.repeat(64)),
  signShareLinkToken: vi.fn().mockReturnValue('s'.repeat(64)),
}));

import { POST, GET, DELETE } from './route';
import { auth } from '@/lib/auth';
import {
  resolveRoomId,
  checkRoomAccess,
  createShareLink,
  listShareLinks,
  revokeAllShareLinks,
  getCommitShaInRoom,
} from '@/lib/db/roomRepository';
import { NextRequest } from 'next/server';

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockResolveRoomId = resolveRoomId as ReturnType<typeof vi.fn>;
const mockCheckRoomAccess = checkRoomAccess as ReturnType<typeof vi.fn>;
const mockCreateShareLink = createShareLink as ReturnType<typeof vi.fn>;
const mockListShareLinks = listShareLinks as ReturnType<typeof vi.fn>;
const mockRevokeAllShareLinks = revokeAllShareLinks as ReturnType<typeof vi.fn>;
const mockGetCommitShaInRoom = getCommitShaInRoom as ReturnType<typeof vi.fn>;

const SESSION = { user: { id: 'usr_1' } };

function makePostRequest(roomId: string, body: object) {
  return new NextRequest(`http://localhost/api/rooms/${roomId}/share-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(roomId: string) {
  return new NextRequest(`http://localhost/api/rooms/${roomId}/share-links`, {
    method: 'GET',
  });
}

function makeDeleteRequest(roomId: string) {
  return new NextRequest(`http://localhost/api/rooms/${roomId}/share-links`, {
    method: 'DELETE',
  });
}

// ─── POST tests ───────────────────────────────────────────────────────────────

describe('POST /api/rooms/[roomId]/share-links (P091)', () => {
  const params = Promise.resolve({ roomId: 'room_1' });

  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makePostRequest('room_1', {}), { params });
    expect(res.status).toBe(401);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('UNAUTHENTICATED');
  });

  it('returns 404 when room does not exist', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveRoomId.mockResolvedValue(null);
    const res = await POST(makePostRequest('room_1', {}), { params });
    expect(res.status).toBe(404);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('ROOM_NOT_FOUND');
  });

  it('returns 403 when caller is not OWNER', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveRoomId.mockResolvedValue('room_1');
    mockCheckRoomAccess.mockResolvedValue({ allowed: true, role: 'EDITOR' });
    const res = await POST(makePostRequest('room_1', {}), { params });
    expect(res.status).toBe(403);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('FORBIDDEN');
  });

  it('creates a ROOM-scoped VIEW link successfully', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveRoomId.mockResolvedValue('room_1');
    mockCheckRoomAccess.mockResolvedValue({ allowed: true, role: 'OWNER' });
    mockCreateShareLink.mockResolvedValue({ id: 'sl_1' });

    const res = await POST(makePostRequest('room_1', { scope: 'ROOM', permission: 'VIEW' }), { params });
    expect(res.status).toBe(201);
    const json = await res.json() as { id: string; url: string; token: string; expiresAt: null };
    expect(json.id).toBe('sl_1');
    expect(json.url).toContain('/api/share/');
    expect(json.token).toBe('a'.repeat(64));
    expect(json.expiresAt).toBeNull();
    expect(mockCreateShareLink).toHaveBeenCalledOnce();
  });

  it('creates a link with expiry when expiresInHours is provided', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveRoomId.mockResolvedValue('room_1');
    mockCheckRoomAccess.mockResolvedValue({ allowed: true, role: 'OWNER' });
    mockCreateShareLink.mockResolvedValue({ id: 'sl_2' });

    const res = await POST(
      makePostRequest('room_1', { scope: 'ROOM', permission: 'VIEW', expiresInHours: 24 }),
      { params },
    );
    expect(res.status).toBe(201);
    const json = await res.json() as { expiresAt: string };
    expect(json.expiresAt).not.toBeNull();
    expect(new Date(json.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('returns 422 when BRANCH scope has empty branches array', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveRoomId.mockResolvedValue('room_1');
    mockCheckRoomAccess.mockResolvedValue({ allowed: true, role: 'OWNER' });

    const res = await POST(
      makePostRequest('room_1', { scope: 'BRANCH', branches: [], permission: 'VIEW' }),
      { params },
    );
    expect(res.status).toBe(422);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('VALIDATION_ERROR');
  });

  it('returns 422 when COMMIT scope has no commitSha', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveRoomId.mockResolvedValue('room_1');
    mockCheckRoomAccess.mockResolvedValue({ allowed: true, role: 'OWNER' });

    const res = await POST(
      makePostRequest('room_1', { scope: 'COMMIT', permission: 'VIEW' }),
      { params },
    );
    expect(res.status).toBe(422);
  });

  it('returns 404 when COMMIT scope commitSha does not belong to the room', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveRoomId.mockResolvedValue('room_1');
    mockCheckRoomAccess.mockResolvedValue({ allowed: true, role: 'OWNER' });
    mockGetCommitShaInRoom.mockResolvedValue(null);

    const res = await POST(
      makePostRequest('room_1', { scope: 'COMMIT', commitSha: 'a'.repeat(64), permission: 'VIEW' }),
      { params },
    );
    expect(res.status).toBe(404);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('NOT_FOUND');
  });

  it('forces VIEW permission for COMMIT-scoped links', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveRoomId.mockResolvedValue('room_1');
    mockCheckRoomAccess.mockResolvedValue({ allowed: true, role: 'OWNER' });
    mockGetCommitShaInRoom.mockResolvedValue('a'.repeat(64));
    mockCreateShareLink.mockResolvedValue({ id: 'sl_3' });

    await POST(
      makePostRequest('room_1', { scope: 'COMMIT', commitSha: 'a'.repeat(64), permission: 'ADMIN' }),
      { params },
    );
    const callArgs = mockCreateShareLink.mock.calls[0]![0];
    expect(callArgs.permission).toBe('VIEW');
  });
});

// ─── GET tests ────────────────────────────────────────────────────────────────

describe('GET /api/rooms/[roomId]/share-links (P091)', () => {
  const params = Promise.resolve({ roomId: 'room_1' });

  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeGetRequest('room_1'), { params });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-OWNER callers', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveRoomId.mockResolvedValue('room_1');
    mockCheckRoomAccess.mockResolvedValue({ allowed: true, role: 'EDITOR' });
    const res = await GET(makeGetRequest('room_1'), { params });
    expect(res.status).toBe(403);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('FORBIDDEN');
  });

  it('returns link list without token field', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveRoomId.mockResolvedValue('room_1');
    mockCheckRoomAccess.mockResolvedValue({ allowed: true, role: 'OWNER' });
    mockListShareLinks.mockResolvedValue([
      {
        id: 'sl_1', label: 'Test link', scope: 'ROOM', branches: [],
        commitSha: null, permission: 'VIEW', expiresAt: null,
        maxUses: null, useCount: 0, createdAt: new Date(), createdBy: 'usr_1',
      },
    ]);

    const res = await GET(makeGetRequest('room_1'), { params });
    expect(res.status).toBe(200);
    const json = await res.json() as { links: Array<{ id: string; token?: string }> };
    expect(json.links).toHaveLength(1);
    expect(json.links[0]!.id).toBe('sl_1');
    // token must NOT be returned
    expect(json.links[0]!.token).toBeUndefined();
  });
});

// ─── DELETE (all) tests ───────────────────────────────────────────────────────

describe('DELETE /api/rooms/[roomId]/share-links (P091)', () => {
  const params = Promise.resolve({ roomId: 'room_1' });

  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest('room_1'), { params });
    expect(res.status).toBe(401);
  });

  it('revokes all links and returns count', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveRoomId.mockResolvedValue('room_1');
    mockCheckRoomAccess.mockResolvedValue({ allowed: true, role: 'OWNER' });
    mockRevokeAllShareLinks.mockResolvedValue(5);

    const res = await DELETE(makeDeleteRequest('room_1'), { params });
    expect(res.status).toBe(200);
    const json = await res.json() as { revoked: number };
    expect(json.revoked).toBe(5);
  });
});
