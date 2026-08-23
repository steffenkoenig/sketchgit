import { NextResponse } from "next/server";

/**
 * GET /.well-known/security.txt
 *
 * RFC 9116 vulnerability-disclosure metadata. GAP-011 — the previous
 * static public/.well-known/security.txt shipped hardcoded example.com
 * placeholders that would silently stay wrong if a deployment forgot to
 * edit them, and its Expires date would eventually lapse (an expired
 * security.txt is treated as absent by scanning tools). Both problems are
 * eliminated by generating the file per-request instead:
 *  - Canonical/Policy are derived from NEXTAUTH_URL (this app's existing
 *    "canonical deployment URL" env var, already used the same way by
 *    forgot-password emails and the digest job) rather than the request's
 *    own URL — this custom server (server.ts, raw Node http + Next.js)
 *    does not reflect the client-facing Host header in NextRequest.url
 *    (confirmed with a real curl request using a custom Host header: it
 *    resolved to the server's bind address, not the Host sent — the
 *    same behaviour the sibling /.well-known/change-password route has
 *    always had), so there is nothing to hardcode or forget to update.
 *  - Expires is always ~1 year out from the moment of the request, so it
 *    never goes stale.
 * Contact is the real address from SECURITY.md (not a placeholder).
 */
export function GET(): NextResponse {
  const origin = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const body = [
    "Contact: mailto:sketchgit-security@skonig.de",
    `Expires: ${expires}`,
    "Preferred-Languages: de, en",
    `Canonical: ${origin}/.well-known/security.txt`,
    `Policy: ${origin}/security-policy`,
  ].join("\n") + "\n";

  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
