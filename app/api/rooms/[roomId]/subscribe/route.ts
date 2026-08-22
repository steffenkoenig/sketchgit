/**
 * /api/rooms/[roomId]/subscribe
 *
 * P094 – Manage the calling user's email-digest subscription for a room.
 * All methods require authentication (subscriptions are tied to a User
 * with a verified email — there's no anonymous-subscriber concept).
 *
 *   GET    – returns the current subscription (or null).
 *   POST   – create/update the subscription. Body: { frequency: "HOURLY" | "DAILY" }.
 *   DELETE – remove the subscription.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validate } from "@/lib/api/validate";
import { apiError, ApiErrorCode } from "@/lib/api/errors";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import {
  getRoomPublicFlag,
  getRoomSubscription,
  upsertRoomSubscription,
  deleteRoomSubscription,
} from "@/lib/db/roomRepository";

const SubscribeRequestSchema = z.object({
  frequency: z.enum(["HOURLY", "DAILY"]),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const session = await auth();
  const authSession = getAuthSession(session);
  if (!authSession) {
    return apiError(ApiErrorCode.UNAUTHENTICATED, "Unauthenticated", 401);
  }
  const { roomId } = await params;
  const subscription = await getRoomSubscription(roomId, authSession.user.id);
  return NextResponse.json({ subscription });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const session = await auth();
  const authSession = getAuthSession(session);
  if (!authSession) {
    return apiError(ApiErrorCode.UNAUTHENTICATED, "Unauthenticated", 401);
  }
  if (!authSession.user.email) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, "Your account has no email address to send digests to.", 422);
  }

  const { roomId } = await params;
  const room = await getRoomPublicFlag(roomId);
  if (!room) {
    return apiError(ApiErrorCode.ROOM_NOT_FOUND, "Room not found", 404);
  }

  const body: unknown = await req.json().catch(() => null);
  if (body === null) {
    return apiError(ApiErrorCode.INVALID_JSON, "Invalid JSON", 400);
  }
  const v = validate(SubscribeRequestSchema, body);
  if (!v.success) return v.response;

  await upsertRoomSubscription(roomId, authSession.user.id, v.data.frequency);
  return NextResponse.json({ subscribed: true, frequency: v.data.frequency });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const session = await auth();
  const authSession = getAuthSession(session);
  if (!authSession) {
    return apiError(ApiErrorCode.UNAUTHENTICATED, "Unauthenticated", 401);
  }
  const { roomId } = await params;
  await deleteRoomSubscription(roomId, authSession.user.id);
  return NextResponse.json({ subscribed: false });
}
