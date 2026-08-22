
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma before importing the module under test
vi.mock('@/lib/db/prisma', () => {
  const $transaction = vi.fn();
  const $queryRaw = vi.fn();
  const client = {
    $transaction,
    $queryRaw,
    room: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
    commit: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
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
      count: vi.fn(),
      update: vi.fn(),
    },
    roomEvent: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    roomSubscription: {
      upsert: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  // P088 – prismaRead/prismaWrite alias the same mock client (matches the
  // no-replica-configured default this repo runs under in tests).
  return { prisma: client, prismaRead: client, prismaWrite: client };
});

import {
  ensureRoom,
  saveCommit,
  saveCommitWithDelta,
  resolveCommitCanvas,
  loadRoomSnapshot,
  getUserRooms,
  pruneInactiveRooms,
  checkRoomAccess,
  listRoomMembers,
  setRoomMemberRole,
  COMMIT_PAGE_SIZE,
  upsertRoomSubscription,
  deleteRoomSubscription,
  deleteRoomSubscriptionById,
  getRoomSubscription,
  getUserSubscriptions,
  claimSubscriptionForDigest,
  revertDigestClaim,
  getDueSubscriptions,
  getRoomEventsSince,
  type CommitRecord,
} from './roomRepository';
import { CANVAS_JSON_SCHEMA_VERSION } from '../sketchgit/git/canvasSchemaVersion';
import { prisma } from '@/lib/db/prisma';

const mock = {
  transaction: prisma.$transaction as ReturnType<typeof vi.fn>,
  queryRaw: prisma.$queryRaw as ReturnType<typeof vi.fn>,
  roomUpsert: prisma.room.upsert as ReturnType<typeof vi.fn>,
  roomFindUnique: prisma.room.findUnique as ReturnType<typeof vi.fn>,
  commitFindMany: prisma.commit.findMany as ReturnType<typeof vi.fn>,
  commitFindUnique: prisma.commit.findUnique as ReturnType<typeof vi.fn>,
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

  it('P085: stamps schemaVersion on a legacy (unversioned) canvas payload', async () => {
    mock.transaction.mockImplementation(async (ops: Promise<unknown>[]) => {
      await Promise.all(ops);
    });
    let storedCanvasJson: { schemaVersion?: number } | undefined;
    (prisma.commit.upsert as ReturnType<typeof vi.fn>).mockImplementation(({ create }: { create: { canvasJson: { schemaVersion?: number } } }) => {
      storedCanvasJson = create.canvasJson;
      return Promise.resolve({});
    });

    await saveCommit('room-1', sampleCommit, 'user-1');

    expect(storedCanvasJson?.schemaVersion).toBe(CANVAS_JSON_SCHEMA_VERSION);
  });

  it('P085: rejects a canvas payload whose schemaVersion is newer than this build understands', async () => {
    const futureCommit: CommitRecord = {
      ...sampleCommit,
      canvas: JSON.stringify({ schemaVersion: CANVAS_JSON_SCHEMA_VERSION + 1, objects: [] }),
    };
    mock.transaction.mockImplementation(async (ops: Promise<unknown>[]) => {
      await Promise.all(ops);
    });
    (prisma.commit.upsert as ReturnType<typeof vi.fn>).mockImplementation(({ create }: { create: { canvasJson: unknown } }) => {
      void create.canvasJson;
      return Promise.resolve({});
    });

    await expect(saveCommit('room-1', futureCommit)).rejects.toThrow('schemaVersion');
  });
});

describe('saveCommitWithDelta (P033/P085)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stamps schemaVersion on a legacy canvas payload and stores it as SNAPSHOT (no parent)', async () => {
    mock.transaction.mockImplementation(async (ops: Promise<unknown>[]) => {
      await Promise.all(ops);
    });
    let storedCanvasJson: { schemaVersion?: number } | undefined;
    (prisma.commit.upsert as ReturnType<typeof vi.fn>).mockImplementation(({ create }: { create: { canvasJson: { schemaVersion?: number } } }) => {
      storedCanvasJson = create.canvasJson;
      return Promise.resolve({});
    });

    await saveCommitWithDelta('room-1', sampleCommit, 'user-1');

    expect(storedCanvasJson?.schemaVersion).toBe(CANVAS_JSON_SCHEMA_VERSION);
  });

  it('rejects a canvas payload newer than this build understands', async () => {
    const futureCommit: CommitRecord = {
      ...sampleCommit,
      canvas: JSON.stringify({ schemaVersion: CANVAS_JSON_SCHEMA_VERSION + 1, objects: [] }),
    };

    await expect(saveCommitWithDelta('room-1', futureCommit)).rejects.toThrow('schemaVersion');
    // Should fail before ever attempting the transaction.
    expect(mock.transaction).not.toHaveBeenCalled();
  });
});

