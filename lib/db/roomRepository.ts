/**
 * roomRepository – server-side data access for rooms, commits, and branches.
 * All functions are async and interact with PostgreSQL via the Prisma client.
 */
import { prisma } from "@/lib/db/prisma";
import { CommitStorageType, MemberRole } from "@prisma/client";
import { replayCanvasDelta, type CanvasDelta } from "../sketchgit/git/canvasDelta";

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
        canvasStr = replayCanvasDelta(parentCanvas, ancestor.canvasJson as CanvasDelta);
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
        canvasStr = replayCanvasDelta(parentCanvas, c.canvasJson as CanvasDelta);
      } catch {
        try { canvasStr = JSON.stringify(c.canvasJson); }
        catch { canvasStr = '{"objects":[]}'; }
      }
    } else {
      // Parent is outside this page – resolve via DB walk.
      const parentCanvas = await resolveCanvas(c.parentSha);
      try {
        canvasStr = replayCanvasDelta(parentCanvas, c.canvasJson as CanvasDelta);
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
 */
export async function pruneInactiveRooms(
  days = 30,
  excludeRoomIds: string[] = [],
): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.room.deleteMany({
    where: {
      updatedAt: { lt: cutoff },
      ...(excludeRoomIds.length > 0 ? { id: { notIn: excludeRoomIds } } : {}),
    },
  });
  return result.count;
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

  // Room does not exist → creation-on-join, always allowed
  if (!room) return { allowed: true, role: "ANONYMOUS" };

  if (room.isPublic) {
    if (!userId) return { allowed: true, role: "ANONYMOUS" };
    // Resolve the authenticated user's role (if they have a membership)
    const membership = await prisma.roomMembership.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { role: true },
    });
    return { allowed: true, role: membership?.role ?? "ANONYMOUS" };
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
