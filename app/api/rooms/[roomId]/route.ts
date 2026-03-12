/**
 * PATCH /api/rooms/[roomId]
 *
 * P049 – Set or clear a memorable slug for a room.
 * Only the room owner (or a user with OWNER membership role) may update the slug.
 *
 * Body: { slug: string | null }
 *   - slug must be 3–50 lowercase alphanumeric + hyphens, no leading/trailing hyphens.
 *   - slug: null clears the slug.
 *
 * Errors:
 *   - 401  Unauthenticated
 *   - 403  Not the room owner
 *   - 404  Room not found
 *   - 409  Slug already taken (Prisma unique constraint)
 *   - 422  Zod validation failure
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { validate } from "@/lib/api/validate";
import { getAuthSession } from "@/lib/authTypes";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { getRoomOwnership, updateRoomSlug } from "@/lib/db/roomRepository";

export const PatchRoomSchema = z.object({
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters.")
    .max(50, "Slug must be at most 50 characters.")
    .regex(
      /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
      "Slug must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.",
    )
    .nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const session = await auth();
  const authSession = getAuthSession(session);
  if (!authSession) {
    return apiError(ApiErrorCode.UNAUTHENTICATED, "Unauthenticated", 401);
  }

  const userId = authSession.user.id;
  const { roomId } = await params;

  const ownership = await getRoomOwnership(roomId, userId);

  if (!ownership) {
    return apiError(ApiErrorCode.ROOM_NOT_FOUND, "Room not found", 404);
  }

  const isOwner = ownership.isOwner;
  if (!isOwner) {
    return apiError(ApiErrorCode.FORBIDDEN, "Forbidden", 403);
  }

  const body: unknown = await req.json().catch(() => null);
  if (body === null) {
    return apiError(ApiErrorCode.INVALID_JSON, "Invalid JSON", 400);
  }

  const v = validate(PatchRoomSchema, body);
  if (!v.success) return v.response;

  try {
    const updated = await updateRoomSlug(roomId, v.data.slug);
    return NextResponse.json(updated);
  } catch (err: unknown) {
    // Prisma unique-constraint violation (P2002) → slug already in use.
    if ((err as { code?: string }).code === "P2002") {
      return apiError(ApiErrorCode.SLUG_ALREADY_TAKEN, "Slug is already taken.", 409);
    }
    return apiError(ApiErrorCode.INTERNAL_ERROR, "Internal server error", 500);
  }
}
