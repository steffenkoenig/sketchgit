/**
 * POST /api/rooms/[roomId]/profile
 *
 * Updates a client's display name, colour, and/or branch position, then
 * broadcasts a presence refresh and profile relay to all room members.
 *
 * Body: `{ clientId, name?, color?, branch?, headSha? }`
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import {
  broadcastToRoom,
  updateWsClientState,
  schedulePresenceBroadcast,
} from "@/lib/server/wsRoomBroadcaster";
import { WsProfileSchema } from "@/lib/api/wsSchemas";
import { checkRoomAccess } from "@/lib/db/roomRepository";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";

export const ProfileRequestSchema = WsProfileSchema.extend({
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

  const v = validate(ProfileRequestSchema, body);
  if (!v.success) return v.response;

  const { clientId, name, color, branch, headSha } = v.data;

  // Access control
  const session = await auth();
  const authSession = getAuthSession(session);
  const access = await checkRoomAccess(roomId, authSession?.user.id ?? null);
  if (!access.allowed) {
    return apiError(ApiErrorCode.FORBIDDEN, "Access denied", 403);
  }

  // P079 – update the WS client's in-memory display state
  updateWsClientState(roomId, clientId, {
    ...(name !== undefined && { displayName: name }),
    ...(color !== undefined && { displayColor: color }),
    ...(branch !== undefined && { currentBranch: branch }),
    ...(headSha !== undefined && { currentHeadSha: headSha }),
  });

  schedulePresenceBroadcast(roomId);

  // Relay profile to peers so remote cursors get the new name/colour
  broadcastToRoom(
    roomId,
    {
      type: "profile",
      name,
      color,
      branch,
      headSha,
      senderId: clientId,
      roomId,
    },
    clientId,
  );

  return new NextResponse(null, { status: 204 });
}
