/**
 * GET /api/rooms/[roomId]/export?format=png|svg&sha=<commitSha>
 *
 * P039 – Export a room's canvas as a PNG or SVG file.
 *
 * When `sha` is omitted the room's current HEAD commit is used.
 * For public rooms no authentication is required.
 * Delta commits (P033) are reconstructed by replaying the delta chain.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { validate } from "@/lib/api/validate";
import { CommitStorageType } from "@prisma/client";
import { replayCanvasDelta, type CanvasDelta } from "@/lib/sketchgit/git/canvasDelta";
import { renderToSVG, renderToPNG } from "@/lib/export/canvasRenderer";

const QuerySchema = z.object({
  format: z.enum(["png", "svg"]).default("png"),
  sha: z.string().max(64).optional(),
});

/** Walk the parentSha chain to reconstruct the canvas JSON for a given commit. */
async function resolveCanvasJson(
  commitSha: string,
  roomId: string,
): Promise<object | null> {
  // Load all commits for the room (bounded by P029 page size) ordered oldest-first.
  const commits = await prisma.commit.findMany({
    where: { roomId },
    orderBy: { createdAt: "asc" },
    select: {
      sha: true,
      parentSha: true,
      canvasJson: true,
      storageType: true,
    },
  });

  if (commits.length === 0) return null;

  const canvasCache = new Map<string, string>();
  for (const c of commits) {
    let canvasStr: string;
    if (c.storageType === CommitStorageType.SNAPSHOT || !c.parentSha) {
      try { canvasStr = JSON.stringify(c.canvasJson); }
      catch { canvasStr = '{"objects":[]}'; }
    } else {
      const parentCanvas = canvasCache.get(c.parentSha) ?? '{"objects":[]}';
      try {
        canvasStr = replayCanvasDelta(parentCanvas, c.canvasJson as CanvasDelta);
      } catch {
        try { canvasStr = JSON.stringify(c.canvasJson); }
        catch { canvasStr = '{"objects":[]}'; }
      }
    }
    canvasCache.set(c.sha, canvasStr);
  }

  const resolved = canvasCache.get(commitSha);
  if (!resolved) return null;
  try {
    return JSON.parse(resolved) as object;
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const rawQuery = Object.fromEntries(req.nextUrl.searchParams.entries());
  const v = validate(QuerySchema, rawQuery);
  if (!v.success) return v.response;

  const { format, sha: reqSha } = v.data;

  // Resolve target commit SHA
  let targetSha: string;
  if (reqSha) {
    const exists = await prisma.commit.findUnique({
      where: { sha: reqSha },
      select: { sha: true, roomId: true },
    });
    if (!exists || exists.roomId !== roomId) {
      return NextResponse.json({ error: "Commit not found" }, { status: 404 });
    }
    targetSha = reqSha;
  } else {
    const state = await prisma.roomState.findUnique({
      where: { roomId },
      select: { headSha: true },
    });
    if (!state?.headSha) {
      return NextResponse.json({ error: "Room not found or has no commits" }, { status: 404 });
    }
    targetSha = state.headSha;
  }

  const canvasJson = await resolveCanvasJson(targetSha, roomId);
  if (!canvasJson) {
    return NextResponse.json({ error: "Failed to resolve canvas state" }, { status: 404 });
  }

  const filename = `canvas-${roomId}`;

  if (format === "svg") {
    const svg = await renderToSVG(canvasJson);
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Content-Disposition": `attachment; filename="${filename}.svg"`,
      },
    });
  }

  const png = await renderToPNG(canvasJson);
  return new NextResponse(png, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${filename}.png"`,
    },
  });
}
