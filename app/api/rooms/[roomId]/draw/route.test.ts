/**
 * Tests for POST /api/rooms/[roomId]/draw
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/authTypes', () => ({ getAuthSession: vi.fn() }));
vi.mock('@/lib/db/roomRepository', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/db/roomRepository')>();
  return { ...mod, checkRoomAccess: vi.fn() };
});
vi.mock('@/lib/server/wsRoomBroadcaster', () => ({ broadcastToRoom: vi.fn() }));

import { POST } from './route';
import { auth } from '@/lib/auth';
import { getAuthSession } from '@/lib/authTypes';
import { checkRoomAccess } from '@/lib/db/roomRepository';
import { broadcastToRoom } from '@/lib/server/wsRoomBroadcaster';
import { NextRequest } from 'next/server';

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockGetAuthSession = getAuthSession as ReturnType<typeof vi.fn>;
const mockCheckRoomAccess = checkRoomAccess as ReturnType<typeof vi.fn>;
const mockBroadcastToRoom = broadcastToRoom as ReturnType<typeof vi.fn>;

const SESSION = { user: { id: 'usr_1' } };
const PARAMS = Promise.resolve({ roomId: 'room_1' });

function makePostReq(body: unknown) {
  return new NextRequest('http://localhost/api/rooms/room_1/draw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/rooms/[roomId]/draw', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION);
    mockGetAuthSession.mockReturnValue(SESSION);
    mockCheckRoomAccess.mockResolvedValue({ allowed: true, role: 'EDITOR' });
  });

  it('returns 204 for a valid draw event', async () => {
    const res = await POST(makePostReq({ type: 'draw', clientId: 'c1', canvas: '{"objects":[]}' }), { params: PARAMS });
    expect(res.status).toBe(204);
  });

  it('broadcasts draw event to room members excluding sender', async () => {
    await POST(makePostReq({ type: 'draw', clientId: 'c1', canvas: '{"objects":[]}' }), { params: PARAMS });
    expect(mockBroadcastToRoom).toHaveBeenCalledWith(
      'room_1',
      expect.objectContaining({ type: 'draw', senderId: 'c1' }),
      'c1',
    );
  });

  it('returns 204 for a valid draw-delta event', async () => {
    const body = { type: 'draw-delta', clientId: 'c1', added: [], modified: [], removed: [] };
    const res = await POST(makePostReq(body), { params: PARAMS });
    expect(res.status).toBe(204);
  });

  it('returns 400 for invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/rooms/room_1/draw', {
      method: 'POST',
      body: 'bad json',
    });
    const res = await POST(req, { params: PARAMS });
    expect(res.status).toBe(400);
  });

  it('returns 403 when access is denied', async () => {
    mockCheckRoomAccess.mockResolvedValue({ allowed: false });
    const res = await POST(makePostReq({ type: 'draw', clientId: 'c1', canvas: '{}' }), { params: PARAMS });
    expect(res.status).toBe(403);
  });

  it('returns 403 for VIEWER role', async () => {
    mockCheckRoomAccess.mockResolvedValue({ allowed: true, role: 'VIEWER' });
    const res = await POST(makePostReq({ type: 'draw', clientId: 'c1', canvas: '{}' }), { params: PARAMS });
    expect(res.status).toBe(403);
  });
});
