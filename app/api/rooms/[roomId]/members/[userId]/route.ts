/**
 * PATCH /api/rooms/[roomId]/members/[userId]
 *
 * P091 – Update an existing member's role. Owner-only. Refuses to demote the
 * last remaining OWNER (would permanently lock the room's access management).
 * Updates the target user's in-memory WS role (so server-side enforcement
 * — P034 — picks it up on their very next message) and sends them a
 * `role-update` WS message so their client can restrict its own UI
 * immediately (e.g. disable drawing tools for VIEWER) rather than only
 * discovering it's enforced the next time they try to draw.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { resolveRoomId, checkRoomAccess, setRoomMemberRole } from "@/lib/db/roomRepository";
import { updateClientRole } from "@/lib/server/wsRoomBroadcaster";

export const UpdateMemberRoleSchema = z.object({
  role: z.enum(["OWNER", "EDITOR", "COMMITTER", "VIEWER"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; userId: string }> },
) {
  const { roomId: roomIdOrSlug, userId: targetUserId } = await params;

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

  const body: unknown = await req.json().catch(() => null);
  if (body === null) {
    return apiError(ApiErrorCode.INVALID_JSON, "Invalid JSON", 400);
  }
  const v = validate(UpdateMemberRoleSchema, body);
  if (!v.success) return v.response;

  const result = await setRoomMemberRole(roomId, targetUserId, v.data.role);
  if (!result.ok) {
    if (result.reason === "NOT_A_MEMBER") {
      return apiError(ApiErrorCode.NOT_FOUND, "User is not a member of this room", 404);
    }
    // LAST_OWNER
    return apiError(ApiErrorCode.VALIDATION_ERROR, "Cannot demote the room's last owner", 409);
  }

  updateClientRole(roomId, targetUserId, v.data.role);

  return NextResponse.json({ ok: true });
}
