import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { verifyTwoFactorToken, setTwoFactorEnabled } from "@/lib/db/userRepository";
import { auth } from "@/lib/auth";

const Schema = z.object({
  code: z.string().length(6),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !session?.user?.id) {
    return apiError(ApiErrorCode.UNAUTHENTICATED, "Unauthorized", 401);
  }

  const body: unknown = await req.json().catch(() => null);
  if (body === null) {
    return apiError(ApiErrorCode.INVALID_JSON, "Invalid JSON", 400);
  }
  const v = validate(Schema, body);
  if (!v.success) return v.response;

  const { code } = v.data;

  const isValid = await verifyTwoFactorToken(session.user.email, code);

  if (!isValid) {
    return apiError(ApiErrorCode.FORBIDDEN, "Invalid or expired verification code.", 403);
  }

  // Set 2FA as enabled
  await setTwoFactorEnabled(session.user.id, true);

  return NextResponse.json({ message: "2FA enabled successfully." });
}
