/**
 * POST /api/rooms/[roomId]/view-sync
 *
 * Broadcasts the presenter's viewport transform to followers (P080).
 * Called at up to 8 Hz while presenter mode is active; the client is
 * responsible for throttling.
 *
 * Body: `{ clientId, vpt, branch?, headSha? }`
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { broadcastToRoom } from "@/lib/server/wsRoomBroadcaster";
import { WsViewSyncSchema } from "@/lib/api/wsSchemas";
import { checkRoomAccess } from "@/lib/db/roomRepository";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";

export const ViewSyncRequestSchema = WsViewSyncSchema.extend({
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

  const v = validate(ViewSyncRequestSchema, body);
  if (!v.success) return v.response;

  const { clientId, vpt, branch, headSha } = v.data;

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
      type: "view-sync",
      vpt,
      branch,
      headSha: headSha ?? null,
      senderId: clientId,
      roomId,
    },
    clientId,
  );

  return new NextResponse(null, { status: 204 });
}
