import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate } from "@/lib/api/validate";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { immutableHeaders, mutableHeaders } from "@/lib/api/cacheHeaders";
import {
  getRoomPublicFlag,
  getRoomMembership,
  getCommitPage,
  checkRoomAccess,
  saveCommitWithDelta,
  appendRoomEvent,
} from "@/lib/db/roomRepository";
import { broadcastToRoom } from "@/lib/server/wsRoomBroadcaster";
import { validateCommitMessage } from "@/lib/server/commitValidation";
import { WsCommitSchema } from "@/lib/api/wsSchemas";
import { createRoomSnapshotCache } from "@/lib/cache/roomSnapshotCache";

export const CommitsQuerySchema = z.object({
  cursor: z.string().max(64).optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
});

/** POST body schema – mirrors WsCommitSchema with clientId added. */
export const CommitRequestSchema = WsCommitSchema.extend({
  clientId: z.string().min(1).max(64),
  senderName: z.string().max(100).optional(),
  senderColor: z.string().max(20).optional(),
});

// Snapshot cache shared with server.ts (module singleton)
const roomCache = createRoomSnapshotCache();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const url = new URL(req.url);
  const rawQuery = Object.fromEntries(url.searchParams);

  const v = validate(CommitsQuerySchema, rawQuery);
  if (!v.success) return v.response;
  const { cursor, take } = v.data;

  const room = await getRoomPublicFlag(roomId);
  if (!room) {
    return apiError(ApiErrorCode.ROOM_NOT_FOUND, "Room not found", 404);
  }

  // Private rooms require authentication and at least VIEWER membership.
  if (!room.isPublic) {
    const session = await auth();
    const authSession = getAuthSession(session);
    if (!authSession) {
      return apiError(ApiErrorCode.UNAUTHENTICATED, "Authentication required", 401);
    }
    const membership = await getRoomMembership(roomId, authSession.user.id);
    if (!membership) {
      return apiError(ApiErrorCode.FORBIDDEN, "Forbidden", 403);
    }
  }

  const { commits: page, nextCursor } = await getCommitPage(roomId, take, cursor);

  // P070 – When a cursor (SHA) is provided, the page of commits at that cursor
  // is immutable — the same cursor always returns the same data.
  // The first page (no cursor) may gain new commits, so it must not be cached.
  const cacheHdrs = cursor ? immutableHeaders(cursor) : mutableHeaders();

  return NextResponse.json(
    {
      commits: page.map((c) => ({
        sha: c.sha,
        parent: c.parentSha,
        branch: c.branch,
        message: c.message,
        ts: c.createdAt.getTime(),
        isMerge: c.isMerge,
      })),
      nextCursor,
    },
    { headers: cacheHdrs },
  );
}

/**
 * POST /api/rooms/[roomId]/commits
 *
 * Persist a new commit to the database and broadcast it to all connected room
 * members via WebSocket.
 *
 * Body: `{ clientId, senderName?, senderColor?, sha, commit: { branch, message, canvas, ... } }`
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;

  const body: unknown = await req.json().catch(() => null);
  if (body === null) {
    return apiError(ApiErrorCode.INVALID_JSON, "Invalid JSON", 400);
  }

  const v = validate(CommitRequestSchema, body);
  if (!v.success) return v.response;

  const { clientId, senderName, senderColor, sha, commit } = v.data;

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

  // Validate the commit payload (P057)
  const isValid = validateCommitMessage(sha, commit, (msg) => console.error("[commits/route] validation:", msg));
  if (!isValid) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "Invalid commit payload", 422);
  }

  // Persist to DB with delta compression (P033)
  try {
    await saveCommitWithDelta(
      roomId,
      {
        sha,
        parent: commit.parent ?? null,
        parents: commit.parents ?? [],
        branch: commit.branch,
        message: commit.message,
        canvas: commit.canvas,
        ts: Date.now(),
        isMerge: commit.isMerge ?? false,
      },
      authSession?.user.id ?? null,
    );
  } catch (err) {
    console.error("[commits POST] saveCommitWithDelta failed", err);
    return apiError(ApiErrorCode.INTERNAL_ERROR, "Failed to save commit", 500);
  }

  // P074 – append COMMIT event to activity log (non-blocking)
  void appendRoomEvent(roomId, "COMMIT", authSession?.user.id ?? null, {
    sha,
    branch: commit.branch,
    message: commit.message,
  }).catch(() => {});

  // P030 – invalidate snapshot cache so next WS connection gets fresh state
  roomCache.invalidate(roomId);

  // Broadcast to other room members via WebSocket
  broadcastToRoom(
    roomId,
    {
      type: "commit",
      sha,
      commit,
      senderId: clientId,
      senderName: senderName ?? "User",
      senderColor: senderColor ?? "#7c6eff",
      roomId,
    },
    clientId,
  );

  return NextResponse.json({ sha }, { status: 201 });
}
