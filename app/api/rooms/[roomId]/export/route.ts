/**
 * GET /api/rooms/[roomId]/export?format=png|svg&sha=<commitSha>
 *
 * P039 – Export a room's canvas as a PNG or SVG file.
 * P068 – Uses apiError() for structured error responses.
 * P070 – Adds Cache-Control + ETag headers for SHA-addressed exports.
 *
 * When `sha` is omitted the room's current HEAD commit is used.
 * For public rooms no authentication is required.
 * Delta commits (P033) are reconstructed by replaying the delta chain.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { immutableHeaders, mutableHeaders } from "@/lib/api/cacheHeaders";
import { CommitStorageType, type Prisma } from "@prisma/client";
import { replayCanvasDelta, type CanvasDelta } from "@/lib/sketchgit/git/canvasDelta";
import { renderToSVG, renderToPNG, renderToPDF } from "@/lib/export/canvasRenderer";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { resolveRoomId } from "@/lib/db/roomRepository";

export const ExportQuerySchema = z.object({
  format: z.enum(["png", "svg", "pdf"]).default("png"),
  sha: z.string().max(64).optional(),
  theme: z.enum(["dark", "light"]).default("dark"),
});

const MAX_CHAIN_DEPTH = 10_000;

/**
 * Walk the parentSha chain backwards from `commitSha`, replaying DELTA commits
 * against their parents, until we reach a SNAPSHOT or root commit.
 * This avoids loading all room commits at once.
 */
async function resolveCanvasJson(
  commitSha: string,
  roomId: string,
): Promise<object | null> {
  const visited = new Set<string>();
  const chain: {
    sha: string;
    parentSha: string | null;
    canvasJson: Prisma.JsonValue;
    storageType: CommitStorageType;
  }[] = [];

  let currentSha: string | null = commitSha;
  let depth = 0;

  while (currentSha && depth < MAX_CHAIN_DEPTH) {
    if (visited.has(currentSha)) break; // cycle guard

    const row: {
      sha: string;
      parentSha: string | null;
      canvasJson: Prisma.JsonValue;
      storageType: CommitStorageType;
    } | null = await prisma.commit.findFirst({
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
  const { roomId: roomIdOrSlug } = await params;
  const rawQuery = Object.fromEntries(req.nextUrl.searchParams.entries());
  const v = validate(ExportQuerySchema, rawQuery);
  if (!v.success) return v.response;

  const { format, sha: reqSha, theme } = v.data;

  // Resolve slug or canonical room ID → canonical ID.
  const roomId = await resolveRoomId(roomIdOrSlug);
  if (!roomId) {
    return apiError(ApiErrorCode.ROOM_NOT_FOUND, "Room not found", 404);
  }

  // Access control: private rooms require authenticated membership.
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { isPublic: true },
  });
  if (!room) {
    return apiError(ApiErrorCode.ROOM_NOT_FOUND, "Room not found", 404);
  }
  if (!room.isPublic) {
    const session = await auth();
    const authSession = getAuthSession(session);
    if (!authSession) {
      return apiError(ApiErrorCode.UNAUTHENTICATED, "Authentication required", 401);
    }
    const membership = await prisma.roomMembership.findUnique({
      where: { roomId_userId: { roomId, userId: authSession.user.id } },
      select: { role: true },
    });
    if (!membership) {
      return apiError(ApiErrorCode.FORBIDDEN, "Forbidden", 403);
    }
  }

  // Resolve target commit SHA
  let targetSha: string;
  if (reqSha) {
    const exists = await prisma.commit.findUnique({
      where: { sha: reqSha },
      select: { sha: true, roomId: true },
    });
    if (!exists || exists.roomId !== roomId) {
      return apiError(ApiErrorCode.NOT_FOUND, "Commit not found", 404);
    }
    targetSha = reqSha;

    // P070 – return 304 Not Modified only after confirming the SHA exists and
    // belongs to this room.  The 304 must include the same cache headers so
    // the browser stores them alongside the cached body.
    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch === `"${reqSha}"`) {
      return new NextResponse(null, { status: 304, headers: immutableHeaders(reqSha) });
    }
  } else {
    const state = await prisma.roomState.findUnique({
      where: { roomId },
      select: { headSha: true },
    });
    if (!state?.headSha) {
      return apiError(ApiErrorCode.CANVAS_NOT_FOUND, "Room not found or has no commits", 404);
    }
    targetSha = state.headSha;
  }

  const canvasJson = await resolveCanvasJson(targetSha, roomId);
  if (!canvasJson) {
    return apiError(ApiErrorCode.CANVAS_NOT_FOUND, "Failed to resolve canvas state", 404);
  }

  const filename = `canvas-${roomId}`;
  // P070 – SHA-addressed exports are immutable; use long-lived cache headers.
  // HEAD exports (no sha) must not be cached as the canvas can change at any time.
  const cacheHdrs = reqSha ? immutableHeaders(reqSha) : mutableHeaders();

  if (format === "svg") {
    const svg = await renderToSVG(canvasJson, theme);
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Content-Disposition": `attachment; filename="${filename}.svg"`,
        ...cacheHdrs,
      },
    });
  }

  if (format === "pdf") {
    const pdf = await renderToPDF(canvasJson, theme);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
        ...cacheHdrs,
      },
    });
  }

  const png = await renderToPNG(canvasJson, theme);
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${filename}.png"`,
      ...cacheHdrs,
    },
  });
}
