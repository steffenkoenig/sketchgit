/**
 * GET /api/templates/export
 *
 * P095 – GDPR data portability for shape templates. Returns all of the
 * authenticated user's templates (name + canvasJson) as a downloadable JSON
 * file.
 *
 * Note: this app has no general "export my account data" mechanism to
 * extend (the only prior GDPR endpoint is DELETE /api/auth/account, for
 * erasure) — this is deliberately scoped to templates only rather than
 * standing up a full account-data export, which would be a much larger,
 * separate undertaking. See the P095 report's Implementation Notes.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { getAllShapeTemplatesForExport } from "@/lib/db/templateRepository";

export async function GET() {
  const session = await auth();
  const authSession = getAuthSession(session);
  if (!authSession) {
    return apiError(ApiErrorCode.UNAUTHENTICATED, "Unauthenticated", 401);
  }

  const templates = await getAllShapeTemplatesForExport(authSession.user.id);
  const payload = {
    exportedAt: new Date().toISOString(),
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      canvasJson: t.canvasJson,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": "attachment; filename=\"sketchgit-templates-export.json\"",
    },
  });
}
