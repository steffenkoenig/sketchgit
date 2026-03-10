/**
 * roomRepository – server-side data access for rooms, commits, and branches.
 * All functions are async and interact with PostgreSQL via the Prisma client.
 */
import { prisma } from "@/lib/db/prisma";

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
        canvasJson: JSON.parse(commit.canvas) as object,
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

/**
 * Load the complete room state from the database. Returns null if the room
 * has no persisted commits yet (i.e. a brand-new room).
 */
export async function loadRoomSnapshot(
  roomId: string
): Promise<RoomSnapshot | null> {
  const [commits, branches, state] = await Promise.all([
    prisma.commit.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } }),
    prisma.branch.findMany({ where: { roomId } }),
    prisma.roomState.findUnique({ where: { roomId } }),
  ]);

  if (commits.length === 0) return null;

  const commitsMap: Record<string, CommitRecord> = {};
  for (const c of commits) {
    commitsMap[c.sha] = {
      sha: c.sha,
      parent: c.parentSha,
      parents: c.parents,
      message: c.message,
      ts: c.createdAt.getTime(),
      canvas: JSON.stringify(c.canvasJson),
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
 */
export async function pruneInactiveRooms(days = 30): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.room.deleteMany({
    where: { updatedAt: { lt: cutoff } },
  });
  return result.count;
}
