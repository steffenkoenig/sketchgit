/**
 * GET   /api/admin/feature-flags/[name] — read a single feature flag.
 * PATCH /api/admin/feature-flags/[name] — update a feature flag.
 *
 * P090 – Admin-only. Requires the `x-admin-secret` header to match
 * ADMIN_API_SECRET (no site-wide admin role exists in this app's RBAC).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { verifyAdminSecret } from "@/lib/server/adminAuth";
import { getFeatureFlag, updateFeatureFlag } from "@/lib/db/featureFlagRepository";
import { invalidateFeatureFlagCache } from "@/lib/server/featureFlags";

const TargetScopeSchema = z.object({
  userIds: z.array(z.string()).max(1000).optional(),
  roomIds: z.array(z.string()).max(1000).optional(),
});

export const UpdateFeatureFlagSchema = z.object({
  description: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
  targetScope: TargetScopeSchema.optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  if (!verifyAdminSecret(req.headers.get("x-admin-secret"))) {
    return apiError(ApiErrorCode.FORBIDDEN, "Access denied", 403);
  }

  const { name } = await params;
  const flag = await getFeatureFlag(name);
  if (!flag) {
    return apiError(ApiErrorCode.NOT_FOUND, "Feature flag not found", 404);
  }
  return NextResponse.json(flag);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  if (!verifyAdminSecret(req.headers.get("x-admin-secret"))) {
    return apiError(ApiErrorCode.FORBIDDEN, "Access denied", 403);
  }

  const { name } = await params;

  const body: unknown = await req.json().catch(() => null);
  if (body === null) {
    return apiError(ApiErrorCode.INVALID_JSON, "Invalid JSON", 400);
  }
  const v = validate(UpdateFeatureFlagSchema, body);
  if (!v.success) return v.response;

  const flag = await updateFeatureFlag(name, v.data);
  if (!flag) {
    return apiError(ApiErrorCode.NOT_FOUND, "Feature flag not found", 404);
  }

  // P090 – invalidate the in-process cache so the change takes effect
  // immediately rather than waiting out the 30s TTL.
  invalidateFeatureFlagCache(name);

  return NextResponse.json(flag);
}
