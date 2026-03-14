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
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { immutableHeaders, mutableHeaders } from "@/lib/api/cacheHeaders";
import { renderToSVG, renderToPNG, renderToPDF } from "@/lib/export/canvasRenderer";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import {
  resolveRoomId,
  getRoomPublicFlag,
  getRoomMembership,
  getCommitShaInRoom,
  getRoomHeadSha,
  resolveCommitCanvas,
} from "@/lib/db/roomRepository";
import { ExportQuerySchema } from "@/lib/api/exportSchema";

export { ExportQuerySchema };

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
  const room = await getRoomPublicFlag(roomId);
  if (!room) {
    return apiError(ApiErrorCode.ROOM_NOT_FOUND, "Room not found", 404);
  }
  if (!room.isPublic) {
    const session = await auth();
    const authSession = getAuthSession(session);
    if (!authSession) {
      return apiError(ApiErrorCode.UNAUTHENTICATED, "Authentication required", 401);
    }
    const membership = await getRoomMembership(roomId, authSession.user.id);
    if (!membership) {
      return apiError(ApiErrorCode.FORBIDDEN, "Forbidden", 403);
    }
  }

  // Resolve target commit SHA
  let targetSha: string;
  if (reqSha) {
    const sha = await getCommitShaInRoom(reqSha, roomId);
    if (!sha) {
      return apiError(ApiErrorCode.NOT_FOUND, "Commit not found", 404);
    }
    targetSha = sha;

    // P070 – return 304 Not Modified only after confirming the SHA exists and
    // belongs to this room.  The 304 must include the same cache headers so
    // the browser stores them alongside the cached body.
    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch === `"${reqSha}"`) {
      return new NextResponse(null, { status: 304, headers: immutableHeaders(reqSha) });
    }
  } else {
    const headSha = await getRoomHeadSha(roomId);
    if (!headSha) {
      return apiError(ApiErrorCode.CANVAS_NOT_FOUND, "Room not found or has no commits", 404);
    }
    targetSha = headSha;
  }

  const canvasJson = await resolveCommitCanvas(targetSha, roomId);
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
