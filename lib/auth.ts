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
import { CredentialsSignin } from "next-auth";
import { verifyCredentials, createTwoFactorToken, verifyTwoFactorToken } from "@/lib/db/userRepository";
import { sendEmail } from "@/lib/server/email";
import { withEncryptedAccountTokens } from "@/lib/server/encryptedAuthAdapter";

// Build the provider list conditionally so that missing GitHub credentials
// don't cause a silent failure or confusing error at OAuth callback time.
const providers = [
  Credentials({
    name: "Email & Password",
    credentials: {
      email: { label: "Email", type: "email", placeholder: "you@example.com" },
      password: { label: "Password", type: "password" },
      code: { label: "2FA Code", type: "text", optional: true },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;

      const user = await verifyCredentials(
        credentials.email as string,
        credentials.password as string
      );

      if (!user) return null;

      if (user.twoFactorEnabled) {
        if (!credentials.code) {
          // Generate token and send email
          const token = await createTwoFactorToken(user.email!);
          await sendEmail({
            to: user.email!,
            subject: "Your SketchGit 2FA Verification Code",
            html: `<p>Your Two-Factor Authentication code is:</p><h2>${token}</h2><p>This code is valid for 10 minutes. If you did not request this, you can safely ignore this email.</p>`,
          });
          // Auth.js v5 error handling for custom errors.
          class TwoFactorRequiredError extends CredentialsSignin {
            code = "2FA_REQUIRED";
          }
          throw new TwoFactorRequiredError();
        } else {
          // Verify code
          const isValid = await verifyTwoFactorToken(user.email!, credentials.code as string);
          if (!isValid) {
            class InvalidTwoFactorCodeError extends CredentialsSignin {
              code = "INVALID_2FA_CODE";
            }
            throw new InvalidTwoFactorCodeError();
          }
        }
      }

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
  // GAP-014 – encrypts Account.access_token/refresh_token/id_token at rest
  // (AES-256-GCM) so a database dump alone doesn't hand out usable GitHub
  // credentials. See lib/server/encryptedAuthAdapter.ts.
  adapter: PrismaAdapter(withEncryptedAccountTokens(prisma)),

  // NextAuth v5 rejects every request with UntrustedHost unless the host is
  // explicitly trusted. This app is self-hosted (Docker/Kubernetes, not
  // Vercel/another platform NextAuth auto-detects), so without this every
  // sign-in and session check fails outright in production. Safe here
  // because proxy.ts and the reverse proxy/ingress in front of this app are
  // the actual boundary that determines what Host header reaches Next.js —
  // this flag only tells NextAuth to trust the Host header it's given, the
  // same as every other framework's default assumption about its own
  // reverse proxy.
  trustHost: true,

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
