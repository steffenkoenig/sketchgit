/**
 * Reusable Zod validation helper for Next.js API route handlers.
 *
 * Usage:
 *   const v = validate(MySchema, await req.json().catch(() => null));
 *   if (!v.success) return v.response;
 *   const { field } = v.data; // fully typed
 */
import { type ZodSchema } from "zod";
import { NextResponse } from "next/server";
import { apiError, ApiErrorCode } from "./errors";

type ValidationSuccess<T> = { success: true; data: T };
type ValidationFailure = { success: false; response: NextResponse };

export function validate<T>(
  schema: ZodSchema<T>,
  data: unknown,
): ValidationSuccess<T> | ValidationFailure {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const details = result.error.issues.map((e) => ({
    field: e.path.join("."),
    message: e.message,
  }));
  return {
    success: false,
    response: apiError(ApiErrorCode.VALIDATION_ERROR, "Validation failed", 422, details),
  };
}
