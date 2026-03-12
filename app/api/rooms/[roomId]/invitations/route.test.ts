/**
 * Tests for POST /api/rooms/[roomId]/invitations and DELETE (P066)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    roomInvitation: {
      create: vi.fn(),
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
  };
});
vi.mock('@/lib/server/invitationTokens', () => ({
  generateInvitationToken: vi.fn().mockReturnValue('a'.repeat(64)),
  signInvitationToken: vi.fn().mockReturnValue('s'.repeat(64)),
}));

import { POST, DELETE } from './route';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { resolveRoomId, checkRoomAccess } from '@/lib/db/roomRepository';
import { NextRequest } from 'next/server';

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockResolveRoomId = resolveRoomId as ReturnType<typeof vi.fn>;
const mockCheckRoomAccess = checkRoomAccess as ReturnType<typeof vi.fn>;
const mockCreate = prisma.roomInvitation.create as ReturnType<typeof vi.fn>;
const mockDeleteMany = prisma.roomInvitation.deleteMany as ReturnType<typeof vi.fn>;

const SESSION = { user: { id: 'usr_1' } };

function makePostRequest(roomId: string, body: object) {
  return new NextRequest(`http://localhost/api/rooms/${roomId}/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(roomId: string) {
  return new NextRequest(`http://localhost/api/rooms/${roomId}/invitations`, {
    method: 'DELETE',
  });
}

describe('POST /api/rooms/[roomId]/invitations (P066)', () => {
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

  it('creates invitation and returns url for room OWNER', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveRoomId.mockResolvedValue('room_1');
    mockCheckRoomAccess.mockResolvedValue({ allowed: true, role: 'OWNER' });
    mockCreate.mockResolvedValue({});

    const res = await POST(makePostRequest('room_1', { expiresInHours: 24, maxUses: 1 }), { params });
    expect(res.status).toBe(201);
    const json = await res.json() as { url: string; token: string; expiresAt: string };
    expect(json.url).toContain('/api/invitations/');
    expect(json.token).toBe('a'.repeat(64));
    expect(json.expiresAt).toBeDefined();
    expect(mockCreate).toHaveBeenCalledOnce();
  });
});

describe('DELETE /api/rooms/[roomId]/invitations (P066)', () => {
  const params = Promise.resolve({ roomId: 'room_1' });

  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest('room_1'), { params });
    expect(res.status).toBe(401);
  });

  it('revokes all invitations and returns count', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveRoomId.mockResolvedValue('room_1');
    mockCheckRoomAccess.mockResolvedValue({ allowed: true, role: 'OWNER' });
    mockDeleteMany.mockResolvedValue({ count: 3 });
    const res = await DELETE(makeDeleteRequest('room_1'), { params });
    expect(res.status).toBe(200);
    const json = await res.json() as { revoked: number };
    expect(json.revoked).toBe(3);
  });
});
