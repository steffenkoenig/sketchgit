/**
 * lib/server/shareLinkTokens.ts
 *
 * P091 – Cryptographic helpers for granular share-link tokens and scope cookies.
 *
 * Token strategy (mirrors P066 invitationTokens.ts):
 *   • Token stored in DB = 32 random bytes hex-encoded (64 chars), unguessable.
 *   • URL embeds an HMAC-SHA256 over (token:roomId:scope:expiresAt) to allow
 *     cheap server-side tampering detection before the DB lookup.
 *
 * Scope-cookie strategy:
 *   • The `GET /api/share/[token]` handler sets a short-lived HttpOnly cookie
 *     (`sketchgit_share_scope`) encoding the resolved share-link scope metadata.
 *   • Cookie format: `<base64url_payload>.<hmac_hex>`
 *   • The WebSocket upgrade handler reads this cookie to apply branch/commit
 *     restrictions without a DB round-trip on every connection.
 *
 * Note: `node:` import prefix is the established convention in this codebase
 * (see lib/server/invitationTokens.ts) and requires Node.js ≥ 14.18.
 *
 * Secret resolution order: SHARE_LINK_SECRET → INVITATION_SECRET → AUTH_SECRET
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// ─── Secret ───────────────────────────────────────────────────────────────────

function getSecret(): string {
  const s =
    process.env.SHARE_LINK_SECRET ??
    process.env.INVITATION_SECRET ??
    process.env.AUTH_SECRET;
  if (!s) {
    throw new Error(
      "No secret configured for share-link signing. Set SHARE_LINK_SECRET, INVITATION_SECRET, or AUTH_SECRET.",
    );
  }
  return s;
}

// ─── Token helpers ────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random share-link token.
 * Returns a 64-character hex string (32 random bytes).
 */
export function generateShareLinkToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Compute an HMAC-SHA256 signature over (token:roomId:scope:expiresAt).
 * `expiresAt` is either a unix-ms timestamp or `null` (no expiry → "never").
 * Returns a 64-character hex string.
 */
export function signShareLinkToken(
  token: string,
  roomId: string,
  scope: string,
  expiresAt: number | null,
): string {
  return createHmac("sha256", getSecret())
    .update(`${token}:${roomId}:${scope}:${expiresAt ?? "never"}`)
    .digest("hex");
}

/**
 * Verify an HMAC signature using constant-time comparison (P054).
 * Returns `false` if the signature is wrong or lengths differ.
 */
export function verifyShareLinkSignature(
  token: string,
  roomId: string,
  scope: string,
  expiresAt: number | null,
  signature: string,
): boolean {
  const expected = signShareLinkToken(token, roomId, scope, expiresAt);
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}

// ─── Scope cookie helpers ─────────────────────────────────────────────────────

/** Payload stored in the `sketchgit_share_scope` cookie. */
export interface ScopeCookiePayload {
  linkId: string;
  roomId: string;
  scope: "ROOM" | "BRANCH" | "COMMIT";
  branches: string[];
  commitSha: string | null;
  permission: "ADMIN" | "BRANCH_CREATE" | "WRITE" | "VIEW";
  /** Expiry unix-ms (short-lived: set to ~15 min from issue to limit replay). */
  exp: number;
}

const SCOPE_COOKIE_NAME = "sketchgit_share_scope";
/** TTL for the scope cookie: 15 minutes (enough to complete a WebSocket upgrade). */
const SCOPE_COOKIE_TTL_MS = 15 * 60 * 1000;

export { SCOPE_COOKIE_NAME, SCOPE_COOKIE_TTL_MS };

/** Encode and HMAC-sign a scope cookie payload. Returns the cookie value string. */
export function signScopeCookie(payload: ScopeCookiePayload): string {
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const hmac = createHmac("sha256", getSecret()).update(json).digest("hex");
  return `${json}.${hmac}`;
}

/**
 * Parse and verify a scope cookie value.
 * Returns the `ScopeCookiePayload` if valid and not expired, otherwise `null`.
 */
export function verifyScopeCookie(value: string): ScopeCookiePayload | null {
  const dotIdx = value.lastIndexOf(".");
  if (dotIdx < 1) return null;
  const json = value.slice(0, dotIdx);
  const receivedHmac = value.slice(dotIdx + 1);
  // Constant-time HMAC comparison
  const expected = createHmac("sha256", getSecret()).update(json).digest("hex");
  if (expected.length !== receivedHmac.length) return null;
  try {
    if (
      !timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(receivedHmac, "hex"),
      )
    ) {
      return null;
    }
  } catch {
    return null;
  }
  // Decode and parse JSON
  let payload: ScopeCookiePayload;
  try {
    payload = JSON.parse(
      Buffer.from(json, "base64url").toString("utf8"),
    ) as ScopeCookiePayload;
  } catch {
    return null;
  }
  // Check cookie expiry
  if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
  return payload;
}

// ─── Cookie parser ────────────────────────────────────────────────────────────

/**
 * Parse a raw `Cookie` HTTP header string into a key→value map.
 * Used by the WebSocket upgrade handler to read the scope cookie.
 *
 * @param cookieHeader - value of `req.headers['cookie']`
 */
export function parseCookies(cookieHeader: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!cookieHeader) return map;
  for (const part of cookieHeader.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx < 1) continue;
    const name = part.slice(0, eqIdx).trim();
    const value = part.slice(eqIdx + 1).trim();
    if (name) map.set(name, decodeURIComponent(value));
  }
  return map;
}

// ─── Permission → MemberRole mapper ──────────────────────────────────────────

/** Map a `SharePermission` string to the corresponding `MemberRole` string. */
export function mapPermissionToRole(
  permission: "ADMIN" | "BRANCH_CREATE" | "WRITE" | "VIEW",
): "OWNER" | "EDITOR" | "COMMITTER" | "VIEWER" {
  switch (permission) {
    case "ADMIN":         return "OWNER";
    case "BRANCH_CREATE": return "EDITOR";
    case "WRITE":         return "COMMITTER";
    case "VIEW":          return "VIEWER";
  }
}
