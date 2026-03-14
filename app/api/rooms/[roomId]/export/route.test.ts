import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    room: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    commit: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    roomState: {
      findUnique: vi.fn(),
    },
    roomMembership: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/authTypes', () => ({
  getAuthSession: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/export/canvasRenderer', () => ({
  renderToSVG: vi.fn().mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
  renderToPNG: vi.fn().mockResolvedValue(Buffer.from('PNG_BYTES')),
  renderToPDF: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])), // %PDF
}));

vi.mock('@/lib/sketchgit/git/canvasDelta', () => ({
  replayCanvasDelta: vi.fn().mockReturnValue('{"objects":[]}'),
}));

import { GET } from './route';
import { prisma } from '@/lib/db/prisma';
import { NextRequest } from 'next/server';
import { CommitStorageType } from '@prisma/client';
import { renderToPDF, renderToPNG, renderToSVG } from '@/lib/export/canvasRenderer';

const mock = {
  roomFindUnique: prisma.room.findUnique as ReturnType<typeof vi.fn>,
  roomFindFirst: prisma.room.findFirst as ReturnType<typeof vi.fn>,
  commitFindUnique: prisma.commit.findUnique as ReturnType<typeof vi.fn>,
  commitFindFirst: prisma.commit.findFirst as ReturnType<typeof vi.fn>,
  roomStateFindUnique: prisma.roomState.findUnique as ReturnType<typeof vi.fn>,
};

function makeRequest(roomId: string, query: Record<string, string> = {}) {
  const url = new URL(`http://localhost/api/rooms/${roomId}/export`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

const ROOM_ID = 'room_abc';
const COMMIT_SHA = 'sha_001';
const SNAPSHOT_COMMIT = {
  sha: COMMIT_SHA,
  roomId: ROOM_ID,
  parentSha: null,
  canvasJson: { objects: [] },
  storageType: CommitStorageType.SNAPSHOT,
};

describe('GET /api/rooms/[roomId]/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: resolveRoomId returns the canonical id; public room
    mock.roomFindFirst.mockResolvedValue({ id: ROOM_ID });
    mock.roomFindUnique.mockResolvedValue({ isPublic: true });
  });

  const params = Promise.resolve({ roomId: ROOM_ID });

  it('returns 422 for unknown format value', async () => {
    const req = makeRequest(ROOM_ID, { format: 'bmp' });
    const res = await GET(req, { params });
    expect(res.status).toBe(422);
  });

  it('returns 404 when sha is provided but commit is not found', async () => {
    mock.commitFindUnique.mockResolvedValue(null);
    const req = makeRequest(ROOM_ID, { sha: 'nonexistent' });
    const res = await GET(req, { params });
    expect(res.status).toBe(404);
  });

  it('returns 404 when room has no HEAD commit', async () => {
    mock.roomStateFindUnique.mockResolvedValue({ headSha: null });
    const req = makeRequest(ROOM_ID);
    const res = await GET(req, { params });
    expect(res.status).toBe(404);
  });

  it('returns PNG response with correct Content-Type for default format', async () => {
    mock.commitFindUnique.mockResolvedValue(SNAPSHOT_COMMIT);
    mock.commitFindFirst.mockResolvedValue(SNAPSHOT_COMMIT);
    const req = makeRequest(ROOM_ID, { sha: COMMIT_SHA });
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('content-disposition')).toContain('.png');
  });

  it('returns SVG response with correct Content-Type when format=svg', async () => {
    mock.commitFindUnique.mockResolvedValue(SNAPSHOT_COMMIT);
    mock.commitFindFirst.mockResolvedValue(SNAPSHOT_COMMIT);
    const req = makeRequest(ROOM_ID, { sha: COMMIT_SHA, format: 'svg' });
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(res.headers.get('content-disposition')).toContain('.svg');
  });

  it('returns PDF response with correct Content-Type when format=pdf', async () => {
    mock.commitFindUnique.mockResolvedValue(SNAPSHOT_COMMIT);
    mock.commitFindFirst.mockResolvedValue(SNAPSHOT_COMMIT);
    const req = makeRequest(ROOM_ID, { sha: COMMIT_SHA, format: 'pdf' });
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('.pdf');
    expect(renderToPDF).toHaveBeenCalledOnce();
    expect(renderToPNG).not.toHaveBeenCalled();
    expect(renderToSVG).not.toHaveBeenCalled();
  });

  it('resolves HEAD commit when no sha is provided', async () => {
    mock.roomStateFindUnique.mockResolvedValue({ headSha: COMMIT_SHA });
    mock.commitFindFirst.mockResolvedValue(SNAPSHOT_COMMIT);
    const req = makeRequest(ROOM_ID);
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  it('returns 404 when commit sha belongs to a different room', async () => {
    mock.commitFindUnique.mockResolvedValue({ sha: COMMIT_SHA, roomId: 'other_room' });
    const req = makeRequest(ROOM_ID, { sha: COMMIT_SHA });
    const res = await GET(req, { params });
    expect(res.status).toBe(404);
  });

  it('returns 404 when room itself is not found', async () => {
    mock.roomFindFirst.mockResolvedValue(null);
    mock.roomFindUnique.mockResolvedValue(null);
    const req = makeRequest(ROOM_ID, { sha: COMMIT_SHA });
    const res = await GET(req, { params });
    expect(res.status).toBe(404);
  });

  it('returns 401 for private room when unauthenticated', async () => {
    mock.roomFindUnique.mockResolvedValue({ isPublic: false });
    const req = makeRequest(ROOM_ID, { sha: COMMIT_SHA });
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });

  // ── P070: Cache-Control headers ─────────────────────────────────────────────

  it('returns immutable Cache-Control header when sha is provided', async () => {
    mock.commitFindUnique.mockResolvedValue(SNAPSHOT_COMMIT);
    mock.commitFindFirst.mockResolvedValue(SNAPSHOT_COMMIT);
    const req = makeRequest(ROOM_ID, { sha: COMMIT_SHA });
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(res.headers.get('etag')).toBe(`"${COMMIT_SHA}"`);
  });

  it('returns no-store Cache-Control header when sha is omitted (HEAD)', async () => {
    mock.roomStateFindUnique.mockResolvedValue({ headSha: COMMIT_SHA });
    mock.commitFindFirst.mockResolvedValue(SNAPSHOT_COMMIT);
    const req = makeRequest(ROOM_ID);
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('returns 304 Not Modified when If-None-Match matches the sha', async () => {
    const req = makeRequest(ROOM_ID, { sha: COMMIT_SHA });
    req.headers.set('if-none-match', `"${COMMIT_SHA}"`);
    const res = await GET(req, { params });
    expect(res.status).toBe(304);
  });
});
