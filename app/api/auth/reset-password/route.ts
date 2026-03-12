/**
 * POST /api/auth/reset-password
 *
 * P040 – Consume a reset token and update the user's password.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate } from "@/lib/api/validate";
import { resetPassword } from "@/lib/db/userRepository";
import { apiError, ApiErrorCode } from "@/lib/api/errors";

const Schema = z.object({
  token: z.string().max(128),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters.")
    .max(128, "Password must be at most 128 characters."),
});

export async function POST(req: NextRequest) {
  const body: unknown = await req.json().catch(() => null);
  const v = validate(Schema, body);
  if (!v.success) return v.response;

  const { token, password } = v.data;
  const success = await resetPassword(token, password);

  if (!success) {
    return apiError(ApiErrorCode.INVALID_RESET_TOKEN, "Invalid or expired token.", 400);
  }

  return NextResponse.json({ message: "Password updated successfully." });
}
