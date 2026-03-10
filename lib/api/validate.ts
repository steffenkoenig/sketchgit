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
  return {
    success: false,
    response: NextResponse.json(
      {
        errors: result.error.issues.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      },
      { status: 422 },
    ),
  };
}
