import { NextRequest, NextResponse } from "next/server";

/**
 * GET /.well-known/change-password
 *
 * WHATWG Well-Known URL for password changes.
 * Password managers and browsers use this to offer direct navigation to
 * the password change / reset page.
 * https://wicg.github.io/change-password-url/
 */
export function GET(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL("/auth/forgot-password", request.url), {
    status: 302,
  });
}
