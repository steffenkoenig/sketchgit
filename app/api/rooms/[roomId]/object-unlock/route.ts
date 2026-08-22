/**
 * POST /api/rooms/[roomId]/object-unlock
 *
 * Broadcasts an object-unlock notification (P067) to all room members,
 * indicating that the requesting client has deselected canvas objects.
 *
 * Body: `{ clientId }`
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { broadcastToRoom } from "@/lib/server/wsRoomBroadcaster";
import { checkRoomAccess } from "@/lib/db/roomRepository";
import { hasValidRoomUnlock, ROOM_UNLOCK_COOKIE_NAME } from "@/lib/server/roomPasswordCookie";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";

export const ObjectUnlockRequestSchema = z.object({
  clientId: z.string().min(1).max(64),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;

  const body: unknown = await req.json().catch(() => null);
  if (body === null) {
    return apiError(ApiErrorCode.INVALID_JSON, "Invalid JSON", 400);
  }

  const v = validate(ObjectUnlockRequestSchema, body);
  if (!v.success) return v.response;

  const { clientId } = v.data;

  // Access control
  const session = await auth();
  const authSession = getAuthSession(session);
  const hasPasswordUnlock = hasValidRoomUnlock(req.cookies.get(ROOM_UNLOCK_COOKIE_NAME)?.value, roomId);
  const access = await checkRoomAccess(roomId, authSession?.user.id ?? null, hasPasswordUnlock);
  if (!access.allowed) {
    if (access.reason === "PASSWORD_REQUIRED") {
      return apiError(ApiErrorCode.ROOM_PASSWORD_REQUIRED, "This room requires a password", 401);
    }
    return apiError(ApiErrorCode.FORBIDDEN, "Access denied", 403);
  }

  broadcastToRoom(
    roomId,
    {
      type: "object-unlock",
      senderId: clientId,
      roomId,
    },
    clientId,
  );

  return new NextResponse(null, { status: 204 });
}
