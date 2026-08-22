/**
 * POST /api/rooms/[roomId]/cursor
 *
 * Relays a cursor position update to all other room members via WebSocket.
 *
 * Body: `{ clientId, senderName?, senderColor?, x, y }`
 *
 * Note: cursor events are high-frequency (up to 10 Hz).  The client is
 * responsible for throttling before calling this endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { broadcastToRoom } from "@/lib/server/wsRoomBroadcaster";
import { WsCursorSchema } from "@/lib/api/wsSchemas";
import { checkRoomAccess } from "@/lib/db/roomRepository";
import { hasValidRoomUnlock, ROOM_UNLOCK_COOKIE_NAME } from "@/lib/server/roomPasswordCookie";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";

export const CursorRequestSchema = WsCursorSchema.extend({
  clientId: z.string().min(1).max(64),
  senderName: z.string().max(100).optional(),
  senderColor: z.string().max(20).optional(),
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

  const v = validate(CursorRequestSchema, body);
  if (!v.success) return v.response;

  const { clientId, senderName, senderColor, x, y } = v.data;

  // Access control – cursors are visible to any connected user including VIEWER
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
      type: "cursor",
      x,
      y,
      senderId: clientId,
      senderName: senderName ?? "User",
      senderColor: senderColor ?? "#7c6eff",
      roomId,
    },
    clientId,
  );

  return new NextResponse(null, { status: 204 });
}
