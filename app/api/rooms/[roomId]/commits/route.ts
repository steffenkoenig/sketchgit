import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { validate } from "@/lib/api/validate";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { immutableHeaders, mutableHeaders } from "@/lib/api/cacheHeaders";

const QuerySchema = z.object({
  cursor: z.string().max(64).optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const url = new URL(req.url);
  const rawQuery = Object.fromEntries(url.searchParams);

  const v = validate(QuerySchema, rawQuery);
  if (!v.success) return v.response;
  const { cursor, take } = v.data;

  const room = await prisma.room.findUnique({ where: { id: roomId } });
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
    const membership = await prisma.roomMembership.findUnique({
      where: { roomId_userId: { roomId, userId: authSession.user.id } },
      select: { role: true },
    });
    if (!membership) {
      return apiError(ApiErrorCode.FORBIDDEN, "Forbidden", 403);
    }
  }

  const commits = await prisma.commit.findMany({
    where: { roomId },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { cursor: { sha: cursor }, skip: 1 } : {}),
    select: {
      sha: true,
      parentSha: true,
      branch: true,
      message: true,
      createdAt: true,
      isMerge: true,
    },
  });

  const hasMore = commits.length > take;
  const page = hasMore ? commits.slice(0, take) : commits;
  const nextCursor = hasMore ? page[page.length - 1].sha : null;

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
