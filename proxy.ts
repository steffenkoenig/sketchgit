/**
 * Next.js proxy (replaces "middleware" in Next.js 16).
 *
 * - Protects /dashboard: unauthenticated users are redirected to /auth/signin.
 * - All other routes (including the canvas app) are publicly accessible so
 *   that anonymous users experience no friction.
 */
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isDashboard = req.nextUrl.pathname.startsWith("/dashboard");

  if (isDashboard && !isLoggedIn) {
    const loginUrl = new URL("/auth/signin", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
