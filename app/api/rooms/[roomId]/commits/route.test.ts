import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db/prisma', () => {
  return {
    prisma: {
      room: { findUnique: vi.fn(), upsert: vi.fn() },
      commit: { findMany: vi.fn(), upsert: vi.fn() },
      branch: { findMany: vi.fn(), upsert: vi.fn() },
      roomState: { findUnique: vi.fn(), upsert: vi.fn() },
      roomMembership: { findUnique: vi.fn() },
      $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
    },
  };
});

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/authTypes', () => ({
  getAuthSession: vi.fn().mockReturnValue(null),
}));

import { GET, POST } from './route';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth';
import { getAuthSession } from '@/lib/authTypes';
import { makeRoom } from '@/lib/test/factories';

const mockRoomFindUnique = prisma.room.findUnique as ReturnType<typeof vi.fn>;
const mockCommitFindMany = prisma.commit.findMany as ReturnType<typeof vi.fn>;
const mockMembershipFindUnique = prisma.roomMembership.findUnique as ReturnType<typeof vi.fn>;
const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockGetAuthSession = getAuthSession as ReturnType<typeof vi.fn>;

function makeRequest(roomId: string, query: Record<string, string> = {}): NextRequest {
  const url = new URL(`http://localhost/api/rooms/${roomId}/commits`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
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

// ─── GET ?canvas=true (polling fallback) ──────────────────────────────────────

describe('GET /api/rooms/[roomId]/commits?canvas=true', () => {
  const mockBranchFindMany = prisma.branch.findMany as ReturnType<typeof vi.fn>;
  const mockRoomStateFindUnique = prisma.roomState.findUnique as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBranchFindMany.mockResolvedValue([]);
    mockRoomStateFindUnique.mockResolvedValue(null);
  });

  it('returns empty commits array when no commits exist', async () => {
    mockRoomFindUnique.mockResolvedValue(makeRoom({ id: 'r1', isPublic: true }));
    mockCommitFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest('r1', { canvas: 'true' }), { params: Promise.resolve({ roomId: 'r1' }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { commits: unknown[]; nextCursor: null };
    expect(body.commits).toHaveLength(0);
    expect(body.nextCursor).toBeNull();
  });

  it('returns commits with canvas field included', async () => {
    mockRoomFindUnique.mockResolvedValue(makeRoom({ id: 'r1', isPublic: true }));
    const canvasObj = { objects: [], version: '5.3.1', background: '#0a0a0f' };
    mockCommitFindMany.mockResolvedValue([{
      sha: 'abc',
      parentSha: null,
      parents: [],
      branch: 'main',
      message: 'init',
      createdAt: new Date(1000),
      isMerge: false,
      storageType: 'SNAPSHOT',
      canvasJson: canvasObj,
    }]);
    mockBranchFindMany.mockResolvedValue([{ name: 'main', headSha: 'abc' }]);
    mockRoomStateFindUnique.mockResolvedValue({ headBranch: 'main', headSha: 'abc', isDetached: false });

    const res = await GET(makeRequest('r1', { canvas: 'true' }), { params: Promise.resolve({ roomId: 'r1' }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { commits: Array<{ sha: string; canvas: string }> };
    expect(body.commits).toHaveLength(1);
    expect(body.commits[0].sha).toBe('abc');
    expect(typeof body.commits[0].canvas).toBe('string');
  });

  it('returns no-store Cache-Control (mutable)', async () => {
    mockRoomFindUnique.mockResolvedValue(makeRoom({ id: 'r1', isPublic: true }));
    mockCommitFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest('r1', { canvas: 'true' }), { params: Promise.resolve({ roomId: 'r1' }) });
    expect(res.headers.get('cache-control')).toContain('no-store');
  });
});

// ─── POST /api/rooms/[roomId]/commits ─────────────────────────────────────────

describe('POST /api/rooms/[roomId]/commits', () => {
  const mockRoomUpsert = prisma.room.upsert as ReturnType<typeof vi.fn>;
  const mockCommitUpsert = prisma.commit.upsert as ReturnType<typeof vi.fn>;
  const mockBranchUpsert = prisma.branch.upsert as ReturnType<typeof vi.fn>;
  const mockRoomStateUpsert = prisma.roomState.upsert as ReturnType<typeof vi.fn>;

  const validBody = {
    sha: 'abcdef1234567890',
    commit: {
      parent: null,
      parents: [],
      branch: 'main',
      message: 'feat: add shape',
      canvas: '{"objects":[],"version":"5.3.1"}',
      isMerge: false,
    },
  };

  function makePostRequest(roomId: string, body: unknown): NextRequest {
    return new NextRequest(`http://localhost/api/rooms/${roomId}/commits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockRoomUpsert.mockResolvedValue({});
    mockCommitUpsert.mockResolvedValue({});
    mockBranchUpsert.mockResolvedValue({});
    mockRoomStateUpsert.mockResolvedValue({});
  });

  it('returns 201 with sha on success (public room)', async () => {
    mockRoomFindUnique.mockResolvedValue(makeRoom({ id: 'r1', isPublic: true }));
    const res = await POST(makePostRequest('r1', validBody), { params: Promise.resolve({ roomId: 'r1' }) });
    expect(res.status).toBe(201);
    const body = await res.json() as { sha: string };
    expect(body.sha).toBe(validBody.sha);
  });

  it('returns 404 when room does not exist', async () => {
    mockRoomFindUnique.mockResolvedValue(null);
    const res = await POST(makePostRequest('no-room', validBody), { params: Promise.resolve({ roomId: 'no-room' }) });
    expect(res.status).toBe(404);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('ROOM_NOT_FOUND');
  });

  it('returns 401 for private room when unauthenticated', async () => {
    mockRoomFindUnique.mockResolvedValue(makeRoom({ id: 'r-priv', isPublic: false }));
    const res = await POST(makePostRequest('r-priv', validBody), { params: Promise.resolve({ roomId: 'r-priv' }) });
    expect(res.status).toBe(401);
  });

  it('returns 422 for invalid body (missing branch)', async () => {
    mockRoomFindUnique.mockResolvedValue(makeRoom({ id: 'r1', isPublic: true }));
    const badBody = { sha: 'abcdef1234567890', commit: { parents: [], message: 'x', canvas: '{}' } };
    const res = await POST(makePostRequest('r1', badBody), { params: Promise.resolve({ roomId: 'r1' }) });
    expect(res.status).toBe(422);
  });

  it('returns 400 for invalid JSON', async () => {
    mockRoomFindUnique.mockResolvedValue(makeRoom({ id: 'r1', isPublic: true }));
    const req = new NextRequest('http://localhost/api/rooms/r1/commits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req, { params: Promise.resolve({ roomId: 'r1' }) });
    expect(res.status).toBe(400);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('INVALID_JSON');
  });
});
