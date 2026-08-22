import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db/prisma', () => {
  const client = {
    room: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  // P088 – prismaRead/prismaWrite alias the same mock client (matches the
  // no-replica-configured default: reads and writes both hit the primary).
  return { prisma: client, prismaRead: client, prismaWrite: client };
});
// P093 – avoid real Argon2id hashing (~200-500ms by design) in unit tests.
vi.mock('@/lib/passwordHashing', () => ({
  hashPassword: vi.fn(async (pw: string) => `hashed:${pw}`),
}));

import { PATCH } from './route';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { hashPassword } from '@/lib/passwordHashing';
import { NextRequest } from 'next/server';
import { makeRoom, makeMembership } from '@/lib/test/factories';

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockRoomFindUnique = prisma.room.findUnique as ReturnType<typeof vi.fn>;
const mockRoomUpdate = prisma.room.update as ReturnType<typeof vi.fn>;
const mockHashPassword = hashPassword as ReturnType<typeof vi.fn>;

const SESSION = { user: { id: 'usr_1' } };
const OWNER_ROOM = { ...makeRoom({ id: 'room_1', ownerId: 'usr_1' }), memberships: [] };
const NON_OWNER_ROOM = { ...makeRoom({ id: 'room_1', ownerId: 'usr_other' }), memberships: [] };
const MEMBERSHIP_OWNER = { ...makeRoom({ id: 'room_1', ownerId: 'usr_other' }), memberships: [makeMembership('room_1', 'usr_1', 'OWNER')] };

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
    const json = await res.json() as { code: string };
    expect(json.code).toBe('UNAUTHENTICATED');
  });

  it('returns 404 when room does not exist', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRoomFindUnique.mockResolvedValue(null);
    const res = await PATCH(makeRequest('room_1', { slug: 'my-room' }), { params });
    expect(res.status).toBe(404);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('ROOM_NOT_FOUND');
  });

  it('returns 403 when caller is not the owner', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRoomFindUnique.mockResolvedValue(NON_OWNER_ROOM);
    const res = await PATCH(makeRequest('room_1', { slug: 'my-room' }), { params });
    expect(res.status).toBe(403);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('FORBIDDEN');
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
    const json = await res.json() as { code: string };
    expect(json.code).toBe('VALIDATION_ERROR');
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
    const json = await res.json() as { code: string };
    expect(json.code).toBe('SLUG_ALREADY_TAKEN');
  });

  // ── P093: password protection ────────────────────────────────────────────────

  it('returns 422 when neither slug nor password is provided', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRoomFindUnique.mockResolvedValue(OWNER_ROOM);
    const res = await PATCH(makeRequest('room_1', {}), { params });
    expect(res.status).toBe(422);
  });

  it('hashes and persists a new password, returning passwordProtected:true', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRoomFindUnique.mockResolvedValue(OWNER_ROOM);
    mockRoomUpdate.mockResolvedValue({});
    const res = await PATCH(makeRequest('room_1', { password: 'sekret123' }), { params });
    expect(res.status).toBe(200);
    expect(mockHashPassword).toHaveBeenCalledWith('sekret123');
    expect(mockRoomUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { passwordHash: 'hashed:sekret123' } }),
    );
    const data = await res.json() as { passwordProtected: boolean };
    expect(data.passwordProtected).toBe(true);
  });

  it('clears the password when password:null is sent', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRoomFindUnique.mockResolvedValue(OWNER_ROOM);
    mockRoomUpdate.mockResolvedValue({});
    const res = await PATCH(makeRequest('room_1', { password: null }), { params });
    expect(res.status).toBe(200);
    expect(mockHashPassword).not.toHaveBeenCalled();
    expect(mockRoomUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { passwordHash: null } }),
    );
    const data = await res.json() as { passwordProtected: boolean };
    expect(data.passwordProtected).toBe(false);
  });

  it('rejects a password shorter than 4 characters', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRoomFindUnique.mockResolvedValue(OWNER_ROOM);
    const res = await PATCH(makeRequest('room_1', { password: 'abc' }), { params });
    expect(res.status).toBe(422);
  });

  it('sets both slug and password in one request', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRoomFindUnique.mockResolvedValue(OWNER_ROOM);
    mockRoomUpdate.mockResolvedValue({ id: 'room_1', slug: 'my-room' });
    const res = await PATCH(makeRequest('room_1', { slug: 'my-room', password: 'sekret123' }), { params });
    expect(res.status).toBe(200);
    const data = await res.json() as { slug: string; passwordProtected: boolean };
    expect(data.slug).toBe('my-room');
    expect(data.passwordProtected).toBe(true);
  });

  it('a non-owner cannot set a room password', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockRoomFindUnique.mockResolvedValue(NON_OWNER_ROOM);
    const res = await PATCH(makeRequest('room_1', { password: 'sekret123' }), { params });
    expect(res.status).toBe(403);
    expect(mockHashPassword).not.toHaveBeenCalled();
  });
});
