/**
 * POST /api/rooms/[roomId]/unlock
 *
 * P093 – Verify a room password and, on success, grant the caller a signed
 * unlock cookie so they aren't re-prompted for this room (and any other
 * already-unlocked rooms — see roomPasswordCookie.ts) for
 * ROOM_UNLOCK_TTL_MS. Rate-limited via proxy.ts's isRateLimitedPath() to
 * mitigate brute-force guessing (P093's explicit security requirement).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { getRoomPasswordHash } from "@/lib/db/roomRepository";
import { verifyPasswordHash } from "@/lib/passwordHashing";
import {
  grantRoomUnlock,
  hasValidRoomUnlock,
  ROOM_UNLOCK_COOKIE_NAME,
  ROOM_UNLOCK_TTL_MS,
} from "@/lib/server/roomPasswordCookie";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";

const UnlockRequestSchema = z.object({
  password: z.string().min(1).max(200),
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
  const v = validate(UnlockRequestSchema, body);
  if (!v.success) return v.response;

  const room = await getRoomPasswordHash(roomId);
  if (!room) {
    return apiError(ApiErrorCode.ROOM_NOT_FOUND, "Room not found", 404);
  }
  if (!room.passwordHash) {
    // Not an error condition worth hiding behind a generic 403 — a client
    // showing the unlock prompt for a room that turns out to be unprotected
    // is a UX bug to surface, not a security-sensitive detail to mask.
    return apiError(ApiErrorCode.ROOM_NOT_PASSWORD_PROTECTED, "This room is not password-protected", 400);
  }

  const valid = await verifyPasswordHash(room.passwordHash, v.data.password);
  if (!valid) {
    return apiError(ApiErrorCode.ROOM_PASSWORD_INCORRECT, "Incorrect password", 401);
  }

  const existingCookie = req.cookies.get(ROOM_UNLOCK_COOKIE_NAME)?.value;
  const newCookieValue = grantRoomUnlock(existingCookie, roomId);

  const response = NextResponse.json({ unlocked: true });
  response.cookies.set(ROOM_UNLOCK_COOKIE_NAME, newCookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ROOM_UNLOCK_TTL_MS / 1000),
  });
  return response;
}

/**
 * GET /api/rooms/[roomId]/unlock
 *
 * Lightweight check the client UI uses to decide whether to show the
 * password prompt before the user has typed anything: whether the room has
 * a password AND whether the current request already carries a valid
 * unlock (or is the owner). Never reveals the hash itself.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const room = await getRoomPasswordHash(roomId);
  if (!room) {
    return apiError(ApiErrorCode.ROOM_NOT_FOUND, "Room not found", 404);
  }
  if (!room.passwordHash) {
    return NextResponse.json({ passwordRequired: false });
  }

  const session = await auth();
  const authSession = getAuthSession(session);
  const isOwner = authSession?.user.id != null && authSession.user.id === room.ownerId;
  const cookieValue = req.cookies.get(ROOM_UNLOCK_COOKIE_NAME)?.value;
  const unlocked = isOwner || hasValidRoomUnlock(cookieValue, roomId);

  return NextResponse.json({ passwordRequired: !unlocked });
}
