/**
 * Share-links API – collection endpoints.
 *
 * P091 – Granular share links for rooms, branches, and commits.
 *
 * POST   /api/rooms/[roomId]/share-links  — Create a new share link (OWNER only)
 * GET    /api/rooms/[roomId]/share-links  — List all share links (OWNER only)
 * DELETE /api/rooms/[roomId]/share-links  — Revoke all share links (OWNER only)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import {
  resolveRoomId,
  checkRoomAccess,
  createShareLink,
  listShareLinks,
  revokeAllShareLinks,
  getCommitShaInRoom,
} from "@/lib/db/roomRepository";
import {
  generateShareLinkToken,
  signShareLinkToken,
} from "@/lib/server/shareLinkTokens";

// Max 50 branches per link — prevents oversized payloads; a link granting
// access to all 50+ branches of a large repo should use ROOM scope instead.
const MAX_BRANCHES_PER_LINK = 50;

// 255-char branch-name limit matches Git's own refname length restriction.
const MAX_BRANCH_NAME_LEN = 255;

// 100 000 is high enough for broadcast links (e.g. class of 500 × 200 sessions)
// without being unbounded. Unlimited links omit this field entirely.
const MAX_USES_LIMIT = 100_000;

export const CreateShareLinkSchema = z.object({
  label: z.string().max(120).optional(),
  scope: z.enum(["ROOM", "BRANCH", "COMMIT"]).default("ROOM"),
  branches: z
    .array(z.string().min(1).max(MAX_BRANCH_NAME_LEN))
    .max(MAX_BRANCHES_PER_LINK)
    .default([]),
  commitSha: z.string().length(64).optional(),
  permission: z
    .enum(["ADMIN", "BRANCH_CREATE", "WRITE", "VIEW"])
    .default("VIEW"),
  expiresInHours: z.coerce.number().int().min(1).max(8760).optional(), // max 1 year; omit = never
  maxUses: z.coerce.number().int().min(1).max(MAX_USES_LIMIT).optional(), // omit = unlimited
});

/**
 * POST /api/rooms/[roomId]/share-links
 *
 * Creates a signed share link for a room, specific branches, or a single commit.
 * Only the room OWNER (or a member with ADMIN share permission) may create links.
 *
 * Returns: { id, url, token, expiresAt }
 */
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
  const v = validate(CreateShareLinkSchema, body);
  if (!v.success) return v.response;
  const { label, scope, branches, commitSha, permission, expiresInHours, maxUses } = v.data;

  // Resolve slug → canonical room ID
  const roomId = await resolveRoomId(roomIdOrSlug);
  if (!roomId) {
    return apiError(ApiErrorCode.ROOM_NOT_FOUND, "Room not found", 404);
  }

  // Only room OWNER can create share links
  const access = await checkRoomAccess(roomId, authSession.user.id);
  if (!access.allowed || access.role !== "OWNER") {
    return apiError(ApiErrorCode.FORBIDDEN, "Only the room owner can create share links", 403);
  }

  // Scope-specific validation
  if (scope === "BRANCH" && branches.length === 0) {
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      "At least one branch name is required for BRANCH-scoped links",
      422,
    );
  }

  if (scope === "COMMIT") {
    if (!commitSha) {
      return apiError(
        ApiErrorCode.VALIDATION_ERROR,
        "commitSha is required for COMMIT-scoped links",
        422,
      );
    }
    // Verify the commit belongs to this room
    const foundSha = await getCommitShaInRoom(commitSha, roomId);
    if (!foundSha) {
      return apiError(ApiErrorCode.NOT_FOUND, "Commit not found in this room", 404);
    }
  }

  // COMMIT-scoped links are always read-only regardless of requested permission
  const effectivePermission = scope === "COMMIT" ? "VIEW" : permission;

  const token = generateShareLinkToken();
  const expiresAt =
    expiresInHours != null
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      : null;

  const { id } = await createShareLink({
    token,
    roomId,
    createdBy: authSession.user.id,
    label,
    scope: scope as "ROOM" | "BRANCH" | "COMMIT",
    branches: scope === "BRANCH" ? branches : [],
    commitSha: scope === "COMMIT" ? commitSha : undefined,
    permission: effectivePermission as "ADMIN" | "BRANCH_CREATE" | "WRITE" | "VIEW",
    expiresAt,
    maxUses: maxUses ?? null,
  });

  // Build signed URL: /api/share/<token>?roomId=<>&scope=<>&exp=<>&sig=<>
  const expMs = expiresAt?.getTime() ?? null;
  const sig = signShareLinkToken(token, roomId, scope, expMs);
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const url =
    `${baseUrl}/api/share/${token}` +
    `?roomId=${encodeURIComponent(roomId)}` +
    `&scope=${scope}` +
    (expMs != null ? `&exp=${expMs}` : "") +
    `&sig=${sig}`;

  return NextResponse.json(
    { id, url, token, expiresAt: expiresAt?.toISOString() ?? null },
    { status: 201 },
  );
}

/**
 * GET /api/rooms/[roomId]/share-links
 *
 * Returns all share links for the room. Token values are NOT included.
 * Only the room OWNER may list links.
 */
export async function GET(
  _req: NextRequest,
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
    return apiError(ApiErrorCode.FORBIDDEN, "Only the room owner can list share links", 403);
  }

  const links = await listShareLinks(roomId);
  return NextResponse.json({ links });
}

/**
 * DELETE /api/rooms/[roomId]/share-links
 *
 * Revoke all share links for the room (owner only).
 * Returns: { revoked: number }
 */
export async function DELETE(
  _req: NextRequest,
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
    return apiError(ApiErrorCode.FORBIDDEN, "Only the room owner can revoke share links", 403);
  }

  const count = await revokeAllShareLinks(roomId);
  return NextResponse.json({ revoked: count });
}