describe('resolveCommitCanvas (P085)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('migrates a legacy (unversioned) stored SNAPSHOT to the current schema version', async () => {
    mock.queryRaw.mockResolvedValue([
      { sha: 'abc123', parentSha: null, canvasJson: { objects: [] }, storageType: 'SNAPSHOT' },
    ]);

    const result = await resolveCommitCanvas('abc123', 'room-1') as { schemaVersion?: number } | null;

    expect(result?.schemaVersion).toBe(CANVAS_JSON_SCHEMA_VERSION);
  });

  it('returns null when no commit chain is found', async () => {
    mock.queryRaw.mockResolvedValue([]);
    const result = await resolveCommitCanvas('missing-sha', 'room-1');
    expect(result).toBeNull();
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

  // ── P093: password protection ──────────────────────────────────────────

  it('denies access to a password-protected public room without an unlock', async () => {
    mock.roomFindUnique.mockResolvedValue({ isPublic: true, passwordHash: 'hash123', ownerId: null });
    const result = await checkRoomAccess('pw-room', null);
    expect(result).toEqual({ allowed: false, reason: 'PASSWORD_REQUIRED' });
  });

  it('denies an authenticated non-owner without an unlock, even with membership', async () => {
    mock.roomFindUnique.mockResolvedValue({ isPublic: true, passwordHash: 'hash123', ownerId: 'usr_owner' });
    const result = await checkRoomAccess('pw-room', 'usr_member');
    expect(result).toEqual({ allowed: false, reason: 'PASSWORD_REQUIRED' });
    // Membership lookup should short-circuit before this — password gate wins.
    expect(mock.membershipFindUnique).not.toHaveBeenCalled();
  });

  it('allows access to a password-protected room when hasPasswordUnlock is true', async () => {
    mock.roomFindUnique.mockResolvedValue({ isPublic: true, passwordHash: 'hash123', ownerId: null });
    const result = await checkRoomAccess('pw-room', null, true);
    expect(result).toEqual({ allowed: true, role: 'EDITOR' });
  });

  it('allows the room owner into a password-protected room without an unlock', async () => {
    mock.roomFindUnique.mockResolvedValue({ isPublic: true, passwordHash: 'hash123', ownerId: 'usr_owner' });
    mock.membershipFindUnique.mockResolvedValue(null);
    const result = await checkRoomAccess('pw-room', 'usr_owner', false);
    expect(result.allowed).toBe(true);
  });

  it('does not treat an anonymous requester as the owner of an ownerless password-protected room', async () => {
    // Regression guard: ownerId is nullable, and userId is null for anonymous
    // requesters — `userId === room.ownerId` must not evaluate true for
    // null === null, or anonymous users would bypass every ownerless room's
    // password.
    mock.roomFindUnique.mockResolvedValue({ isPublic: true, passwordHash: 'hash123', ownerId: null });
    const result = await checkRoomAccess('pw-room', null, false);
    expect(result).toEqual({ allowed: false, reason: 'PASSWORD_REQUIRED' });
  });

  it('does not require a password when passwordHash is null', async () => {
    mock.roomFindUnique.mockResolvedValue({ isPublic: true, passwordHash: null, ownerId: null });
    const result = await checkRoomAccess('pw-room', null);
    expect(result).toEqual({ allowed: true, role: 'EDITOR' });
  });

  it('password protection applies to private rooms too, checked before the private/member logic', async () => {
    mock.roomFindUnique.mockResolvedValue({ isPublic: false, passwordHash: 'hash123', ownerId: 'usr_owner' });
    const result = await checkRoomAccess('pw-priv-room', 'usr_member', false);
    expect(result).toEqual({ allowed: false, reason: 'PASSWORD_REQUIRED' });
  });
});

