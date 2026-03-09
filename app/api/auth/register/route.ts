/**
 * POST /api/auth/register
 *
 * Creates a new user account with email + password credentials.
 * Returns the new user's public profile on success.
 */
import { NextRequest, NextResponse } from "next/server";
import { createUser } from "@/lib/db/userRepository";

export async function POST(req: NextRequest) {
  let body: { email?: unknown; password?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, password, name } = body;

  // ── Validate inputs ────────────────────────────────────────────────────────
  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 12) {
    return NextResponse.json(
      { error: "Password must be at least 12 characters." },
      { status: 400 }
    );
  }
  if (typeof name !== "string" || name.trim().length < 1) {
    return NextResponse.json({ error: "A display name is required." }, { status: 400 });
  }

  // ── Create user ────────────────────────────────────────────────────────────
  try {
    const user = await createUser({
      email: email.toLowerCase().trim(),
      password,
      name: name.trim().slice(0, 50),
    });

    return NextResponse.json(
      { id: user.id, email: user.email, name: user.name },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "EMAIL_IN_USE") {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }
    console.error("[register] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
