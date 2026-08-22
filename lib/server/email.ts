/**
 * lib/server/email.ts
 *
 * Shared outbound email helper, extracted from the copy-pasted Resend calls
 * in app/api/auth/forgot-password/route.ts and app/api/auth/2fa/enable/route.ts
 * (both duplicated the same pattern) — P094 (room activity digests) would
 * have been a third copy.
 *
 * Gated by RESEND_API_KEY + EMAIL_FROM both being set. Absent in dev (no
 * email provider configured), sendEmail() is a silent no-op — matches the
 * existing behaviour of the two call sites this was extracted from, so
 * local development continues to work without a Resend account.
 */
export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text fallback. Recommended for accessibility/deliverability; falls back to a naive HTML-tag strip when omitted. */
  text?: string;
}

function isEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export type SendEmailResult =
  | { sent: true }
  /** "not_configured": dev mode, no RESEND_API_KEY/EMAIL_FROM — not a failure to report to the user. "error": provider was configured but the send itself threw. */
  | { sent: false; reason: "not_configured" | "error" };

/**
 * Sends an email via Resend. Never throws — a thrown error from the
 * provider is caught and returned as `{sent: false, reason: "error"}`
 * rather than propagating, since most callers treat email delivery as
 * best-effort. Callers that need the user to actually receive the email
 * (e.g. a 2FA code) should check the result and surface an error when
 * `reason === "error"` (but not for "not_configured" — that's expected in
 * local dev without a Resend account).
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!isEmailConfigured()) return { sent: false, reason: "not_configured" };
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.EMAIL_FROM!,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? input.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    });
    return { sent: true };
  } catch (err) {
    console.error("[email] send failed", err);
    return { sent: false, reason: "error" };
  }
}
