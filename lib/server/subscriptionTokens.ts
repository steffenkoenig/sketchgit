/**
 * lib/server/subscriptionTokens.ts
 *
 * P094 – Stateless signed tokens for one-click email unsubscribe links.
 *
 * Unlike invitationTokens.ts/shareLinkTokens.ts (which store a random token
 * in the DB and use the signature only as a cheap pre-DB-lookup tamper
 * check), an unsubscribe link must work without the recipient being logged
 * in and without a DB round-trip to validate the link itself — the token
 * *is* the credential. It directly encodes the RoomSubscription id, HMAC-
 * signed so it can't be forged to unsubscribe someone else's subscription.
 *
 * Secret resolution mirrors the other token modules: a dedicated secret
 * falling back to AUTH_SECRET.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function getSecret(): string {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("Neither EMAIL_UNSUBSCRIBE_SECRET nor AUTH_SECRET is configured. Cannot sign unsubscribe tokens.");
  }
  return secret;
}

/**
 * Produces a URL-safe token encoding `subscriptionId`, signed so it can't
 * be tampered with. Format: `<base64url_subscriptionId>.<hmac_hex>`.
 */
export function signUnsubscribeToken(subscriptionId: string): string {
  const encoded = Buffer.from(subscriptionId, "utf8").toString("base64url");
  const hmac = createHmac("sha256", getSecret()).update(encoded).digest("hex");
  return `${encoded}.${hmac}`;
}

/**
 * Verifies and decodes an unsubscribe token. Returns the subscriptionId if
 * the signature is valid, or `null` if the token is malformed or tampered.
 */
export function verifyUnsubscribeToken(token: string): string | null {
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx < 1) return null;
  const encoded = token.slice(0, dotIdx);
  const receivedHmac = token.slice(dotIdx + 1);
  const expected = createHmac("sha256", getSecret()).update(encoded).digest("hex");
  if (expected.length !== receivedHmac.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(receivedHmac, "hex"))) return null;
  } catch {
    return null;
  }
  try {
    return Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
}
