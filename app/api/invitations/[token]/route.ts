/**
 * GET /api/invitations/[token]?roomId=<>&exp=<ms>&sig=<hmac>
 *
 * P066 – Validate a room invitation token and redirect the user to the room.
 *
 * Flow:
 *  1. Verify the HMAC signature to reject tampered URLs cheaply.
 *  2. Look up the token in the database; check expiry and use count.
 *  3. If the room is private and the user is authenticated, add them as a
 *     room member (EDITOR role).
 *  4. Increment `useCount` and redirect to `/?room=<roomId>`.
 *
 * For unauthenticated users accessing a private room: redirect to
 * /auth/signin with `callbackUrl` pointing back to the invitation URL.
 *
 * Returns 410 Gone for expired or exhausted tokens.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { verifyInvitationSignature } from "@/lib/server/invitationTokens";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const url = new URL(req.url);
  const roomId = url.searchParams.get("roomId") ?? "";
  const expStr = url.searchParams.get("exp") ?? "";
  const sig = url.searchParams.get("sig") ?? "";

  // 1. Verify HMAC signature before any DB lookup
  const expMs = parseInt(expStr, 10);
  if (!roomId || !expStr || !sig || isNaN(expMs)) {
    return apiError(ApiErrorCode.INVITATION_INVALID, "Invalid invitation URL", 400);
  }
  if (!verifyInvitationSignature(token, roomId, expMs, sig)) {
    return apiError(ApiErrorCode.INVITATION_INVALID, "Invalid invitation signature", 400);
  }

  // 2. Look up the token in the database
  const invitation = await prisma.roomInvitation.findUnique({
    where: { token },
    include: { room: { select: { isPublic: true } } },
  });

  if (!invitation || invitation.roomId !== roomId) {
    return apiError(ApiErrorCode.INVITATION_INVALID, "Invitation not found", 404);
  }
  if (invitation.expiresAt < new Date()) {
    return apiError(ApiErrorCode.INVITATION_EXPIRED, "Invitation has expired", 410);
  }
  if (invitation.useCount >= invitation.maxUses) {
    return apiError(ApiErrorCode.INVITATION_EXHAUSTED, "Invitation has reached its use limit", 410);
  }

  // 3. If the room is private, require authentication and add membership
  const session = await auth();
  const authSession = getAuthSession(session);

  if (!invitation.room.isPublic) {
    if (!authSession) {
      // Redirect to sign-in with callbackUrl pointing back here
      const callbackUrl = encodeURIComponent(req.url);
      const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      return NextResponse.redirect(`${baseUrl}/auth/signin?callbackUrl=${callbackUrl}`);
    }

    // Add user as a room member (upsert: no-op if already a member)
    await prisma.roomMembership.upsert({
      where: { roomId_userId: { roomId, userId: authSession.user.id } },
      update: {},
      create: { roomId, userId: authSession.user.id, role: "EDITOR" },
    });
  }

  // 4. Increment useCount atomically
  await prisma.roomInvitation.update({
    where: { token },
    data: { useCount: { increment: 1 } },
  });

  // Redirect to the room
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return NextResponse.redirect(`${baseUrl}/?room=${encodeURIComponent(roomId)}`);
}
