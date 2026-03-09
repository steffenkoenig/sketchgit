/**
 * NextAuth route handler for the App Router.
 * Handles all /api/auth/* requests (sign-in, sign-out, session, OAuth callbacks).
 */
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
