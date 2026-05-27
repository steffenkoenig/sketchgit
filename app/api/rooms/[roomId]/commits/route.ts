import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate } from "@/lib/api/validate";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { immutableHeaders, mutableHeaders } from "@/lib/api/cacheHeaders";
import {
  ensureRoom,
  getRoomPublicFlag,
  getRoomMembership,
  getCommitPage,
  loadRoomSnapshot,
  saveCommit,
} from "@/lib/db/roomRepository";

export const CommitsQuerySchema = z.object({
  cursor: z.string().max(64).optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
  /** Include full canvas data in each commit (for REST polling fallback). */
  canvas: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

const MAX_SHA_LEN = 64;
const MAX_BRANCH_LEN = 100;
const MAX_MSG_LEN = 500;
const MAX_CANVAS_BYTES = 512 * 1024;

/**
 * Schema for REST commit creation (mirrors WsCommitPayloadSchema + sha).
 * Used by the polling fallback client when WS is unavailable.
 */
export const CommitPostSchema = z.object({
  sha: z.string().min(8).max(MAX_SHA_LEN),
  commit: z.object({
    parent: z.string().max(MAX_SHA_LEN).nullable().optional(),
    parents: z.array(z.string().max(MAX_SHA_LEN)).max(10),
    branch: z.string().min(1).max(MAX_BRANCH_LEN),
    message: z.string().max(MAX_MSG_LEN),
    canvas: z.string().min(2).max(MAX_CANVAS_BYTES),
    isMerge: z.boolean().optional().default(false),
    ts: z.number().int().positive().optional(),
  }),
});

// ─── Shared access-control helper ────────────────────────────────────────────

type AccessDenied = { ok: false; response: ReturnType<typeof apiError> };
type AccessGranted = { ok: true; authSession: ReturnType<typeof getAuthSession> | null };
type AccessResult = AccessDenied | AccessGranted;

async function checkRoomAccess(roomId: string): Promise<AccessResult> {
  const room = await getRoomPublicFlag(roomId);
  if (!room) {
    return { ok: false, response: apiError(ApiErrorCode.ROOM_NOT_FOUND, "Room not found", 404) };
  }

  if (!room.isPublic) {
    const session = await auth();
    const authSession = getAuthSession(session);
    if (!authSession) {
      return { ok: false, response: apiError(ApiErrorCode.UNAUTHENTICATED, "Authentication required", 401) };
    }
    const membership = await getRoomMembership(roomId, authSession.user.id);
    if (!membership) {
      return { ok: false, response: apiError(ApiErrorCode.FORBIDDEN, "Forbidden", 403) };
    }
    return { ok: true, authSession };
  }
  return { ok: true, authSession: null };
}

// ─── GET /api/rooms/[roomId]/commits ─────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const url = new URL(req.url);
  const rawQuery = Object.fromEntries(url.searchParams);

  const v = validate(CommitsQuerySchema, rawQuery);
  if (!v.success) return v.response;
  const { cursor, take, canvas } = v.data;

  const access = await checkRoomAccess(roomId);
  if (!access.ok) return access.response;

  // ?canvas=true – return full CommitRecord objects (including canvas data)
  // for the REST polling fallback.  Uses loadRoomSnapshot which handles
  // DELTA → SNAPSHOT canvas reconstruction.  Cursor is ignored in this mode;
  // the response is always the `take` most recent commits.
  if (canvas) {
    const snapshot = await loadRoomSnapshot(roomId, { take });
    if (!snapshot) {
      return NextResponse.json({ commits: [], nextCursor: null }, { headers: mutableHeaders() });
    }
    const commits = Object.values(snapshot.commits);
    return NextResponse.json({ commits, nextCursor: null }, { headers: mutableHeaders() });
  }

  const { commits: page, nextCursor } = await getCommitPage(roomId, take, cursor);

  // P070 – cursor-addressed pages are immutable; first page must not be cached.
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

// ─── POST /api/rooms/[roomId]/commits ────────────────────────────────────────

/**
 * REST fallback for persisting a commit when the WebSocket server is
 * unavailable (e.g. Vercel deployment without a dedicated WS backend).
 *
 * Accepts the same commit payload that WsClient.send({ type: 'commit' })
 * would normally carry over the WebSocket connection.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;

  const access = await checkRoomAccess(roomId);
  if (!access.ok) return access.response;

  const body: unknown = await req.json().catch(() => null);
  if (body === null) {
    return apiError(ApiErrorCode.INVALID_JSON, "Invalid JSON", 400);
  }
  const v = validate(CommitPostSchema, body);
  if (!v.success) return v.response;

  const { sha, commit } = v.data;

  // Ensure the room record exists (idempotent, creates on first access).
  await ensureRoom(roomId, access.authSession?.user.id ?? null);

  await saveCommit(
    roomId,
    {
      sha,
      parent: commit.parent ?? null,
      parents: commit.parents,
      branch: commit.branch,
      message: commit.message,
      ts: commit.ts ?? Date.now(),
      canvas: commit.canvas,
      isMerge: commit.isMerge,
    },
    access.authSession?.user.id ?? null,
  );

  return NextResponse.json({ sha }, { status: 201 });
}
