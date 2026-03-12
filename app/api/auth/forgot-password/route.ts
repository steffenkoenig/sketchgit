/**
 * POST /api/auth/forgot-password
 *
 * P040 – Request a password-reset email.
 * Always returns 200 to prevent email-enumeration attacks.
 * When RESEND_API_KEY / EMAIL_FROM env vars are absent, the token is
 * generated and stored but no email is sent (dev mode).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { createPasswordResetToken } from "@/lib/db/userRepository";

const Schema = z.object({
  email: z.string().email().max(254),
});

const SAFE_MESSAGE = "If that email is registered, you'll receive a reset link shortly.";

export async function POST(req: NextRequest) {
  const body: unknown = await req.json().catch(() => null);
  if (body === null) {
    return apiError(ApiErrorCode.INVALID_JSON, "Invalid JSON", 400);
  }
  const v = validate(Schema, body);
  if (!v.success) return v.response;

  const { email } = v.data;
  const token = await createPasswordResetToken(email);

  if (token) {
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const resetLink = `${baseUrl}/auth/reset-password?token=${token}`;

    // Send email when credentials are configured; otherwise log for dev.
    if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.EMAIL_FROM,
          to: email,
          subject: "Reset your SketchGit password",
          html: `<p>Click the link below to reset your password (valid for 24 hours):</p>
<p><a href="${resetLink}">${resetLink}</a></p>
<p>If you did not request this, you can safely ignore this email.</p>`,
        });
      } catch {
        // Do not surface email-send failures to the caller.
      }
    }
  }

  return NextResponse.json({ message: SAFE_MESSAGE });
}
