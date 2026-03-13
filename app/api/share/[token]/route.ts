/**
 * GET /api/share/[token]?roomId=<>&scope=<>&exp=<ms>&sig=<hmac>
 *
 * P091 – Validate a granular share-link token and redirect the recipient.
 *
 * Flow:
 *  1. Verify the HMAC signature to reject tampered URLs cheaply (no DB hit).
 *  2. Look up the token; check expiry and use count.
 *  3. For ROOM scope with WRITE+ permission + authenticated user: upsert membership.
 *  4. Set a short-lived signed `sketchgit_share_scope` cookie so the WebSocket
 *     upgrade handler can apply branch/commit restrictions without a DB lookup.
 *  5. Increment `useCount` and redirect.
 *
 * Redirect targets:
 *   COMMIT scope → /?room=<roomId>&commit=<sha>&readonly=1
 *   BRANCH scope → /?room=<roomId>&branch=<firstBranch>
 *   ROOM scope   → /?room=<roomId>
 *
 * Returns 410 Gone for expired or exhausted tokens.
 * Returns 400 for invalid/tampered URLs.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import {
  getShareLinkByToken,
  consumeShareLink,
  addRoomMember,
} from "@/lib/db/roomRepository";
import {
  verifyShareLinkSignature,
  signScopeCookie,
  mapPermissionToRole,
  SCOPE_COOKIE_NAME,
  SCOPE_COOKIE_TTL_MS,
} from "@/lib/server/shareLinkTokens";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const url = new URL(req.url);
  const roomId = url.searchParams.get("roomId") ?? "";
  const scope = url.searchParams.get("scope") ?? "";
  const expStr = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig") ?? "";

  if (!roomId || !scope || !sig) {
    return apiError(ApiErrorCode.SHARE_LINK_INVALID, "Invalid share link URL", 400);
  }

  // 1. Verify HMAC signature before any DB lookup
  const expMs = expStr != null ? parseInt(expStr, 10) : null;
  if (expStr != null && (expMs === null || isNaN(expMs))) {
    return apiError(ApiErrorCode.SHARE_LINK_INVALID, "Invalid share link URL", 400);
  }
  if (!verifyShareLinkSignature(token, roomId, scope, expMs, sig)) {
    return apiError(ApiErrorCode.SHARE_LINK_INVALID, "Invalid share link signature", 400);
  }

  // 2. Look up the token in the database
  const link = await getShareLinkByToken(token);
  if (!link || link.roomId !== roomId) {
    return apiError(ApiErrorCode.SHARE_LINK_INVALID, "Share link not found", 404);
  }
  if (link.expiresAt !== null && link.expiresAt < new Date()) {
    return apiError(ApiErrorCode.SHARE_LINK_EXPIRED, "Share link has expired", 410);
  }
  if (link.maxUses !== null && link.useCount >= link.maxUses) {
    return apiError(ApiErrorCode.SHARE_LINK_EXHAUSTED, "Share link has reached its use limit", 410);
  }

  // 3. For ROOM scope with WRITE+ permission: add the authenticated user as a room member
  const session = await auth();
  const authSession = getAuthSession(session);

  const requiresAuth =
    link.scope === "ROOM" &&
    (link.permission === "ADMIN" ||
      link.permission === "BRANCH_CREATE" ||
      link.permission === "WRITE");

  if (requiresAuth && !authSession) {
    // Redirect to sign-in with callbackUrl pointing back here
    const callbackUrl = encodeURIComponent(req.url);
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    return NextResponse.redirect(`${baseUrl}/auth/signin?callbackUrl=${callbackUrl}`);
  }

  if (!link.room.isPublic && !authSession) {
    const callbackUrl = encodeURIComponent(req.url);
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    return NextResponse.redirect(`${baseUrl}/auth/signin?callbackUrl=${callbackUrl}`);
  }

  if (
    authSession &&
    link.scope === "ROOM" &&
    link.permission !== "VIEW"
  ) {
    const role = mapPermissionToRole(link.permission);
    await addRoomMember(roomId, authSession.user.id, role);
  }

  // 4. Consume the link use
  const consumed = await consumeShareLink(token, link.maxUses);
  if (!consumed) {
    // Race condition: another concurrent request already consumed the last use.
    return apiError(ApiErrorCode.SHARE_LINK_EXHAUSTED, "Share link has reached its use limit", 410);
  }

  // 5. Set scope cookie so the WebSocket upgrade handler can enforce restrictions
  const cookieExp = Date.now() + SCOPE_COOKIE_TTL_MS;
  const cookieValue = signScopeCookie({
    linkId: link.id,
    roomId: link.roomId,
    scope: link.scope,
    branches: link.branches,
    commitSha: link.commitSha,
    permission: link.permission,
    exp: cookieExp,
  });

  // 6. Build redirect URL based on scope
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  let redirectTarget: string;
  if (link.scope === "COMMIT" && link.commitSha) {
    redirectTarget = `${baseUrl}/?room=${encodeURIComponent(roomId)}&commit=${encodeURIComponent(link.commitSha)}&readonly=1`;
  } else if (link.scope === "BRANCH" && link.branches.length > 0) {
    redirectTarget = `${baseUrl}/?room=${encodeURIComponent(roomId)}&branch=${encodeURIComponent(link.branches[0]!)}`;
  } else {
    redirectTarget = `${baseUrl}/?room=${encodeURIComponent(roomId)}`;
  }

  const response = NextResponse.redirect(redirectTarget);
  response.cookies.set(SCOPE_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SCOPE_COOKIE_TTL_MS / 1000),
  });
  return response;
}
