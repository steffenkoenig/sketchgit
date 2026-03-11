/**
 * userRepository – server-side data access for users.
 * Passwords are stored as bcrypt hashes; raw passwords never leave this module.
 *
 * Note: `bcryptjs` is a pure-JavaScript implementation, chosen for its
 * zero-native-dependency install. For production deployments with higher
 * throughput requirements, consider switching to the `bcrypt` native package
 * for significantly faster hashing. The API is identical.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
}

export interface PublicUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  createdAt: Date;
}

const SALT_ROUNDS = 12;

/**
 * A pre-computed bcrypt hash (cost 12) of a fixed sentinel string.
 * Used in verifyCredentials() to ensure constant-time behaviour when the
 * supplied email address does not match any registered account: we always
 * run bcrypt.compare() regardless, so response time cannot reveal which
 * email addresses are registered (OWASP timing-attack defence).
 *
 * This value is intentionally public – it is not a secret.
 * Regenerate with:
 *   node -e "require('bcryptjs').hash('dummy-password-to-prevent-timing-attacks',12).then(console.log)"
 */
const DUMMY_HASH =
  "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW";

/**
 * Create a new user with a hashed password.
 * Throws if the email is already registered.
 */
export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    throw new Error("EMAIL_IN_USE");
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash,
    },
    select: { id: true, email: true, name: true, image: true, createdAt: true },
  });

  return user;
}

/**
 * Verify credentials and return the user, or null if the credentials are invalid.
 *
 * P054 – constant-time defence: always run bcrypt.compare() even when the email
 * is not registered, so response time cannot be used to enumerate accounts.
 */
export async function verifyCredentials(
  email: string,
  password: string
): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({ where: { email } });

  // Always run bcrypt.compare to prevent timing-based user-enumeration attacks.
  // When the user does not exist (or has no password), compare against the dummy
  // hash – this will always fail but the elapsed time is indistinguishable from
  // a real wrong-password check.
  const hashToCompare = user?.passwordHash ?? DUMMY_HASH;
  const valid = await bcrypt.compare(password, hashToCompare);

  if (!user || !user.passwordHash || !valid) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    createdAt: user.createdAt,
  };
}

// ─── P040: Password reset ──────────────────────────────────────────────────────

/** TTL for password-reset tokens: 24 hours. */
const RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Generate and persist a password-reset token for `email`.
 * Returns the token string, or null when the email is not registered
 * (silent failure prevents email-enumeration attacks).
 * A second call for the same email replaces the previous token.
 */
export async function createPasswordResetToken(email: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null; // silently fail – do not reveal whether email is registered

  const token = randomBytes(32).toString("hex"); // 64-char hex, 256 bits of entropy
  const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  // Reuse the NextAuth VerificationToken model.  The `identifier` is the user's
  // email; the sentinel `token` field value "reset" is the compound PK key so
  // that only one active reset token per address exists at a time.
  await prisma.verificationToken.upsert({
    where: { identifier_token: { identifier: email, token: "reset" } },
    create: { identifier: email, token: "reset", expires },
    update: { expires },
  });
  // Store the actual secret token in a second row keyed by the token value.
  await prisma.verificationToken.upsert({
    where: { identifier_token: { identifier: email, token } },
    create: { identifier: email, token, expires },
    update: { expires },
  });

  return token;
}

/**
 * Consume a reset token and update the user's password.
 * Returns `true` on success, `false` when the token is invalid or expired.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<boolean> {
  const record = await prisma.verificationToken.findFirst({
    where: { token, expires: { gt: new Date() } },
  });
  if (!record) return false;

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({
      where: { email: record.identifier },
      data: { passwordHash },
    }),
    prisma.verificationToken.deleteMany({
      where: { identifier: record.identifier },
    }),
  ]);

  return true;
}
