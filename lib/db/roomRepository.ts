/**
 * roomRepository – server-side data access for rooms, commits, and branches.
 * All functions are async and interact with PostgreSQL via the Prisma client.
 */
import { prisma } from "@/lib/db/prisma";
import { CommitStorageType, MemberRole, RoomEventType } from "@prisma/client";
import { replayCanvasDelta, type CanvasDelta } from "../sketchgit/git/canvasDelta";

export type { RoomEventType };

// ─── Types (mirror the client-side git model) ─────────────────────────────────

export interface CommitRecord {
  sha: string;
  parent: string | null;
  parents: string[];
  message: string;
  ts: number;
  canvas: string;
  branch: string;
  isMerge: boolean;
}

export interface RoomSnapshot {
  commits: Record<string, CommitRecord>;
  branches: Record<string, string>;
  HEAD: string;
  detached: string | null;
}

// ─── Room management ──────────────────────────────────────────────────────────

/**
 * Ensure a room record exists in the database.
 * Creates it on first access; safe to call on every join.
 */
export async function ensureRoom(
  roomId: string,
  ownerId?: string | null
): Promise<void> {
  await prisma.room.upsert({
    where: { id: roomId },
    create: { id: roomId, ownerId: ownerId ?? null },
    update: {},
  });
}

// ─── Commit persistence ───────────────────────────────────────────────────────

/**
 * Persist a single commit and update the corresponding branch pointer and room
 * HEAD state. All three writes happen in a single transaction.
 */
export async function saveCommit(
  roomId: string,
  commit: CommitRecord,
  userId?: string | null
): Promise<void> {
  await prisma.$transaction([
    prisma.commit.upsert({
      where: { sha: commit.sha },
      create: {
        sha: commit.sha,
        roomId,
        parentSha: commit.parent ?? null,
        parents: commit.parents,
        branch: commit.branch,
        message: commit.message,
        canvasJson: (() => {
          try {
            return JSON.parse(commit.canvas) as object;
          } catch {
            throw new Error(`Invalid canvas JSON for commit ${commit.sha}`);
          }
        })(),
        isMerge: commit.isMerge,
        authorId: userId ?? null,
      },
      update: {},
    }),
    prisma.branch.upsert({
      where: { roomId_name: { roomId, name: commit.branch } },
      create: { roomId, name: commit.branch, headSha: commit.sha },
      update: { headSha: commit.sha },
    }),
    prisma.roomState.upsert({
      where: { roomId },
      create: {
        roomId,
        headSha: commit.sha,
        headBranch: commit.branch,
        isDetached: false,
      },
      update: { headSha: commit.sha, headBranch: commit.branch },
    }),
  ]);
}

// ─── Full-state load ──────────────────────────────────────────────────────────

export const COMMIT_PAGE_SIZE = 100;

/**
 * Load the complete room state from the database. Returns null if the room
 * has no persisted commits yet (i.e. a brand-new room).
 *
 * Accepts optional cursor-based pagination: pass `cursor` (a commit SHA) to
 * start after that commit, and `take` to limit the page size (default 100).
 */
