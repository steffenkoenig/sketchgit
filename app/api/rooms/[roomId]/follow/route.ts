/**
 * POST /api/rooms/[roomId]/follow
 *
 * Handles presenter-mode events (P080): follow-request, follow-accept, and
 * follow-stop.  All three are relayed to room members via WebSocket.
 *
 * Body: `{ clientId, senderName?, senderColor?, action: "request" | "accept" | "stop" }`
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { broadcastToRoom } from "@/lib/server/wsRoomBroadcaster";
import { checkRoomAccess } from "@/lib/db/roomRepository";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import type { WsMessageType } from "@/lib/sketchgit/types";

export const FollowRequestSchema = z.object({
  clientId: z.string().min(1).max(64),
  senderName: z.string().max(100).optional(),
  senderColor: z.string().max(20).optional(),
  action: z.enum(["request", "accept", "stop"]),
});

const ACTION_TO_TYPE: Record<"request" | "accept" | "stop", WsMessageType> = {
  request: "follow-request",
  accept: "follow-accept",
  stop: "follow-stop",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;

  const body: unknown = await req.json().catch(() => null);
  if (body === null) {
    return apiError(ApiErrorCode.INVALID_JSON, "Invalid JSON", 400);
  }

  const v = validate(FollowRequestSchema, body);
  if (!v.success) return v.response;

  const { clientId, senderName, senderColor, action } = v.data;

  // Access control
  const session = await auth();
  const authSession = getAuthSession(session);
  const access = await checkRoomAccess(roomId, authSession?.user.id ?? null);
  if (!access.allowed) {
    return apiError(ApiErrorCode.FORBIDDEN, "Access denied", 403);
  }

  const type = ACTION_TO_TYPE[action];

  broadcastToRoom(
    roomId,
    {
      type,
      senderId: clientId,
      senderName: senderName ?? "User",
      senderColor: senderColor ?? "#7c6eff",
      roomId,
    },
    clientId,
  );

  return new NextResponse(null, { status: 204 });
}
