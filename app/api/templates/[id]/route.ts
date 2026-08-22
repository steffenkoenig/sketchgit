/**
 * GET    /api/templates/[id]  – fetch one template's full canvasJson (for instantiation onto the canvas).
 * DELETE /api/templates/[id]  – delete one of the authenticated user's templates.
 *
 * P095 – Custom shape templates. Both routes are scoped to the owning user;
 * requesting/deleting another user's template returns 404 (not 403) so as
 * not to leak the existence of other users' template IDs.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { deleteShapeTemplate, getShapeTemplate } from "@/lib/db/templateRepository";

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
  const template = await getShapeTemplate(authSession.user.id, id);
  if (!template) {
    return apiError(ApiErrorCode.NOT_FOUND, "Template not found", 404);
  }
  return NextResponse.json({ template });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const authSession = getAuthSession(session);
  if (!authSession) {
    return apiError(ApiErrorCode.UNAUTHENTICATED, "Unauthenticated", 401);
  }
  const { id } = await params;
  const deleted = await deleteShapeTemplate(authSession.user.id, id);
  if (!deleted) {
    return apiError(ApiErrorCode.NOT_FOUND, "Template not found", 404);
  }
  return NextResponse.json({ message: "Template deleted." });
}
