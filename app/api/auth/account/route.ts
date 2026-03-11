/**
 * DELETE /api/auth/account
 *
 * P041 – GDPR right to erasure: permanently delete the authenticated user's
 * account and all cascaded data (Account, RoomMembership rows).
 * Rooms and Commits are preserved with ownerId/authorId set to null.
 *
 * For credentials users, password confirmation is required.
 * For OAuth-only users, no additional verification is needed — they are
 * already authenticated via OAuth in the current session.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { verifyCredentials } from "@/lib/db/userRepository";

const DeleteAccountSchema = z.object({
  password: z.string().min(1).max(128).optional(),
});

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const userId = session.user.id;

  // Check whether the user has a credentials password set
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, passwordHash: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Credentials users must re-confirm their password before deletion
  if (user.passwordHash) {
    let body: unknown = null;
    try { body = await req.json(); } catch { /* empty body */ }
    const v = DeleteAccountSchema.safeParse(body);
    if (!v.success || !v.data.password) {
      return NextResponse.json(
        { error: "Password confirmation is required for credentials accounts." },
        { status: 400 },
      );
    }
    const verified = user.email
      ? await verifyCredentials(user.email, v.data.password)
      : null;
    if (!verified) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 403 });
    }
  }

  // Delete the user — cascade handles Account and RoomMembership rows;
  // Room.ownerId and Commit.authorId are set to null (data is preserved).
  await prisma.user.delete({ where: { id: userId } });

  // Clear session cookies so the client is signed out immediately
  const response = NextResponse.json({ message: "Account deleted." }, { status: 200 });
  response.cookies.delete("authjs.session-token");
  response.cookies.delete("__Secure-authjs.session-token");
  return response;
}