export async function loadRoomSnapshot(
  roomId: string,
  options?: { cursor?: string; take?: number }
): Promise<RoomSnapshot | null> {
  const take = options?.take ?? COMMIT_PAGE_SIZE;
  const [commits, branches, state] = await Promise.all([
    prisma.commit.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" },
      take,
      ...(options?.cursor ? { cursor: { sha: options.cursor }, skip: 1 } : {}),
    }),
    prisma.branch.findMany({ where: { roomId } }),
    prisma.roomState.findUnique({ where: { roomId } }),
  ]);

  if (commits.length === 0) return null;

  // Restore chronological (oldest-first) order for client replay.
  commits.reverse();

  // Build the set of SHAs present in this page so we can detect missing parents.
  const pageShAs = new Set(commits.map((c) => c.sha));

  // P033: reconstruct DELTA commits by replaying against parent canvas.
  // When a DELTA's parent is outside the page, fetch the ancestor chain from the
  // database so reconstruction is always correct regardless of page boundaries.
  const canvasCache = new Map<string, string>();

  async function resolveCanvas(sha: string): Promise<string> {
    if (canvasCache.has(sha)) return canvasCache.get(sha)!;
    // Ancestor not in the current page – fetch it directly.
    const ancestor = await prisma.commit.findFirst({
      where: { roomId, sha },
      select: { sha: true, parentSha: true, canvasJson: true, storageType: true },
    });
    if (!ancestor) return '{"objects":[]}';
    let canvasStr: string;
    if (ancestor.storageType === CommitStorageType.SNAPSHOT || !ancestor.parentSha) {
      try { canvasStr = JSON.stringify(ancestor.canvasJson); }
      catch { canvasStr = '{"objects":[]}'; }
    } else {
      const parentCanvas = await resolveCanvas(ancestor.parentSha);
      try {
        canvasStr = replayCanvasDelta(parentCanvas, ancestor.canvasJson as unknown as CanvasDelta);
      } catch {
        try { canvasStr = JSON.stringify(ancestor.canvasJson); }
        catch { canvasStr = '{"objects":[]}'; }
      }
    }
    canvasCache.set(sha, canvasStr);
    return canvasStr;
  }

  const commitsMap: Record<string, CommitRecord> = {};
  for (const c of commits) {
    let canvasStr: string;
    if (c.storageType === CommitStorageType.SNAPSHOT || !c.parentSha) {
      try { canvasStr = JSON.stringify(c.canvasJson); }
      catch { canvasStr = '{"objects":[]}'; }
    } else if (pageShAs.has(c.parentSha) && canvasCache.has(c.parentSha)) {
      // Fast path: parent is already in the cache (within this page).
      const parentCanvas = canvasCache.get(c.parentSha)!;
      try {
        canvasStr = replayCanvasDelta(parentCanvas, c.canvasJson as unknown as CanvasDelta);
      } catch {
        try { canvasStr = JSON.stringify(c.canvasJson); }
        catch { canvasStr = '{"objects":[]}'; }
      }
    } else {
      // Parent is outside this page – resolve via DB walk.
      const parentCanvas = await resolveCanvas(c.parentSha);
      try {
        canvasStr = replayCanvasDelta(parentCanvas, c.canvasJson as unknown as CanvasDelta);
      } catch {
        try { canvasStr = JSON.stringify(c.canvasJson); }
        catch { canvasStr = '{"objects":[]}'; }
      }
    }
    canvasCache.set(c.sha, canvasStr);
    commitsMap[c.sha] = {
      sha: c.sha,
      parent: c.parentSha,
      parents: c.parents as string[],
      message: c.message,
      ts: c.createdAt.getTime(),
      canvas: canvasStr,
      branch: c.branch,
      isMerge: c.isMerge,
    };
  }

  const branchesMap: Record<string, string> = {};
  for (const b of branches) {
    branchesMap[b.name] = b.headSha;
  }

  return {
    commits: commitsMap,
    branches: branchesMap,
    HEAD: state?.headBranch ?? "main",
    detached: state?.isDetached && state.headSha ? state.headSha : null,
  };
}

// ─── User's room collection ───────────────────────────────────────────────────

export interface RoomSummary {
  id: string;
  slug: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  commitCount: number;
  role: "OWNER" | "EDITOR" | "VIEWER";
}

/**
 * Return all rooms accessible to a given user (owned + membership).
 */
