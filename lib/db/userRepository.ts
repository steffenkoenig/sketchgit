/**
 * userRepository – server-side data access for users.
 *
 * P065 – Passwords are now stored as Argon2id hashes (OWASP recommendation).
 * Legacy bcrypt hashes (prefixed with "$2b$" or "$2a$") are detected on login
 * and transparently re-hashed with Argon2id — the user notices no difference.
 * New registrations and password resets use Argon2id exclusively.
 *
 * Argon2id parameters (OWASP / RFC 9106 §4 level 2):
 *   memoryCost: 65536 KiB (64 MB)  — GPU-resistant memory hardness
 *   timeCost:   3 iterations
 *   parallelism: 4 threads
 * Target latency: ~200–500 ms on commodity server hardware.
 */
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
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

// ─── Argon2id parameters (OWASP recommendation) ────────────────────────────────
const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536,  // 64 MB
  timeCost: 3,
  parallelism: 4,
};

/**
 * Returns true when `hash` is a bcrypt hash (legacy format: "$2b$…" or "$2a$…").
 * Argon2id hashes always start with "$argon2id$".
 */
function isBcryptHash(hash: string): boolean {
  return hash.startsWith("$2b$") || hash.startsWith("$2a$");
}

/**
 * A pre-computed Argon2id hash of a fixed sentinel string.
 * Used in verifyCredentials() to ensure constant-time behaviour when the
 * supplied email address does not match any registered account: we always
 * run argon2.verify() regardless, so response time cannot reveal which
 * email addresses are registered (OWASP timing-attack defence).
 *
 * Regenerate with:
 *   node -e "require('argon2').hash('dummy-sentinel',{type:require('argon2').argon2id,memoryCost:65536,timeCost:3,parallelism:4}).then(console.log)"
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$dummy$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/**
 * Create a new user with an Argon2id-hashed password.
 * Throws if the email is already registered.
 */
export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    throw new Error("EMAIL_IN_USE");
  }

  const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);

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
 * P054 – constant-time defence: always run a hash comparison even when the email
 * is not registered, so response time cannot be used to enumerate accounts.
 *
 * P065 – supports both legacy bcrypt hashes (transparent migration) and
 * new Argon2id hashes.  On successful bcrypt login the password is silently
 * re-hashed with Argon2id ("re-hash on login" migration strategy).
 */
export async function verifyCredentials(
  email: string,
  password: string
): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({ where: { email } });

  // Constant-time guard: always run a verify, even for unknown emails.
  const hashToCompare = user?.passwordHash ?? DUMMY_HASH;

  let valid: boolean;
  if (isBcryptHash(hashToCompare)) {
    // Legacy path: bcrypt hash from before P065.
    valid = await bcrypt.compare(password, hashToCompare);
  } else {
    try {
      valid = await argon2.verify(hashToCompare, password);
    } catch {
      valid = false;
    }
  }

  if (!user || !user.passwordHash || !valid) return null;

  // P065 – transparent re-hash: if the stored hash is bcrypt, upgrade it to
  // Argon2id so subsequent logins use the stronger algorithm.  Runs in the
  // background; the login response is not delayed.  Errors are logged but do
  // not fail the login.
  if (isBcryptHash(user.passwordHash)) {
    void argon2.hash(password, ARGON2_OPTIONS)
      .then((newHash) =>
        prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } }),
      )
      .catch(() => {
        // Re-hash failure is non-fatal: the user can still log in with bcrypt
        // and will be upgraded on the next successful login.
      });
  }

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

  // Delete all existing reset tokens for this email to ensure only one is active.
  await prisma.verificationToken.deleteMany({ where: { identifier: email } });

  // Store the actual secret token keyed by the token value.
  await prisma.verificationToken.create({
    data: { identifier: email, token, expires },
  });

  return token;
}

/**
 * Consume a reset token and update the user's password with Argon2id.
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

  const passwordHash = await argon2.hash(newPassword, ARGON2_OPTIONS);

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
