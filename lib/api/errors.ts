/**
 * Standardised API error codes and response helper.
 *
 * P068 – All API route handlers return errors in a consistent
 * `{ code, message, details? }` shape rather than plain English strings.
 * This enables:
 *   - Stable client-side error matching (code never changes, message may)
 *   - Localised error messages via `t(`errors.${code}`)` in next-intl
 *   - Typed OpenAPI error response schemas
 *
 * Usage:
 *   return apiError(ApiErrorCode.NOT_FOUND, 'Room not found', 404);
 *   return apiError(ApiErrorCode.VALIDATION_ERROR, 'Invalid input', 422, details);
 */
import { NextResponse } from "next/server";

// ─── Error code registry ──────────────────────────────────────────────────────

export const ApiErrorCode = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  EMAIL_IN_USE: "EMAIL_IN_USE",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  INVALID_RESET_TOKEN: "INVALID_RESET_TOKEN",
  PASSWORD_REQUIRED: "PASSWORD_REQUIRED",
  // ── Resources ────────────────────────────────────────────────────────────
  NOT_FOUND: "NOT_FOUND",
  ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
  SLUG_ALREADY_TAKEN: "SLUG_ALREADY_TAKEN",
  // ── Validation ───────────────────────────────────────────────────────────
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_JSON: "INVALID_JSON",
  // ── Export ───────────────────────────────────────────────────────────────
  EXPORT_FAILED: "EXPORT_FAILED",
  CANVAS_NOT_FOUND: "CANVAS_NOT_FOUND",
  // ── Server ────────────────────────────────────────────────────────────────
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

/** Union type of all valid error code string literals. */
export type ApiErrorCodeValue = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export interface ApiErrorBody {
  code: ApiErrorCodeValue;
  /** Human-readable description (English). Primarily for logging/debugging. */
  message: string;
  /** Optional structured details, e.g. Zod validation issues. */
  details?: unknown;
}

/**
 * Returns a `NextResponse` with a standardised `ApiErrorBody` JSON body.
 *
 * @param code    - Machine-readable error code from `ApiErrorCode`
 * @param message - Human-readable English description
 * @param status  - HTTP status code
 * @param details - Optional extra context (e.g. Zod flatten output)
 */
export function apiError(
  code: ApiErrorCodeValue,
  message: string,
  status: number,
  details?: unknown,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ code, message, details }, { status });
}