export async function getUserRooms(userId: string): Promise<RoomSummary[]> {
  const memberships = await prisma.roomMembership.findMany({
    where: { userId },
    include: {
      room: {
        include: { _count: { select: { commits: true } } },
      },
    },
    orderBy: { room: { updatedAt: "desc" } },
  });

  const ownedRooms = await prisma.room.findMany({
    where: { ownerId: userId, memberships: { none: { userId } } },
    include: { _count: { select: { commits: true } } },
    orderBy: { updatedAt: "desc" },
  });

  const results: RoomSummary[] = [];

  for (const m of memberships) {
    results.push({
      id: m.room.id,
      slug: m.room.slug,
      isPublic: m.room.isPublic,
      createdAt: m.room.createdAt,
      updatedAt: m.room.updatedAt,
      commitCount: m.room._count.commits,
      role: m.role,
    });
  }

  for (const r of ownedRooms) {
    results.push({
      id: r.id,
      slug: r.slug,
      isPublic: r.isPublic,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      commitCount: r._count.commits,
      role: "OWNER",
    });
  }

  return results;
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

/**
 * Delete rooms that have had no commits and no state updates for `days` days.
 * Cascades to commits, branches, memberships, and room state.
 *
 * Rooms with IDs in `excludeRoomIds` are skipped (e.g. currently active rooms).
 * Also prunes RoomEvent rows older than `eventRetentionDays` (P074).
 */
export async function pruneInactiveRooms(
  days = 30,
  excludeRoomIds: string[] = [],
  eventRetentionDays = 90,
): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const eventCutoff = new Date(Date.now() - eventRetentionDays * 24 * 60 * 60 * 1000);

  // P074 – delete stale activity-log rows first (no cascade needed; just old events)
  await prisma.roomEvent.deleteMany({ where: { createdAt: { lt: eventCutoff } } });

  const result = await prisma.room.deleteMany({
    where: {
      updatedAt: { lt: cutoff },
      ...(excludeRoomIds.length > 0 ? { id: { notIn: excludeRoomIds } } : {}),
    },
  });
  return result.count;
}

// ─── Activity feed (P074) ─────────────────────────────────────────────────────

/**
 * Append a single event to the room activity log.
 * Non-blocking: callers should `void` this where latency matters.
 */
export async function appendRoomEvent(
  roomId: string,
  eventType: RoomEventType,
  actorId: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await prisma.roomEvent.create({ data: { roomId, eventType, actorId, payload: payload as any } });
}

/**
 * Return the most recent `take` events for a room, ordered newest-first.
 * Supports cursor-based pagination via `cursor` (a `createdAt` ISO string).
 */
export async function getRoomEvents(
  roomId: string,
  take = 100,
  cursor?: string,
): Promise<Array<{
  id: string;
  eventType: RoomEventType;
  actorId: string | null;
  payload: unknown;
  createdAt: Date;
}>> {
  return prisma.roomEvent.findMany({
    where: {
      roomId,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(take, 100),
    select: { id: true, eventType: true, actorId: true, payload: true, createdAt: true },
  });
}

// ─── Access control ───────────────────────────────────────────────────────────

/** Role type used in WebSocket access control checks. */
export type ClientRole = MemberRole | "ANONYMOUS";

export type RoomAccessResult =
  | { allowed: true; role: ClientRole }
  | { allowed: false; reason: "ROOM_NOT_FOUND" | "PRIVATE_ROOM" | "NOT_A_MEMBER" };

/**
 * Determine whether a user is allowed to connect to a room via WebSocket.
 *
 * Rules:
 * - Room does not exist yet → allowed as ANONYMOUS (creation-on-join semantics).
 * - Room is public → any user (including anonymous) is allowed.
 * - Room is private + unauthenticated user → denied with reason PRIVATE_ROOM.
 * - Room is private + authenticated user → allowed only if a membership record
 *   exists; otherwise denied with reason NOT_A_MEMBER.
 */
export async function checkRoomAccess(
  roomId: string,
  userId: string | null,
): Promise<RoomAccessResult> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { isPublic: true },
  });

  // Room does not exist → creation-on-join, always allowed.
  // Give EDITOR so the creator can immediately draw/commit.
  if (!room) return { allowed: true, role: "EDITOR" };

  if (room.isPublic) {
    if (!userId) {
      // Anonymous users get full editor access in public rooms (anonymous-first UX).
      return { allowed: true, role: "EDITOR" };
    }
    // Resolve the authenticated user's role (if they have a membership)
    const membership = await prisma.roomMembership.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { role: true },
    });
    // Non-members in public rooms get EDITOR role; explicit memberships are honoured.
    return { allowed: true, role: membership?.role ?? "EDITOR" };
  }

  // Private room
  if (!userId) return { allowed: false, reason: "PRIVATE_ROOM" };

  const membership = await prisma.roomMembership.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: { role: true },
  });

  if (!membership) return { allowed: false, reason: "NOT_A_MEMBER" };
  return { allowed: true, role: membership.role };
}

