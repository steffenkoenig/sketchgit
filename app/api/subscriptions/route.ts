/**
 * GET /api/subscriptions
 *
 * P094 – Lists the authenticated user's room email-digest subscriptions,
 * for the dashboard's "My Subscriptions" section.
 */
import { NextResponse } from "next/server";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { getUserSubscriptions } from "@/lib/db/roomRepository";

export async function GET() {
  const session = await auth();
  const authSession = getAuthSession(session);
  if (!authSession) {
    return apiError(ApiErrorCode.UNAUTHENTICATED, "Unauthenticated", 401);
  }
  const subscriptions = await getUserSubscriptions(authSession.user.id);
  return NextResponse.json({ subscriptions });
}
