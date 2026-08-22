/**
 * POST /api/admin/feature-flags — create a new feature flag.
 * GET  /api/admin/feature-flags — list all feature flags.
 *
 * P090 – Admin-only. Requires the `x-admin-secret` header to match
 * ADMIN_API_SECRET (no site-wide admin role exists in this app's RBAC).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { verifyAdminSecret } from "@/lib/server/adminAuth";
import { createFeatureFlag, listFeatureFlags } from "@/lib/db/featureFlagRepository";

const TargetScopeSchema = z.object({
  userIds: z.array(z.string()).max(1000).optional(),
  roomIds: z.array(z.string()).max(1000).optional(),
});

export const CreateFeatureFlagSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "name must be lowercase kebab-case"),
  description: z.string().max(500).default(""),
  enabled: z.boolean().default(false),
  targetScope: TargetScopeSchema.default({}),
});

export async function POST(req: NextRequest) {
  if (!verifyAdminSecret(req.headers.get("x-admin-secret"))) {
    return apiError(ApiErrorCode.FORBIDDEN, "Access denied", 403);
  }

  const body: unknown = await req.json().catch(() => null);
  if (body === null) {
    return apiError(ApiErrorCode.INVALID_JSON, "Invalid JSON", 400);
  }
  const v = validate(CreateFeatureFlagSchema, body);
  if (!v.success) return v.response;
  const { name, description, enabled, targetScope } = v.data;

  const flag = await createFeatureFlag(name, description, enabled, targetScope).catch(() => null);
  if (!flag) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "A flag with this name already exists", 409);
  }

  return NextResponse.json(flag, { status: 201 });
}

export async function GET(req: NextRequest) {
  if (!verifyAdminSecret(req.headers.get("x-admin-secret"))) {
    return apiError(ApiErrorCode.FORBIDDEN, "Access denied", 403);
  }

  const flags = await listFeatureFlags();
  return NextResponse.json({ flags });
}
