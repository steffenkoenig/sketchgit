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

import { GET } from './route';
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