// ─── P049: Slug resolution ────────────────────────────────────────────────────

/**
 * Resolve a room identifier that may be either a room ID or a slug.
 * Returns the canonical room ID, or null if no room matches.
 */
export async function resolveRoomId(idOrSlug: string): Promise<string | null> {
  if (!idOrSlug) return null;
  const room = await prisma.room.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: { id: true },
  });
  return room?.id ?? null;
}

// ─── Room lookup helpers (BUG-001) ────────────────────────────────────────────

/**
 * Return isPublic flag for a room, or null if the room does not exist.
 * Used by route handlers that need to gate access on room visibility.
 */
export async function getRoomPublicFlag(
  roomId: string,
): Promise<{ isPublic: boolean } | null> {
  return prisma.room.findUnique({ where: { id: roomId }, select: { isPublic: true } });
}

/**
 * Return a user's membership role in a room, or null if they are not a member.
 */
export async function getRoomMembership(
  roomId: string,
  userId: string,
): Promise<{ role: MemberRole } | null> {
  return prisma.roomMembership.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: { role: true },
  });
}

/**
 * Return the room owner id and whether `userId` has an OWNER membership.
 * Returns null when the room does not exist.
 */
export async function getRoomOwnership(
  roomId: string,
  userId: string,
): Promise<{ ownerId: string | null; isOwner: boolean } | null> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: {
      ownerId: true,
      memberships: {
        where: { userId, role: "OWNER" },
        select: { role: true },
      },
    },
  });
  if (!room) return null;
  return {
    ownerId: room.ownerId,
    isOwner: room.ownerId === userId || room.memberships.length > 0,
  };
}

/**
 * Update the slug of a room and return the updated id + slug.
 * Throws the raw Prisma error on constraint violations (callers handle P2002).
 */
export async function updateRoomSlug(
  roomId: string,
  slug: string | null,
): Promise<{ id: string; slug: string | null }> {
  return prisma.room.update({
    where: { id: roomId },
    data: { slug },
    select: { id: true, slug: true },
  });
}

/**
 * Fetch a page of commits for a room (newest first) with cursor-based pagination.
 * Returns the commits array and a `nextCursor` SHA (null when no more pages).
 */
export async function getCommitPage(
  roomId: string,
  take: number,
  cursor?: string,
): Promise<{
  commits: Array<{
    sha: string;
    parentSha: string | null;
    branch: string;
    message: string;
    createdAt: Date;
    isMerge: boolean;
  }>;
  nextCursor: string | null;
}> {
  const rows = await prisma.commit.findMany({
    where: { roomId },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { cursor: { sha: cursor }, skip: 1 } : {}),
    select: {
      sha: true,
      parentSha: true,
      branch: true,
      message: true,
      createdAt: true,
      isMerge: true,
    },
  });
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? (page[page.length - 1]?.sha ?? null) : null;
  return { commits: page, nextCursor };
}

// ─── Invitation helpers (BUG-001) ────────────────────────────────────────────

/**
 * Persist a new room invitation.
 */
export async function createRoomInvitation(data: {
  token: string;
  roomId: string;
  createdBy: string;
  expiresAt: Date;
  maxUses: number;
}): Promise<void> {
  await prisma.roomInvitation.create({ data });
}

/**
 * Delete all invitations for a room. Returns the number of deleted records.
 */
export async function revokeRoomInvitations(roomId: string): Promise<number> {
  const result = await prisma.roomInvitation.deleteMany({ where: { roomId } });
  return result.count;
}

/**
 * Return an invitation by token, including the room's isPublic flag.
 * Returns null when the token does not exist.
 */
export async function getInvitationByToken(token: string): Promise<{
  roomId: string;
  expiresAt: Date;
  maxUses: number;
  useCount: number;
  room: { isPublic: boolean };
} | null> {
  return prisma.roomInvitation.findUnique({
    where: { token },
    select: {
      roomId: true,
      expiresAt: true,
      maxUses: true,
      useCount: true,
      room: { select: { isPublic: true } },
    },
  });
}

