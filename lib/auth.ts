/**
 * NextAuth (Auth.js v5) configuration for SketchGit.
 *
 * Supported providers:
 *  - Credentials  (email + password, stored in PostgreSQL via Prisma)
 *  - GitHub OAuth (optional; configure GITHUB_ID + GITHUB_SECRET in .env)
 *
 * Session strategy: JWT (stateless, no Session table required).
 */
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import { prisma } from "@/lib/db/prisma";
import { verifyCredentials } from "@/lib/db/userRepository";

// Build the provider list conditionally so that missing GitHub credentials
// don't cause a silent failure or confusing error at OAuth callback time.
const providers = [
  Credentials({
    name: "Email & Password",
    credentials: {
      email: { label: "Email", type: "email", placeholder: "you@example.com" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;

      const user = await verifyCredentials(
        credentials.email as string,
        credentials.password as string
      );

      if (!user) return null;

      // Return the shape NextAuth expects
      return { id: user.id, email: user.email, name: user.name };
    },
  }),
];

// Include GitHub OAuth only when both credentials are present in the environment.
if (process.env.GITHUB_ID && process.env.GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }) as never
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  providers,

  session: {
    strategy: "jwt",
  },

  callbacks: {
    /** Persist the user id in the JWT token. */
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    /** Expose the user id on the client-side session object. */
    session({ session, token }) {
      if (token.id && session.user) {
        (session.user as typeof session.user & { id: string }).id =
          token.id as string;
      }
      return session;
    },
  },

  pages: {
    signIn: "/auth/signin",
  },
});
