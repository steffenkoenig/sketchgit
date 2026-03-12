/**
 * POST /api/rooms/[roomId]/invitations
 *
 * P066 – Create a time-limited, signed invitation URL for a room.
 *
 * Body:  { expiresInHours?: number; maxUses?: number }
 * Auth:  Room owner or OWNER membership only.
 * Returns: { url: string; token: string; expiresAt: string }
 *
 * The generated URL format is:
 *   /api/invitations/<token>?roomId=<roomId>&exp=<expiresAt>&sig=<hmac>
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { resolveRoomId, checkRoomAccess, createRoomInvitation, revokeRoomInvitations } from "@/lib/db/roomRepository";
import { generateInvitationToken, signInvitationToken } from "@/lib/server/invitationTokens";

export const CreateInvitationSchema = z.object({
  expiresInHours: z.coerce.number().int().min(1).max(168).default(24), // max 1 week
  maxUses: z.coerce.number().int().min(1).max(1000).default(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId: roomIdOrSlug } = await params;

  const session = await auth();
  const authSession = getAuthSession(session);
  if (!authSession) {
    return apiError(ApiErrorCode.UNAUTHENTICATED, "Unauthenticated", 401);
  }

  const body: unknown = await req.json().catch(() => null);
  if (body === null) {
    return apiError(ApiErrorCode.INVALID_JSON, "Invalid JSON", 400);
  }
  const v = validate(CreateInvitationSchema, body);
  if (!v.success) return v.response;
  const { expiresInHours, maxUses } = v.data;

  // Resolve slug → canonical room ID
  const roomId = await resolveRoomId(roomIdOrSlug);
  if (!roomId) {
    return apiError(ApiErrorCode.ROOM_NOT_FOUND, "Room not found", 404);
  }

  // Only room OWNER can create invitations
  const access = await checkRoomAccess(roomId, authSession.user.id);
  if (!access.allowed) {
    return apiError(ApiErrorCode.FORBIDDEN, "Access denied", 403);
  }
  if (access.role !== "OWNER") {
    return apiError(ApiErrorCode.FORBIDDEN, "Only the room owner can create invitations", 403);
  }

  const token = generateInvitationToken();
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  await createRoomInvitation({
    token,
    roomId,
    createdBy: authSession.user.id,
    expiresAt,
    maxUses,
  });

  // Build signed URL: /api/invitations/<token>?roomId=<>&exp=<>&sig=<>
  const expMs = expiresAt.getTime();
  const sig = signInvitationToken(token, roomId, expMs);
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const url = `${baseUrl}/api/invitations/${token}?roomId=${encodeURIComponent(roomId)}&exp=${expMs}&sig=${sig}`;

  return NextResponse.json(
    { url, token, expiresAt: expiresAt.toISOString() },
    { status: 201 },
  );
}

/**
 * DELETE /api/rooms/[roomId]/invitations
 * Revoke all outstanding invitations for the room (owner only).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId: roomIdOrSlug } = await params;

  const session = await auth();
  const authSession = getAuthSession(session);
  if (!authSession) {
    return apiError(ApiErrorCode.UNAUTHENTICATED, "Unauthenticated", 401);
  }

  const roomId = await resolveRoomId(roomIdOrSlug);
  if (!roomId) {
    return apiError(ApiErrorCode.ROOM_NOT_FOUND, "Room not found", 404);
  }

  const access = await checkRoomAccess(roomId, authSession.user.id);
  if (!access.allowed || access.role !== "OWNER") {
    return apiError(ApiErrorCode.FORBIDDEN, "Only the room owner can revoke invitations", 403);
  }

  const count = await revokeRoomInvitations(roomId);
  return NextResponse.json({ revoked: count });
}
