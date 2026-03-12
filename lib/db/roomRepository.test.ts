import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma before importing the module under test
vi.mock('@/lib/db/prisma', () => {
  const $transaction = vi.fn();
  return {
    prisma: {
      $transaction,
      room: {
        upsert: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        deleteMany: vi.fn(),
      },
      commit: {
        upsert: vi.fn(),
        findMany: vi.fn(),
      },
      branch: {
        upsert: vi.fn(),
        findMany: vi.fn(),
      },
      roomState: {
        upsert: vi.fn(),
        findUnique: vi.fn(),
      },
      roomMembership: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
    },
  };
});

import {
  ensureRoom,
  saveCommit,
  loadRoomSnapshot,
  getUserRooms,
  pruneInactiveRooms,
  checkRoomAccess,
  COMMIT_PAGE_SIZE,
  type CommitRecord,
} from './roomRepository';
import { prisma } from '@/lib/db/prisma';

const mock = {
  transaction: prisma.$transaction as ReturnType<typeof vi.fn>,
  roomUpsert: prisma.room.upsert as ReturnType<typeof vi.fn>,
  roomFindUnique: prisma.room.findUnique as ReturnType<typeof vi.fn>,
  commitFindMany: prisma.commit.findMany as ReturnType<typeof vi.fn>,
  branchFindMany: prisma.branch.findMany as ReturnType<typeof vi.fn>,
  roomStateFindUnique: prisma.roomState.findUnique as ReturnType<typeof vi.fn>,
  membershipFindMany: prisma.roomMembership.findMany as ReturnType<typeof vi.fn>,
  membershipFindUnique: prisma.roomMembership.findUnique as ReturnType<typeof vi.fn>,
  roomFindMany: prisma.room.findMany as ReturnType<typeof vi.fn>,
  roomDeleteMany: prisma.room.deleteMany as ReturnType<typeof vi.fn>,
};

const sampleCommit: CommitRecord = {
  sha: 'abc123',
  parent: null,
  parents: [],
  message: 'Initial commit',
  ts: Date.now(),
  canvas: JSON.stringify({ version: '5.3.1', objects: [] }),
  branch: 'main',
  isMerge: false,
};

describe('ensureRoom', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls prisma.room.upsert with the correct arguments', async () => {
    mock.roomUpsert.mockResolvedValue({});
    await ensureRoom('room-1', 'user-1');
    expect(mock.roomUpsert).toHaveBeenCalledWith({
      where: { id: 'room-1' },
      create: { id: 'room-1', ownerId: 'user-1' },
      update: {},
    });
  });

  it('uses null ownerId when not provided', async () => {
    mock.roomUpsert.mockResolvedValue({});
    await ensureRoom('room-2');
    expect(mock.roomUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { id: 'room-2', ownerId: null } }),
    );
  });
});

describe('saveCommit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('executes a transaction with commit, branch, and roomState upserts', async () => {
    // $transaction receives an array of promises; we resolve it immediately
    mock.transaction.mockImplementation(async (ops: Promise<unknown>[]) => {
      await Promise.all(ops);
    });
    (prisma.commit.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.branch.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.roomState.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await saveCommit('room-1', sampleCommit, 'user-1');

    expect(mock.transaction).toHaveBeenCalled();
    expect(prisma.commit.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sha: 'abc123' } }),
    );
  });

  it('throws when canvas contains invalid JSON', async () => {
    const badCommit: CommitRecord = { ...sampleCommit, canvas: 'not-json' };
    mock.transaction.mockImplementation(async (ops: Promise<unknown>[]) => {
      await Promise.all(ops);
    });
    (prisma.commit.upsert as ReturnType<typeof vi.fn>).mockImplementation(({ create }: { create: { canvasJson: unknown } }) => {
      // The canvasJson is evaluated eagerly via IIFE; trigger it
      void create.canvasJson;
      return Promise.resolve({});
    });

    await expect(saveCommit('room-1', badCommit)).rejects.toThrow('Invalid canvas JSON');
  });
});

describe('loadRoomSnapshot', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when there are no commits', async () => {
    mock.commitFindMany.mockResolvedValue([]);
    mock.branchFindMany.mockResolvedValue([]);
    mock.roomStateFindUnique.mockResolvedValue(null);

    const result = await loadRoomSnapshot('empty-room');
    expect(result).toBeNull();
  });

  it('returns a RoomSnapshot with correctly mapped commits and branches', async () => {
    const createdAt = new Date(1000);
    mock.commitFindMany.mockResolvedValue([
      {
        sha: 'abc123',
        parentSha: null,
        parents: [],
        message: 'Init',
        createdAt,
        canvasJson: { version: '5.3.1', objects: [] },
        branch: 'main',
        isMerge: false,
      },
    ]);
    mock.branchFindMany.mockResolvedValue([{ name: 'main', headSha: 'abc123' }]);
    mock.roomStateFindUnique.mockResolvedValue({
      headBranch: 'main',
      headSha: 'abc123',
      isDetached: false,
    });

    const snap = await loadRoomSnapshot('room-1');
    expect(snap).not.toBeNull();
    expect(snap!.commits['abc123'].sha).toBe('abc123');
    expect(snap!.commits['abc123'].ts).toBe(1000);
    expect(snap!.branches['main']).toBe('abc123');
    expect(snap!.HEAD).toBe('main');
    expect(snap!.detached).toBeNull();
  });

  it('sets detached when roomState.isDetached is true', async () => {
    const createdAt = new Date(2000);
    mock.commitFindMany.mockResolvedValue([
      {
        sha: 'def456',
        parentSha: null,
        parents: [],
        message: 'Detached',
        createdAt,
        canvasJson: {},
        branch: 'main',
        isMerge: false,
      },
    ]);
    mock.branchFindMany.mockResolvedValue([{ name: 'main', headSha: 'def456' }]);
    mock.roomStateFindUnique.mockResolvedValue({
      headBranch: 'main',
      headSha: 'def456',
      isDetached: true,
    });

    const snap = await loadRoomSnapshot('room-1');
    expect(snap!.detached).toBe('def456');
  });

  it('calls findMany with take: COMMIT_PAGE_SIZE by default', async () => {
    mock.commitFindMany.mockResolvedValue([]);
    mock.branchFindMany.mockResolvedValue([]);
    mock.roomStateFindUnique.mockResolvedValue(null);

    await loadRoomSnapshot('room-1');
    expect(mock.commitFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: COMMIT_PAGE_SIZE }),
    );
  });

  it('passes cursor and skip when cursor option is provided', async () => {
    mock.commitFindMany.mockResolvedValue([]);
    mock.branchFindMany.mockResolvedValue([]);
    mock.roomStateFindUnique.mockResolvedValue(null);

    await loadRoomSnapshot('room-1', { cursor: 'abc123', take: 10 });
    expect(mock.commitFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        cursor: { sha: 'abc123' },
        skip: 1,
      }),
    );
  });
});

