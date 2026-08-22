/**
 * GET /api/rooms/[roomId]/members
 *
 * P091 – List the explicit memberships (and their roles) for a room.
 * Owner-only: membership lists are not exposed to non-owners.
 */
import { NextRequest, NextResponse } from "next/server";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { resolveRoomId, checkRoomAccess, listRoomMembers } from "@/lib/db/roomRepository";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId: roomIdOrSlug } = await params;

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
    return apiError(ApiErrorCode.FORBIDDEN, "Access denied", 403);
  }

  const members = await listRoomMembers(roomId);
  return NextResponse.json({ members });
}