/**
 * Atomically increment a token's useCount, enforcing maxUses at the DB level.
 * Returns true when the increment succeeded (i.e. there was a remaining use),
 * false when the invitation was already exhausted (concurrent race or invalid token).
 */
export async function consumeInvitationToken(
  token: string,
  maxUses: number,
): Promise<boolean> {
  const result = await prisma.roomInvitation.updateMany({
    where: { token, useCount: { lt: maxUses } },
    data: { useCount: { increment: 1 } },
  });
  return result.count > 0;
}

/**
 * Walk the parentSha chain backwards from `sha`, replaying DELTA commits
 * against their parents, until a SNAPSHOT or root is reached.
 * Returns the reconstructed canvas JSON object, or null when the commit does not exist.
 * Maximum chain depth is capped to prevent infinite loops on corrupt data.
 */
export async function resolveCommitCanvas(
  sha: string,
  roomId: string,
  maxDepth = 10_000,
): Promise<object | null> {
  const visited = new Set<string>();
  const chain: {
    sha: string;
    parentSha: string | null;
    canvasJson: import("@prisma/client").Prisma.JsonValue;
    storageType: import("@prisma/client").CommitStorageType;
  }[] = [];

  let currentSha: string | null = sha;
  let depth = 0;

  while (currentSha && depth < maxDepth) {
    if (visited.has(currentSha)) break; // cycle guard

    const row = await prisma.commit.findFirst({
      where: { roomId, sha: currentSha },
      select: { sha: true, parentSha: true, canvasJson: true, storageType: true },
    });

    if (!row) return null; // missing ancestor

    chain.push(row);
    visited.add(currentSha);
    depth++;

    if (row.storageType === CommitStorageType.SNAPSHOT || !row.parentSha) break;
    currentSha = row.parentSha;
  }

  if (chain.length === 0) return null;

  // Built target → base; replay requires oldest-first.
  chain.reverse();

  const canvasCache = new Map<string, string>();
  for (const c of chain) {
    let canvasStr: string;
    if (c.storageType === CommitStorageType.SNAPSHOT || !c.parentSha) {
      try { canvasStr = JSON.stringify(c.canvasJson); }
      catch { canvasStr = '{"objects":[]}'; }
    } else {
      const parentCanvas = canvasCache.get(c.parentSha) ?? '{"objects":[]}';
      try {
        canvasStr = replayCanvasDelta(parentCanvas, c.canvasJson as unknown as CanvasDelta);
      } catch {
        try { canvasStr = JSON.stringify(c.canvasJson); }
        catch { canvasStr = '{"objects":[]}'; }
      }
    }
    canvasCache.set(c.sha, canvasStr);
  }

  const resolved = canvasCache.get(sha);
  if (!resolved) return null;
  try {
    return JSON.parse(resolved) as object;
  } catch {
    return null;
  }
}

/**
 * Upsert a room membership for `userId`, granting the given `role`.
 * No-op if the user is already a member (does not downgrade existing roles).
 */
export async function addRoomMember(
  roomId: string,
  userId: string,
  role: "OWNER" | "EDITOR" | "VIEWER",
): Promise<void> {
  await prisma.roomMembership.upsert({
    where: { roomId_userId: { roomId, userId } },
    update: {},
    create: { roomId, userId, role },
  });
}

/**
 * Check that a commit with the given SHA exists and belongs to `roomId`.
 * Returns the SHA when found, null otherwise.
 */
export async function getCommitShaInRoom(
  sha: string,
  roomId: string,
): Promise<string | null> {
  const row = await prisma.commit.findUnique({
    where: { sha },
    select: { sha: true, roomId: true },
  });
  return row && row.roomId === roomId ? row.sha : null;
}

/**
 * Return the HEAD SHA for a room from its RoomState record.
 * Returns null when the room has no commits yet.
 */
export async function getRoomHeadSha(roomId: string): Promise<string | null> {
  const state = await prisma.roomState.findUnique({
    where: { roomId },
    select: { headSha: true },
  });
  return state?.headSha ?? null;
}