describe('getUserRooms', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns rooms from memberships and owned rooms', async () => {
    const now = new Date();
    mock.membershipFindMany.mockResolvedValue([
      {
        role: 'EDITOR',
        room: {
          id: 'r1',
          slug: 'room-1',
          isPublic: true,
          createdAt: now,
          updatedAt: now,
          _count: { commits: 5 },
        },
      },
    ]);
    mock.roomFindMany.mockResolvedValue([
      {
        id: 'r2',
        slug: 'room-2',
        isPublic: false,
        createdAt: now,
        updatedAt: now,
        _count: { commits: 10 },
      },
    ]);

    const rooms = await getUserRooms('usr_1');
    expect(rooms).toHaveLength(2);
    expect(rooms[0].role).toBe('EDITOR');
    expect(rooms[0].commitCount).toBe(5);
    expect(rooms[1].role).toBe('OWNER');
    expect(rooms[1].commitCount).toBe(10);
  });
});

describe('pruneInactiveRooms', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes rooms older than the cutoff and returns the count', async () => {
    mock.roomDeleteMany.mockResolvedValue({ count: 3 });
    const deleted = await pruneInactiveRooms(30);
    expect(deleted).toBe(3);
    expect(mock.roomDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ updatedAt: expect.any(Object) }) }),
    );
  });

  it('uses 30-day default when no argument given', async () => {
    mock.roomDeleteMany.mockResolvedValue({ count: 0 });
    await pruneInactiveRooms();
    expect(mock.roomDeleteMany).toHaveBeenCalled();
  });

  it('excludes active room ids when provided', async () => {
    mock.roomDeleteMany.mockResolvedValue({ count: 1 });
    await pruneInactiveRooms(30, ['room-active-1', 'room-active-2']);
    expect(mock.roomDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { notIn: ['room-active-1', 'room-active-2'] },
        }),
      }),
    );
  });

  it('does not add id filter when excludeRoomIds is empty', async () => {
    mock.roomDeleteMany.mockResolvedValue({ count: 0 });
    await pruneInactiveRooms(30, []);
    const call = mock.roomDeleteMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where).not.toHaveProperty('id');
  });
});


describe('checkRoomAccess (P034)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows anonymous access to a non-existent room (creation-on-join)', async () => {
    mock.roomFindUnique.mockResolvedValue(null);
    const result = await checkRoomAccess('new-room', null);
    expect(result).toEqual({ allowed: true, role: 'EDITOR' });
  });

  it('allows anonymous access to a public room', async () => {
    mock.roomFindUnique.mockResolvedValue({ isPublic: true });
    const result = await checkRoomAccess('pub-room', null);
    expect(result).toEqual({ allowed: true, role: 'EDITOR' });
  });

  it('resolves EDITOR role for authenticated user with membership on a public room', async () => {
    mock.roomFindUnique.mockResolvedValue({ isPublic: true });
    mock.membershipFindUnique.mockResolvedValue({ role: 'EDITOR' });
    const result = await checkRoomAccess('pub-room', 'usr_1');
    expect(result).toEqual({ allowed: true, role: 'EDITOR' });
  });

  it('denies unauthenticated access to a private room', async () => {
    mock.roomFindUnique.mockResolvedValue({ isPublic: false });
    const result = await checkRoomAccess('priv-room', null);
    expect(result).toEqual({ allowed: false, reason: 'PRIVATE_ROOM' });
  });

  it('denies authenticated non-member access to a private room', async () => {
    mock.roomFindUnique.mockResolvedValue({ isPublic: false });
    mock.membershipFindUnique.mockResolvedValue(null);
    const result = await checkRoomAccess('priv-room', 'usr_stranger');
    expect(result).toEqual({ allowed: false, reason: 'NOT_A_MEMBER' });
  });

  it('allows VIEWER role member to access a private room', async () => {
    mock.roomFindUnique.mockResolvedValue({ isPublic: false });
    mock.membershipFindUnique.mockResolvedValue({ role: 'VIEWER' });
    const result = await checkRoomAccess('priv-room', 'usr_viewer');
    expect(result).toEqual({ allowed: true, role: 'VIEWER' });
  });

  it('allows OWNER role member to access a private room', async () => {
    mock.roomFindUnique.mockResolvedValue({ isPublic: false });
    mock.membershipFindUnique.mockResolvedValue({ role: 'OWNER' });
    const result = await checkRoomAccess('priv-room', 'usr_owner');
    expect(result).toEqual({ allowed: true, role: 'OWNER' });
  });
});
