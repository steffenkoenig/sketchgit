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
 */
export async function verifyCredentials(
  email: string,
  password: string
): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    createdAt: user.createdAt,
  };
}
