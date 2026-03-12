/**
 * Tests for GET /api/rooms/[roomId]/events (P074)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    room: { findUnique: vi.fn() },
    roomEvent: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/db/roomRepository', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/db/roomRepository')>();
  return {
    ...mod,
    resolveRoomId: vi.fn(),
    checkRoomAccess: vi.fn(),
    getRoomEvents: vi.fn(),
  };
});

import { GET } from './route';
import { auth } from '@/lib/auth';
import { resolveRoomId, checkRoomAccess, getRoomEvents } from '@/lib/db/roomRepository';
import { NextRequest } from 'next/server';

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockResolveRoomId = resolveRoomId as ReturnType<typeof vi.fn>;
const mockCheckRoomAccess = checkRoomAccess as ReturnType<typeof vi.fn>;
const mockGetRoomEvents = getRoomEvents as ReturnType<typeof vi.fn>;

const SESSION = { user: { id: 'usr_1' } };

function makeRequest(roomId: string, query?: string) {
  return new NextRequest(`http://localhost/api/rooms/${roomId}/events${query ?? ''}`);
}

describe('GET /api/rooms/[roomId]/events (P074)', () => {
  const params = Promise.resolve({ roomId: 'room_1' });

  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest('room_1'), { params });
    expect(res.status).toBe(401);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('UNAUTHENTICATED');
  });

  it('returns 404 when room is not found', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveRoomId.mockResolvedValue(null);
    const res = await GET(makeRequest('room_1'), { params });
    expect(res.status).toBe(404);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('ROOM_NOT_FOUND');
  });

  it('returns 403 when access is denied', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveRoomId.mockResolvedValue('room_1');
    mockCheckRoomAccess.mockResolvedValue({ allowed: false, reason: 'PRIVATE_ROOM' });
    const res = await GET(makeRequest('room_1'), { params });
    expect(res.status).toBe(403);
    const json = await res.json() as { code: string };
    expect(json.code).toBe('FORBIDDEN');
  });

  it('returns paginated events for an authorized member', async () => {
    const mockEvents = [
      { id: 'evt_1', eventType: 'COMMIT', actorId: 'usr_1', payload: { sha: 'abc' }, createdAt: new Date('2026-01-02') },
      { id: 'evt_2', eventType: 'MEMBER_JOIN', actorId: 'usr_2', payload: { displayName: 'Bob' }, createdAt: new Date('2026-01-01') },
    ];
    mockAuth.mockResolvedValue(SESSION);
    mockResolveRoomId.mockResolvedValue('room_1');
    mockCheckRoomAccess.mockResolvedValue({ allowed: true, role: 'EDITOR' });
    mockGetRoomEvents.mockResolvedValue(mockEvents);

    const res = await GET(makeRequest('room_1', '?take=2'), { params });
    expect(res.status).toBe(200);
    const json = await res.json() as { events: unknown[]; nextCursor: string | null };
    expect(json.events).toHaveLength(2);
    expect(json.nextCursor).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns null nextCursor when fewer events than requested', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveRoomId.mockResolvedValue('room_1');
    mockCheckRoomAccess.mockResolvedValue({ allowed: true, role: 'EDITOR' });
    mockGetRoomEvents.mockResolvedValue([
      { id: 'evt_1', eventType: 'COMMIT', actorId: 'usr_1', payload: {}, createdAt: new Date() },
    ]);
    const res = await GET(makeRequest('room_1', '?take=50'), { params });
    expect(res.status).toBe(200);
    const json = await res.json() as { nextCursor: string | null };
    expect(json.nextCursor).toBeNull();
  });
});
