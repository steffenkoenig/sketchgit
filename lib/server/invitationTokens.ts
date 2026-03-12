/**
 * lib/server/invitationTokens.ts
 *
 * P066 – Cryptographic helpers for room invitation tokens.
 *
 * Strategy: the token stored in the database is a 32-byte random value
 * (hex-encoded, 64 chars). It is unguessable by itself, so a DB lookup is
 * sufficient to validate it.
 *
 * In addition, the URL exposed to the invitee embeds an HMAC-SHA256 signature
 * over (token + roomId + expiresAt). This allows the server to reject obviously
 * tampered URLs cheaply — before hitting the database — and uses the
 * `timingSafeEqual` comparison from P054 to prevent timing attacks.
 *
 * Secret: the INVITATION_SECRET env var, falling back to AUTH_SECRET.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function getSecret(): string {
  const secret = process.env.INVITATION_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("Neither INVITATION_SECRET nor AUTH_SECRET is configured. Cannot sign invitation tokens.");
  }
  return secret;
}

/**
 * Generate a cryptographically random invitation token.
 * Returns a 64-character hex string (32 random bytes).
 */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Compute an HMAC-SHA256 signature over (token:roomId:expiresAt).
 * Returns a 64-character hex string.
 */
export function signInvitationToken(
  token: string,
  roomId: string,
  expiresAt: number,
): string {
  return createHmac("sha256", getSecret())
    .update(`${token}:${roomId}:${expiresAt}`)
    .digest("hex");
}

/**
 * Verify an HMAC signature using constant-time comparison (P054).
 * Returns `false` if the signature is wrong or if the secret is empty.
 */
export function verifyInvitationSignature(
  token: string,
  roomId: string,
  expiresAt: number,
  signature: string,
): boolean {
  const expected = signInvitationToken(token, roomId, expiresAt);
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}
