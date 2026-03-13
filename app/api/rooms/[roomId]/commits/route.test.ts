import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db/prisma', () => {
  return {
    prisma: {
      room: { findUnique: vi.fn() },
      commit: { findMany: vi.fn() },
      roomMembership: { findUnique: vi.fn() },
    },
  };
});

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/authTypes', () => ({
  getAuthSession: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/db/roomRepository', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/db/roomRepository')>();
  return {
    ...mod,
    checkRoomAccess: vi.fn(),
    saveCommitWithDelta: vi.fn(),
    appendRoomEvent: vi.fn(),
  };
});

vi.mock('@/lib/server/wsRoomBroadcaster', () => ({
  broadcastToRoom: vi.fn(),
}));

vi.mock('@/lib/server/commitValidation', () => ({
  validateCommitMessage: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/cache/roomSnapshotCache', () => ({
  createRoomSnapshotCache: vi.fn(() => ({ invalidate: vi.fn() })),
}));

import { GET, POST } from './route';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth';
import { getAuthSession } from '@/lib/authTypes';
import { checkRoomAccess, saveCommitWithDelta, appendRoomEvent } from '@/lib/db/roomRepository';
import { broadcastToRoom } from '@/lib/server/wsRoomBroadcaster';
import { validateCommitMessage } from '@/lib/server/commitValidation';
import { makeRoom } from '@/lib/test/factories';

const mockRoomFindUnique = prisma.room.findUnique as ReturnType<typeof vi.fn>;
const mockCommitFindMany = prisma.commit.findMany as ReturnType<typeof vi.fn>;
const mockMembershipFindUnique = prisma.roomMembership.findUnique as ReturnType<typeof vi.fn>;
const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockGetAuthSession = getAuthSession as ReturnType<typeof vi.fn>;
const mockCheckRoomAccess = checkRoomAccess as ReturnType<typeof vi.fn>;
const mockSaveCommitWithDelta = saveCommitWithDelta as ReturnType<typeof vi.fn>;
const mockAppendRoomEvent = appendRoomEvent as ReturnType<typeof vi.fn>;
const mockBroadcastToRoom = broadcastToRoom as ReturnType<typeof vi.fn>;
const mockValidateCommitMessage = validateCommitMessage as ReturnType<typeof vi.fn>;

