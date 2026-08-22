/**
 * GET  /api/templates  – list the authenticated user's shape templates.
 * POST /api/templates  – save a new shape template from a canvas selection.
 *
 * P095 – Custom shape templates. Templates are scoped to the owning user;
 * there is no cross-user sharing.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { createShapeTemplate, listShapeTemplates } from "@/lib/db/templateRepository";
import { renderShapeTemplateThumbnail } from "@/lib/export/canvasRenderer";
import { sanitizeTemplateCanvasJson, TemplateValidationError } from "@/lib/server/templateSanitizer";

const MAX_TEMPLATES_PER_USER = 100;

const CreateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  canvasJson: z.record(z.string(), z.unknown()),
});

export async function GET() {
  const session = await auth();
  const authSession = getAuthSession(session);
  if (!authSession) {
    return apiError(ApiErrorCode.UNAUTHENTICATED, "Unauthenticated", 401);
  }
  const templates = await listShapeTemplates(authSession.user.id);
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const authSession = getAuthSession(session);
  if (!authSession) {
    return apiError(ApiErrorCode.UNAUTHENTICATED, "Unauthenticated", 401);
  }

  let body: unknown = null;
  try { body = await req.json(); } catch { /* empty body */ }
  const v = CreateTemplateSchema.safeParse(body);
  if (!v.success) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "Invalid template payload", 422, v.error.flatten());
  }

  const existing = await listShapeTemplates(authSession.user.id);
  if (existing.length >= MAX_TEMPLATES_PER_USER) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, `You can save at most ${MAX_TEMPLATES_PER_USER} templates.`, 422);
  }

  let sanitized: object;
  try {
    sanitized = sanitizeTemplateCanvasJson(v.data.canvasJson);
  } catch (err) {
    if (err instanceof TemplateValidationError) {
      return apiError(ApiErrorCode.VALIDATION_ERROR, err.message, 422);
    }
    throw err;
  }

  // Thumbnail rendering is best-effort; the template is still saved without
  // a preview image on failure (client falls back to a placeholder icon).
  const thumbnailPng: Buffer | null = await renderShapeTemplateThumbnail(sanitized).catch(() => null);

  const template = await createShapeTemplate(authSession.user.id, v.data.name, sanitized, thumbnailPng);
  return NextResponse.json({ template }, { status: 201 });
}
