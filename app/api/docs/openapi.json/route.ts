/**
 * GET /api/docs/openapi.json
 *
 * P062 – Serve the auto-generated OpenAPI 3.1 specification as JSON.
 * The spec is built from the existing Zod request schemas; it is always
 * in sync with the actual validation logic.
 */
import { NextResponse } from "next/server";
import { buildOpenApiSpec } from "@/lib/api/openapi";
import { shortLivedHeaders } from "@/lib/api/cacheHeaders";

export function GET(): NextResponse {
  const spec = buildOpenApiSpec();
  return NextResponse.json(spec, {
    headers: shortLivedHeaders(300, 60), // 5 min max-age, 60 s stale-while-revalidate
  });
}
