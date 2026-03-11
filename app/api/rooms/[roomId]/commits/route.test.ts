import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db/prisma', () => {
  return {
    prisma: {
      room: { findUnique: vi.fn() },
      commit: { findMany: vi.fn() },
    },
  };
});

import { GET } from './route';
import { prisma } from '@/lib/db/prisma';

const mockRoomFindUnique = prisma.room.findUnique as ReturnType<typeof vi.fn>;
const mockCommitFindMany = prisma.commit.findMany as ReturnType<typeof vi.fn>;

function makeRequest(roomId: string, query: Record<string, string> = {}): NextRequest {
  const url = new URL(`http://localhost/api/rooms/${roomId}/commits`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

const fakeCommit = (sha: string) => ({
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
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Room not found');
  });

  it('returns commits page with nextCursor when more results exist', async () => {
    mockRoomFindUnique.mockResolvedValue({ id: 'room-1' });
    // Request take=2, return 3 (take+1) to signal hasMore
    const commits = [fakeCommit('c3'), fakeCommit('c2'), fakeCommit('c1')];
    mockCommitFindMany.mockResolvedValue(commits);

    const res = await GET(makeRequest('room-1', { take: '2' }), { params: Promise.resolve({ roomId: 'room-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { commits: unknown[]; nextCursor: string };
    expect(body.commits).toHaveLength(2);
    expect(body.nextCursor).toBe('c2');
  });

  it('returns null nextCursor on last page', async () => {
    mockRoomFindUnique.mockResolvedValue({ id: 'room-1' });
    mockCommitFindMany.mockResolvedValue([fakeCommit('c1')]);

    const res = await GET(makeRequest('room-1', { take: '50' }), { params: Promise.resolve({ roomId: 'room-1' }) });
    const body = await res.json() as { nextCursor: null };
    expect(body.nextCursor).toBeNull();
  });

  it('returns 422 for invalid take parameter', async () => {
    mockRoomFindUnique.mockResolvedValue({ id: 'room-1' });
    const res = await GET(makeRequest('room-1', { take: '999' }), { params: Promise.resolve({ roomId: 'room-1' }) });
    expect(res.status).toBe(422);
  });

  it('passes cursor to prisma when provided', async () => {
    mockRoomFindUnique.mockResolvedValue({ id: 'room-1' });
    mockCommitFindMany.mockResolvedValue([]);

    await GET(makeRequest('room-1', { cursor: 'abc123' }), { params: Promise.resolve({ roomId: 'room-1' }) });
    expect(mockCommitFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { sha: 'abc123' }, skip: 1 }),
    );
  });

  it('maps commit fields correctly', async () => {
    mockRoomFindUnique.mockResolvedValue({ id: 'room-1' });
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
});
