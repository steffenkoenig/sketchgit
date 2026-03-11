/**
 * userRepository – server-side data access for users.
 * Passwords are stored as bcrypt hashes; raw passwords never leave this module.
 *
 * Note: `bcryptjs` is a pure-JavaScript implementation, chosen for its
 * zero-native-dependency install. For production deployments with higher
 * throughput requirements, consider switching to the `bcrypt` native package
 * for significantly faster hashing. The API is identical.
 */
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
