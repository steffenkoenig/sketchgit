import type { PrismaClient } from "@prisma/client";
import type pino from "pino";
import { replayCanvasDelta, type CanvasDelta } from "../sketchgit/git/canvasDelta.js";
import type { CommitRecord } from "./roomRepository.js";

export interface RoomSnapshot {
  commits: Record<string, CommitRecord>;
  branches: Record<string, string>;
  HEAD: string;
  detached: string | null;
}

export async function dbLoadSnapshot(
  roomId: string,
  prisma: PrismaClient,
  logger: pino.Logger
): Promise<RoomSnapshot | null> {
  try {
    const [commits, branches, state] = await Promise.all([
      prisma.commit.findMany({ where: { roomId }, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.branch.findMany({ where: { roomId } }),
      prisma.roomState.findUnique({ where: { roomId } }),
    ]);

    if (commits.length === 0) return null;
    commits.reverse();

    const canvasCache = new Map<string, string>();
    const commitsMap: Record<string, CommitRecord> = {};
    for (const c of commits) {
      let canvasStr: string;
      if (c.storageType === "SNAPSHOT" || !c.parentSha) {
        try { canvasStr = JSON.stringify(c.canvasJson); } catch { canvasStr = '{"objects":[]}'; }
      } else {
        const parentCanvas = canvasCache.get(c.parentSha) ?? '{"objects":[]}';
        try { canvasStr = replayCanvasDelta(parentCanvas, c.canvasJson as unknown as CanvasDelta); }
        catch { try { canvasStr = JSON.stringify(c.canvasJson); } catch { canvasStr = '{"objects":[]}'; } }
      }
      canvasCache.set(c.sha, canvasStr);
      commitsMap[c.sha] = { sha: c.sha, parent: c.parentSha, parents: c.parents, message: c.message, ts: c.createdAt.getTime(), canvas: canvasStr, branch: c.branch, isMerge: c.isMerge };
    }
    const branchesMap: Record<string, string> = {};
    for (const b of branches) branchesMap[b.name] = b.headSha;

    return { commits: commitsMap, branches: branchesMap, HEAD: state?.headBranch ?? "main", detached: state?.isDetached && state.headSha ? state.headSha : null };
  } catch (err) { logger.error({ roomId, err }, "db.loadSnapshot failed"); return null; }
}
