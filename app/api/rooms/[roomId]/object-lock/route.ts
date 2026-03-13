/**
 * POST /api/rooms/[roomId]/object-lock
 *
 * Broadcasts a soft object-lock notification (P067) to all room members,
 * indicating that the requesting client has selected certain canvas objects.
 *
 * Body: `{ clientId, senderColor?, objectIds }`
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { broadcastToRoom } from "@/lib/server/wsRoomBroadcaster";
import { WsObjectLockSchema } from "@/lib/api/wsSchemas";
import { checkRoomAccess } from "@/lib/db/roomRepository";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";

export const ObjectLockRequestSchema = WsObjectLockSchema.extend({
  clientId: z.string().min(1).max(64),
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

  const v = validate(ObjectLockRequestSchema, body);
  if (!v.success) return v.response;

  const { clientId, senderColor, objectIds, color } = v.data;

  // Access control
  const session = await auth();
  const authSession = getAuthSession(session);
  const access = await checkRoomAccess(roomId, authSession?.user.id ?? null);
  if (!access.allowed) {
    return apiError(ApiErrorCode.FORBIDDEN, "Access denied", 403);
  }

  broadcastToRoom(
    roomId,
    {
      type: "object-lock",
      objectIds,
      senderColor: senderColor ?? color ?? "#fbbf24",
      senderId: clientId,
      roomId,
    },
    clientId,
  );

  return new NextResponse(null, { status: 204 });
}
