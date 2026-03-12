/**
 * GET /api/rooms/[roomId]/events?take=100&cursor=<isoDate>
 *
 * P074 – Return the recent activity feed for a room (audit log).
 *
 * Auth: authenticated users who are room members (or any authenticated user
 * for public rooms). Unauthenticated requests receive 401.
 *
 * Pagination: cursor-based via `cursor` (ISO timestamp of the oldest event
 * returned so far). Pass `cursor` from the previous response's
 * `nextCursor` to fetch older events.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { checkRoomAccess, getRoomEvents, resolveRoomId } from "@/lib/db/roomRepository";

export const EventsQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().datetime().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId: roomIdOrSlug } = await params;

  // Require authentication
  const session = await auth();
  const authSession = getAuthSession(session);
  if (!authSession) {
    return apiError(ApiErrorCode.UNAUTHENTICATED, "Unauthenticated", 401);
  }

  // Parse query params
  const url = new URL(req.url);
  const rawQuery = Object.fromEntries(url.searchParams);
  const v = validate(EventsQuerySchema, rawQuery);
  if (!v.success) return v.response;
  const { take, cursor } = v.data;

  // Resolve slug → canonical room ID
  const roomId = await resolveRoomId(roomIdOrSlug);
  if (!roomId) {
    return apiError(ApiErrorCode.ROOM_NOT_FOUND, "Room not found", 404);
  }

  // Check room access
  const access = await checkRoomAccess(roomId, authSession.user.id);
  if (!access.allowed) {
    if (access.reason === "ROOM_NOT_FOUND") {
      return apiError(ApiErrorCode.ROOM_NOT_FOUND, "Room not found", 404);
    }
    return apiError(ApiErrorCode.FORBIDDEN, "Access denied", 403);
  }

  const events = await getRoomEvents(roomId, take, cursor);

  // Derive nextCursor from the oldest returned event
  const nextCursor =
    events.length === take
      ? events[events.length - 1]!.createdAt.toISOString()
      : null;

  return NextResponse.json({ events, nextCursor });
}
