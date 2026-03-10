/**
 * POST /api/auth/register
 *
 * Creates a new user account with email + password credentials.
 * Returns the new user's public profile on success.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createUser } from "@/lib/db/userRepository";
import { validate } from "@/lib/api/validate";

const RegisterSchema = z.object({
  email: z.string().email("A valid email address is required.").max(254),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters.")
    .max(128, "Password must be at most 128 characters."),
  name: z
    .string()
    .trim()
    .min(1, "A display name is required.")
    .max(50, "Display name must be at most 50 characters."),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

export async function POST(req: NextRequest) {
  const body: unknown = await req.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const v = validate(RegisterSchema, body);
  if (!v.success) return v.response;

  const { email, password, name } = v.data;

  // ── Create user ────────────────────────────────────────────────────────────
  try {
    const user = await createUser({
      email: email.toLowerCase().trim(),
      password,
      name,
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
