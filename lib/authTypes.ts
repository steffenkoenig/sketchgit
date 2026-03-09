/**
 * Type utilities for NextAuth sessions.
 *
 * NextAuth's default Session type does not include `id` on the user object.
 * The callbacks in lib/auth.ts add it to the JWT and expose it on the session.
 * Use `AuthUser` when you need the typed `id` field.
 */
import type { Session } from "next-auth";

export interface AuthUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export interface AuthSession extends Session {
  user: AuthUser;
}

/**
 * Narrow a NextAuth session to include the `id` field.
 * Returns null if the session is missing or unauthenticated.
 */
export function getAuthSession(session: Session | null): AuthSession | null {
  if (!session?.user) return null;
  const user = session.user as Partial<AuthUser>;
  if (!user.id) return null;
  return session as AuthSession;
}
