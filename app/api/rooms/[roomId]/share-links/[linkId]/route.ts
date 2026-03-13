/**
 * DELETE /api/rooms/[roomId]/share-links/[linkId]
 *
 * P091 – Revoke a single share link by its ID.
 *
 * Auth: room OWNER or the creator of the link.
 * Returns: { revoked: true }
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { resolveRoomId, checkRoomAccess, revokeShareLink } from "@/lib/db/roomRepository";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string; linkId: string }> },
) {
  const { roomId: roomIdOrSlug, linkId } = await params;

  const session = await auth();
  const authSession = getAuthSession(session);
  if (!authSession) {
    return apiError(ApiErrorCode.UNAUTHENTICATED, "Unauthenticated", 401);
  }

  const roomId = await resolveRoomId(roomIdOrSlug);
  if (!roomId) {
    return apiError(ApiErrorCode.ROOM_NOT_FOUND, "Room not found", 404);
  }

  const access = await checkRoomAccess(roomId, authSession.user.id);
  if (!access.allowed || access.role !== "OWNER") {
    return apiError(ApiErrorCode.FORBIDDEN, "Only the room owner can revoke share links", 403);
  }

  const deleted = await revokeShareLink(linkId, roomId);
  if (!deleted) {
    return apiError(ApiErrorCode.NOT_FOUND, "Share link not found", 404);
  }

  return NextResponse.json({ revoked: true });
}
