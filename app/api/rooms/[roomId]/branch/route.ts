/**
 * POST /api/rooms/[roomId]/branch
 *
 * Records a branch checkout or rollback and broadcasts it to room members
 * via WebSocket.
 *
 * Body: `{ clientId, senderName?, senderColor?, branch, headSha, isRollback?, detached? }`
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { broadcastToRoom, updateWsClientState, schedulePresenceBroadcast } from "@/lib/server/wsRoomBroadcaster";
import { WsBranchUpdateSchema } from "@/lib/api/wsSchemas";
import { checkRoomAccess, appendRoomEvent } from "@/lib/db/roomRepository";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";

export const BranchRequestSchema = WsBranchUpdateSchema.extend({
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

  const v = validate(BranchRequestSchema, body);
  if (!v.success) return v.response;

  const { clientId, senderName, senderColor, branch, headSha, isRollback, detached } = v.data;

  // Access control
  const session = await auth();
  const authSession = getAuthSession(session);
  const access = await checkRoomAccess(roomId, authSession?.user.id ?? null);
  if (!access.allowed) {
    return apiError(ApiErrorCode.FORBIDDEN, "Access denied", 403);
  }
  if (access.role === "VIEWER") {
    return apiError(ApiErrorCode.FORBIDDEN, "Read-only access", 403);
  }

  // P079 – update the WS client's branch position for presence accuracy
  if (branch) {
    updateWsClientState(roomId, clientId, {
      currentBranch: branch,
      currentHeadSha: headSha,
    });
    schedulePresenceBroadcast(roomId);
  }

  // P074 – append branch event to activity log (non-blocking)
  const evType = isRollback ? "ROLLBACK" : "BRANCH_CHECKOUT";
  void appendRoomEvent(roomId, evType, authSession?.user.id ?? null, {
    branch,
    headSha,
  }).catch(() => {});

  // Broadcast to room members
  broadcastToRoom(
    roomId,
    {
      type: "branch-update",
      branch,
      headSha,
      isRollback: isRollback ?? false,
      detached: detached ?? false,
      senderId: clientId,
      senderName: senderName ?? "User",
      senderColor: senderColor ?? "#7c6eff",
      roomId,
    },
    clientId,
  );

  return new NextResponse(null, { status: 204 });
}