describe('listRoomMembers (P091)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps memberships to summaries, newest-joined first', async () => {
    mock.membershipFindMany.mockResolvedValue([
      { userId: 'usr_1', role: 'OWNER', joinedAt: new Date('2026-01-02'), user: { name: 'Alice', email: 'alice@example.com' } },
    ]);
    const result = await listRoomMembers('room_1');
    expect(mock.membershipFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roomId: 'room_1' }, orderBy: { joinedAt: 'desc' } }),
    );
    expect(result).toEqual([
      { userId: 'usr_1', role: 'OWNER', joinedAt: new Date('2026-01-02'), name: 'Alice', email: 'alice@example.com' },
    ]);
  });
});

describe('setRoomMemberRole (P091)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns NOT_A_MEMBER when the user has no membership', async () => {
    mock.membershipFindUnique.mockResolvedValue(null);
    const result = await setRoomMemberRole('room_1', 'usr_1', 'VIEWER');
    expect(result).toEqual({ ok: false, reason: 'NOT_A_MEMBER' });
  });

  it('refuses to demote the last remaining OWNER', async () => {
    mock.membershipFindUnique.mockResolvedValue({ role: 'OWNER' });
    (prisma.roomMembership.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    const result = await setRoomMemberRole('room_1', 'usr_1', 'EDITOR');
    expect(result).toEqual({ ok: false, reason: 'LAST_OWNER' });
    expect(prisma.roomMembership.update).not.toHaveBeenCalled();
  });

  it('allows demoting an OWNER when another OWNER remains', async () => {
    mock.membershipFindUnique.mockResolvedValue({ role: 'OWNER' });
    (prisma.roomMembership.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (prisma.roomMembership.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const result = await setRoomMemberRole('room_1', 'usr_1', 'EDITOR');
    expect(result).toEqual({ ok: true });
    expect(prisma.roomMembership.update).toHaveBeenCalledWith({
      where: { roomId_userId: { roomId: 'room_1', userId: 'usr_1' } },
      data: { role: 'EDITOR' },
    });
  });

  it('updates a non-OWNER role without checking the owner count', async () => {
    mock.membershipFindUnique.mockResolvedValue({ role: 'EDITOR' });
    (prisma.roomMembership.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const result = await setRoomMemberRole('room_1', 'usr_1', 'VIEWER');
    expect(result).toEqual({ ok: true });
    expect(prisma.roomMembership.count).not.toHaveBeenCalled();
  });
});

describe('Room email subscriptions (P094)', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('upsertRoomSubscription', () => {
    it('upserts on the roomId_userId composite key', async () => {
      (prisma.roomSubscription.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
      await upsertRoomSubscription('room_1', 'usr_1', 'DAILY');
      expect(prisma.roomSubscription.upsert).toHaveBeenCalledWith({
        where: { roomId_userId: { roomId: 'room_1', userId: 'usr_1' } },
        create: { roomId: 'room_1', userId: 'usr_1', frequency: 'DAILY' },
        update: { frequency: 'DAILY' },
      });
    });
  });

  describe('deleteRoomSubscription / deleteRoomSubscriptionById', () => {
    it('returns true when a row was deleted', async () => {
      (prisma.roomSubscription.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
      expect(await deleteRoomSubscription('room_1', 'usr_1')).toBe(true);
    });

    it('returns false when no row matched', async () => {
      (prisma.roomSubscription.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
      expect(await deleteRoomSubscription('room_1', 'usr_1')).toBe(false);
    });

    it('deleteRoomSubscriptionById deletes by id, not roomId/userId', async () => {
      (prisma.roomSubscription.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
      const result = await deleteRoomSubscriptionById('sub_1');
      expect(result).toBe(true);
      expect(prisma.roomSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: 'sub_1' } });
    });
  });

  describe('getRoomSubscription', () => {
    it('returns null when no subscription exists', async () => {
      (prisma.roomSubscription.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      expect(await getRoomSubscription('room_1', 'usr_1')).toBeNull();
    });

    it('returns the subscription id and frequency', async () => {
      (prisma.roomSubscription.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'sub_1', frequency: 'HOURLY' });
      expect(await getRoomSubscription('room_1', 'usr_1')).toEqual({ id: 'sub_1', frequency: 'HOURLY' });
    });
  });

  describe('getUserSubscriptions', () => {
    it('maps rows to flattened summaries with roomSlug', async () => {
      (prisma.roomSubscription.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'sub_1', roomId: 'room_1', frequency: 'DAILY', createdAt: new Date(1000), room: { slug: 'my-room' } },
        { id: 'sub_2', roomId: 'room_2', frequency: 'HOURLY', createdAt: new Date(2000), room: { slug: null } },
      ]);
      const result = await getUserSubscriptions('usr_1');
      expect(result).toEqual([
        { id: 'sub_1', roomId: 'room_1', frequency: 'DAILY', createdAt: new Date(1000), roomSlug: 'my-room' },
        { id: 'sub_2', roomId: 'room_2', frequency: 'HOURLY', createdAt: new Date(2000), roomSlug: null },
      ]);
    });
  });

  describe('claimSubscriptionForDigest', () => {
    it('returns true when the conditional update matched a row', async () => {
      (prisma.roomSubscription.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
      const windowStart = new Date('2026-01-01T00:00:00Z');
      const sentAt = new Date('2026-01-02T00:00:00Z');
      const result = await claimSubscriptionForDigest('sub_1', windowStart, sentAt);
      expect(result).toBe(true);
      expect(prisma.roomSubscription.updateMany).toHaveBeenCalledWith({
        where: { id: 'sub_1', OR: [{ lastSentAt: null }, { lastSentAt: { lt: windowStart } }] },
        data: { lastSentAt: sentAt },
      });
    });

    it('returns false when another instance already claimed it (0 rows matched)', async () => {
      (prisma.roomSubscription.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
      const result = await claimSubscriptionForDigest('sub_1', new Date(), new Date());
      expect(result).toBe(false);
    });
  });

  describe('revertDigestClaim', () => {
    it('restores the previous lastSentAt, guarded on the exact sentAt this call set', async () => {
      (prisma.roomSubscription.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
      const sentAt = new Date('2026-01-02T00:00:00Z');
      const previous = new Date('2026-01-01T00:00:00Z');
      await revertDigestClaim('sub_1', sentAt, previous);
      expect(prisma.roomSubscription.updateMany).toHaveBeenCalledWith({
        where: { id: 'sub_1', lastSentAt: sentAt },
        data: { lastSentAt: previous },
      });
    });

    it('reverts to null when there was no previous send', async () => {
      (prisma.roomSubscription.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
      const sentAt = new Date('2026-01-02T00:00:00Z');
      await revertDigestClaim('sub_1', sentAt, null);
      expect(prisma.roomSubscription.updateMany).toHaveBeenCalledWith({
        where: { id: 'sub_1', lastSentAt: sentAt },
        data: { lastSentAt: null },
      });
    });
  });

  describe('getDueSubscriptions', () => {
    it('filters out subscribers with no email and flattens the shape, including lastSentAt', async () => {
      const lastSentAt = new Date('2025-12-31T00:00:00Z');
      (prisma.roomSubscription.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'sub_1', roomId: 'room_1', userId: 'usr_1', lastSentAt, user: { email: 'a@b.com' }, room: { slug: 'my-room' } },
        { id: 'sub_2', roomId: 'room_2', userId: 'usr_2', lastSentAt: null, user: { email: null }, room: { slug: null } },
      ]);
      const result = await getDueSubscriptions('DAILY', new Date('2026-01-01T00:00:00Z'));
      // The email:null row would already be excluded by the DB-level
      // `user: { email: { not: null } }` filter in the real query; the
      // in-memory filter here is a defensive belt-and-suspenders guard.
      expect(result).toEqual([
        { id: 'sub_1', roomId: 'room_1', userId: 'usr_1', userEmail: 'a@b.com', roomSlug: 'my-room', lastSentAt },
      ]);
    });

    it('queries with the frequency and windowStart passed through', async () => {
      (prisma.roomSubscription.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const windowStart = new Date('2026-01-01T00:00:00Z');
      await getDueSubscriptions('HOURLY', windowStart);
      expect(prisma.roomSubscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            frequency: 'HOURLY',
            OR: [{ lastSentAt: null }, { lastSentAt: { lt: windowStart } }],
          }),
        }),
      );
    });
  });

  describe('getRoomEventsSince', () => {
    it('queries events created after the given date, oldest-first, capped at 200', async () => {
      (prisma.roomEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const since = new Date('2026-01-01T00:00:00Z');
      await getRoomEventsSince('room_1', since);
      expect(prisma.roomEvent.findMany).toHaveBeenCalledWith({
        where: { roomId: 'room_1', createdAt: { gt: since } },
        orderBy: { createdAt: 'asc' },
        take: 200,
        select: { id: true, eventType: true, actorId: true, payload: true, createdAt: true },
      });
    });
  });
});
