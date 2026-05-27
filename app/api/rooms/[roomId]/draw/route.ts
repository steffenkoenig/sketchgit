/**
 * POST /api/rooms/[roomId]/draw
 *
 * Accepts a canvas draw or draw-delta event from a client and broadcasts it
 * to all other room members via WebSocket.
 *
 * Body (discriminated by `type`):
 *   - `{ type: "draw", clientId, canvas }` – full canvas state
 *   - `{ type: "draw-delta", clientId, added, modified, removed }` – incremental patch
 *
 * The originating client is excluded from the broadcast to prevent echo.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { broadcastToRoom } from "@/lib/server/wsRoomBroadcaster";
import { WsDrawSchema, WsDrawDeltaSchema } from "@/lib/api/wsSchemas";
import { ClientIdSchema } from "@/lib/api/roomEventHelpers";
import { checkRoomAccess } from "@/lib/db/roomRepository";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";

const MAX_CANVAS_BYTES = 512 * 1024;

export const DrawRequestSchema = z.discriminatedUnion("type", [
  WsDrawSchema.extend({ clientId: z.string().min(1).max(64) }),
  WsDrawDeltaSchema.extend({ clientId: z.string().min(1).max(64) }),
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;

  const body: unknown = await req.json().catch(() => null);
  if (body === null) {
    return apiError(ApiErrorCode.INVALID_JSON, "Invalid JSON", 400);
  }

  const v = validate(DrawRequestSchema, body);
  if (!v.success) return v.response;

  const { clientId, ...event } = v.data;

  // Verify room access (anonymous allowed in public rooms)
  const session = await auth();
  const authSession = getAuthSession(session);
  const access = await checkRoomAccess(roomId, authSession?.user.id ?? null);
  if (!access.allowed) {
    return apiError(ApiErrorCode.FORBIDDEN, "Access denied", 403);
  }
  if (access.role === "VIEWER") {
    return apiError(ApiErrorCode.FORBIDDEN, "Read-only access", 403);
  }

  // Broadcast the draw event to other room members, excluding the sender.
  broadcastToRoom(roomId, { ...event, type: event.type as "draw" | "draw-delta", senderId: clientId }, clientId);

  return new NextResponse(null, { status: 204 });
}
