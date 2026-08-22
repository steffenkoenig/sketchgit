/**
 * GET /api/subscriptions/unsubscribe?token=<signed>
 *
 * P094 – One-click unsubscribe, no login required. The token is a signed,
 * stateless credential (see lib/server/subscriptionTokens.ts) — possessing
 * a valid token (from an email SketchGit itself sent) is sufficient proof
 * of the right to remove that specific subscription. Returns a minimal
 * HTML confirmation page rather than JSON since this is reached by a
 * person clicking a link in their email client, not an API caller.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/server/subscriptionTokens";
import { deleteRoomSubscriptionById } from "@/lib/db/roomRepository";

function page(title: string, message: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>${title} — SketchGit</title></head>
<body style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 80px auto; padding: 0 16px; color: #1a1a2e;">
  <h1 style="font-size: 20px;">${title}</h1>
  <p>${message}</p>
</body>
</html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return page("Invalid link", "This unsubscribe link is missing its token.");
  }

  const subscriptionId = verifyUnsubscribeToken(token);
  if (!subscriptionId) {
    return page("Invalid link", "This unsubscribe link is invalid or has been tampered with.");
  }

  await deleteRoomSubscriptionById(subscriptionId);
  // Always show success even if the subscription was already removed
  // (e.g. the link was clicked twice) — the end state the user wants
  // (not subscribed) is already true either way.
  return page("Unsubscribed", "You will no longer receive email updates for this room.");
}
