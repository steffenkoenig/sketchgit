import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { createTwoFactorToken, setTwoFactorEnabled } from "@/lib/db/userRepository";
import { auth } from "@/lib/auth";

const Schema = z.object({
  enable: z.boolean(),
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

  const { enable } = v.data;

  if (!enable) {
    // Disabling 2FA doesn't require email verification for now based on requirements,
    // just turn it off.
    await setTwoFactorEnabled(session.user.id, false);
    return NextResponse.json({ message: "2FA disabled successfully." });
  }

  // Generate a token and send an email
  const token = await createTwoFactorToken(session.user.email);

  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: session.user.email,
        subject: "Your SketchGit 2FA Verification Code",
        html: `<p>Your Two-Factor Authentication code is:</p>
<h2>${token}</h2>
<p>This code is valid for 10 minutes. If you did not request this, you can safely ignore this email.</p>`,
      });
    } catch (e) {
      console.error("[2FA Enable] Failed to send email:", e);
      return apiError(ApiErrorCode.INTERNAL_ERROR, "Failed to send 2FA email.", 500);
    }
  }

  return NextResponse.json({ message: "Verification code sent." });
}
