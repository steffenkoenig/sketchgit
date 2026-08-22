/**
 * GET /api/templates/[id]/thumbnail – the template's PNG preview image.
 *
 * P095. Returns 404 both when the template doesn't exist and when it has no
 * thumbnail (best-effort rendering failed at save time) — the client falls
 * back to a placeholder icon either way.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { getShapeTemplateThumbnail } from "@/lib/db/templateRepository";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const authSession = getAuthSession(session);
  if (!authSession) {
    return apiError(ApiErrorCode.UNAUTHENTICATED, "Unauthenticated", 401);
  }
  const { id } = await params;
  const png = await getShapeTemplateThumbnail(authSession.user.id, id);
  if (!png) {
    return apiError(ApiErrorCode.NOT_FOUND, "Thumbnail not found", 404);
  }
  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