function makeRequest(roomId: string, query: Record<string, string> = {}): NextRequest {
  const url = new URL(`http://localhost/api/rooms/${roomId}/commits`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

function makePostRequest(roomId: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/rooms/${roomId}/commits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Returns only the fields the commits API endpoint reads from DB. */
const fakeApiCommit = (sha: string) => ({
  sha,
  parentSha: null,
  branch: 'main',
  message: 'test',
  createdAt: new Date(1000),
  isMerge: false,
});

describe('GET /api/rooms/[roomId]/commits', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when room does not exist', async () => {
    mockRoomFindUnique.mockResolvedValue(null);
    const res = await GET(makeRequest('no-room'), { params: Promise.resolve({ roomId: 'no-room' }) });
    expect(res.status).toBe(404);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('ROOM_NOT_FOUND');
  });

  it('returns commits page with nextCursor when more results exist', async () => {
    mockRoomFindUnique.mockResolvedValue(makeRoom({ id: 'room-1', isPublic: true }));
    // Request take=2, return 3 (take+1) to signal hasMore
    const commits = [fakeApiCommit('c3'), fakeApiCommit('c2'), fakeApiCommit('c1')];
    mockCommitFindMany.mockResolvedValue(commits);

    const res = await GET(makeRequest('room-1', { take: '2' }), { params: Promise.resolve({ roomId: 'room-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { commits: unknown[]; nextCursor: string };
    expect(body.commits).toHaveLength(2);
    expect(body.nextCursor).toBe('c2');
  });

  it('returns null nextCursor on last page', async () => {
    mockRoomFindUnique.mockResolvedValue(makeRoom({ id: 'room-1', isPublic: true }));
    mockCommitFindMany.mockResolvedValue([fakeApiCommit('c1')]);

    const res = await GET(makeRequest('room-1', { take: '50' }), { params: Promise.resolve({ roomId: 'room-1' }) });
    const body = await res.json() as { nextCursor: null };
    expect(body.nextCursor).toBeNull();
  });

  it('returns 422 for invalid take parameter', async () => {
    mockRoomFindUnique.mockResolvedValue(makeRoom({ id: 'room-1', isPublic: true }));
    const res = await GET(makeRequest('room-1', { take: '999' }), { params: Promise.resolve({ roomId: 'room-1' }) });
    expect(res.status).toBe(422);
  });

  it('passes cursor to prisma when provided', async () => {
    mockRoomFindUnique.mockResolvedValue(makeRoom({ id: 'room-1', isPublic: true }));
    mockCommitFindMany.mockResolvedValue([]);

    await GET(makeRequest('room-1', { cursor: 'abc123' }), { params: Promise.resolve({ roomId: 'room-1' }) });
    expect(mockCommitFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { sha: 'abc123' }, skip: 1 }),
    );
  });

  it('maps commit fields correctly', async () => {
    mockRoomFindUnique.mockResolvedValue(makeRoom({ id: 'room-1', isPublic: true }));
    const commit = {
      sha: 'abc123',
      parentSha: 'parent1',
      branch: 'feature',
      message: 'feat: stuff',
      createdAt: new Date(5000),
      isMerge: true,
    };
    mockCommitFindMany.mockResolvedValue([commit]);

    const res = await GET(makeRequest('room-1'), { params: Promise.resolve({ roomId: 'room-1' }) });
    const body = await res.json() as { commits: Array<{ sha: string; parent: string; branch: string; message: string; ts: number; isMerge: boolean }> };
    expect(body.commits[0]).toEqual({
      sha: 'abc123',
      parent: 'parent1',
      branch: 'feature',
      message: 'feat: stuff',
      ts: 5000,
      isMerge: true,
    });
  });

  it('returns 401 for private room when unauthenticated', async () => {
    mockRoomFindUnique.mockResolvedValue(makeRoom({ id: 'room-priv', isPublic: false }));
    const res = await GET(makeRequest('room-priv'), { params: Promise.resolve({ roomId: 'room-priv' }) });
    expect(res.status).toBe(401);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('UNAUTHENTICATED');
  });

  it('returns 403 for private room when authenticated but not a member', async () => {
    mockRoomFindUnique.mockResolvedValue(makeRoom({ id: 'room-priv', isPublic: false }));
    const session = { user: { id: 'usr_1' } };
    mockAuth.mockResolvedValueOnce(session);
    mockGetAuthSession.mockReturnValueOnce(session);
    mockMembershipFindUnique.mockResolvedValue(null);
    const res = await GET(makeRequest('room-priv'), { params: Promise.resolve({ roomId: 'room-priv' }) });
    expect(res.status).toBe(403);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('FORBIDDEN');
  });

  // ── P070: Cache-Control headers ──────────────────────────────────────────────

  it('returns immutable Cache-Control when cursor (SHA) is provided', async () => {
    mockRoomFindUnique.mockResolvedValue(makeRoom({ id: 'room-1', isPublic: true }));
    mockCommitFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest('room-1', { cursor: 'abc123' }), { params: Promise.resolve({ roomId: 'room-1' }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(res.headers.get('etag')).toBe('"abc123"');
  });

  it('returns no-store Cache-Control when no cursor is provided (first page)', async () => {
    mockRoomFindUnique.mockResolvedValue(makeRoom({ id: 'room-1', isPublic: true }));
    mockCommitFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest('room-1'), { params: Promise.resolve({ roomId: 'room-1' }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
  });
});

// ─── POST /api/rooms/[roomId]/commits ─────────────────────────────────────────

const SESSION = { user: { id: 'usr_1' } };
const VALID_BODY = {
  type: 'commit',
  clientId: 'client_1',
  senderName: 'Test User',
  senderColor: '#7c6eff',
  sha: 'abc12345',
  commit: {
    branch: 'main',
    message: 'Initial commit',
    canvas: '{"objects":[]}',
  },
};

describe('POST /api/rooms/[roomId]/commits', () => {
  const params = Promise.resolve({ roomId: 'room_1' });

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION);
    mockGetAuthSession.mockReturnValue(SESSION);
    mockCheckRoomAccess.mockResolvedValue({ allowed: true, role: 'EDITOR' });
    mockSaveCommitWithDelta.mockResolvedValue(undefined);
    mockAppendRoomEvent.mockResolvedValue(undefined);
    mockValidateCommitMessage.mockReturnValue(true);
  });

  it('returns 201 and the sha on success', async () => {
    const res = await POST(makePostRequest('room_1', VALID_BODY), { params });
    expect(res.status).toBe(201);
    const json = await res.json() as { sha: string };
    expect(json.sha).toBe('abc12345');
  });

  it('persists the commit via saveCommitWithDelta', async () => {
    await POST(makePostRequest('room_1', VALID_BODY), { params });
    expect(mockSaveCommitWithDelta).toHaveBeenCalledWith(
      'room_1',
      expect.objectContaining({ sha: 'abc12345', branch: 'main', message: 'Initial commit' }),
      'usr_1',
    );
  });

  it('broadcasts commit to room members excluding sender', async () => {
    await POST(makePostRequest('room_1', VALID_BODY), { params });
    expect(mockBroadcastToRoom).toHaveBeenCalledWith(
      'room_1',
      expect.objectContaining({ type: 'commit', sha: 'abc12345' }),
      'client_1',
    );
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/rooms/room_1/commits', {
      method: 'POST',
      body: 'not json',
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('INVALID_JSON');
  });

  it('returns 422 when validateCommitMessage returns false', async () => {
    mockValidateCommitMessage.mockReturnValue(false);
    const res = await POST(makePostRequest('room_1', VALID_BODY), { params });
    expect(res.status).toBe(422);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('VALIDATION_ERROR');
  });

  it('returns 403 for VIEWER role', async () => {
    mockCheckRoomAccess.mockResolvedValue({ allowed: true, role: 'VIEWER' });
    const res = await POST(makePostRequest('room_1', VALID_BODY), { params });
    expect(res.status).toBe(403);
  });

  it('returns 403 when access is denied', async () => {
    mockCheckRoomAccess.mockResolvedValue({ allowed: false, reason: 'PRIVATE_ROOM' });
    const res = await POST(makePostRequest('room_1', VALID_BODY), { params });
    expect(res.status).toBe(403);
  });

  it('returns 500 when saveCommitWithDelta throws', async () => {
    mockSaveCommitWithDelta.mockRejectedValue(new Error('DB error'));
    const res = await POST(makePostRequest('room_1', VALID_BODY), { params });
    expect(res.status).toBe(500);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('INTERNAL_ERROR');
  });
});
