import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    room: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { PATCH } from './route';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { NextRequest } from 'next/server';

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockRoomFindUnique = prisma.room.findUnique as ReturnType<typeof vi.fn>;
const mockRoomUpdate = prisma.room.update as ReturnType<typeof vi.fn>;

const SESSION = { user: { id: 'usr_1' } };
const OWNER_ROOM = { ownerId: 'usr_1', memberships: [] };
const NON_OWNER_ROOM = { ownerId: 'usr_other', memberships: [] };
const MEMBERSHIP_OWNER = { ownerId: 'usr_other', memberships: [{ role: 'OWNER' }] };

function makeRequest(roomId: string, body: object) {
  return new NextRequest(`http://localhost/api/rooms/${roomId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/rooms/[roomId] (P049)', () => {
  const params = Promise.resolve({ roomId: 'room_1' });

  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(makeRequest('room_1', { slug: 'my-room' }), { params });
    expect(res.status).toBe(401);
  });

  it('returns 404 when room does not exist', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRoomFindUnique.mockResolvedValue(null);
    const res = await PATCH(makeRequest('room_1', { slug: 'my-room' }), { params });
    expect(res.status).toBe(404);
  });

  it('returns 403 when caller is not the owner', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRoomFindUnique.mockResolvedValue(NON_OWNER_ROOM);
    const res = await PATCH(makeRequest('room_1', { slug: 'my-room' }), { params });
    expect(res.status).toBe(403);
  });

  it('allows membership OWNER to update slug', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRoomFindUnique.mockResolvedValue(MEMBERSHIP_OWNER);
    mockRoomUpdate.mockResolvedValue({ id: 'room_1', slug: 'my-room' });
    const res = await PATCH(makeRequest('room_1', { slug: 'my-room' }), { params });
    expect(res.status).toBe(200);
  });

  it('returns 422 for invalid slug (uppercase)', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRoomFindUnique.mockResolvedValue(OWNER_ROOM);
    const res = await PATCH(makeRequest('room_1', { slug: 'My-Room' }), { params });
    expect(res.status).toBe(422);
  });

  it('returns 422 for slug that is too short', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRoomFindUnique.mockResolvedValue(OWNER_ROOM);
    const res = await PATCH(makeRequest('room_1', { slug: 'ab' }), { params });
    expect(res.status).toBe(422);
  });

  it('returns 422 for slug with leading hyphen', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRoomFindUnique.mockResolvedValue(OWNER_ROOM);
    const res = await PATCH(makeRequest('room_1', { slug: '-bad-slug' }), { params });
    expect(res.status).toBe(422);
  });

  it('returns 200 and the updated room for a valid slug', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRoomFindUnique.mockResolvedValue(OWNER_ROOM);
    mockRoomUpdate.mockResolvedValue({ id: 'room_1', slug: 'my-room' });
    const res = await PATCH(makeRequest('room_1', { slug: 'my-room' }), { params });
    expect(res.status).toBe(200);
    const data = await res.json() as { slug: string };
    expect(data.slug).toBe('my-room');
  });

  it('returns 200 when clearing slug with null', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRoomFindUnique.mockResolvedValue(OWNER_ROOM);
    mockRoomUpdate.mockResolvedValue({ id: 'room_1', slug: null });
    const res = await PATCH(makeRequest('room_1', { slug: null }), { params });
    expect(res.status).toBe(200);
  });

  it('returns 409 when slug is already taken', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRoomFindUnique.mockResolvedValue(OWNER_ROOM);
    mockRoomUpdate.mockRejectedValue({ code: 'P2002' });
    const res = await PATCH(makeRequest('room_1', { slug: 'taken-slug' }), { params });
    expect(res.status).toBe(409);
  });
});
