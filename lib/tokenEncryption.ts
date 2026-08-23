/**
 * tokenEncryption – GAP-014. Application-level AES-256-GCM envelope
 * encryption for OAuth tokens stored at rest in the `Account` table
 * (NextAuth's Prisma adapter otherwise persists GitHub's access_token /
 * refresh_token / id_token as plaintext — a database dump or admin-access
 * breach would hand out immediately-usable GitHub credentials).
 *
 * Ciphertext format: `iv:ciphertext:authTag`, each segment base64.
 *
 * Lives at `lib/` root (not `lib/server/`) — like lib/passwordHashing.ts —
 * because both lib/db/userRepository.ts (decrypting a GitHub token for
 * revocation) and lib/server/encryptedAuthAdapter.ts need it, and lib/db/
 * may never import from lib/server/.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

/**
 * Resolves the 32-byte AES-256 key. Prefers an explicit
 * `OAUTH_TOKEN_ENCRYPTION_KEY` (validated to decode to exactly 32 bytes by
 * lib/env.ts); falls back to a key derived from `AUTH_SECRET` via SHA-256 so
 * tokens are encrypted by default without requiring a new required env var —
 * the same "derive, don't force a new secret" pattern
 * lib/server/subscriptionTokens.ts's AUTH_SECRET fallback uses.
 */
function resolveKey(): Buffer {
  const explicit = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (explicit) return Buffer.from(explicit, "base64");
  return createHash("sha256").update(process.env.AUTH_SECRET ?? "").digest();
}

export function encryptToken(plaintext: string): string {
  const key = resolveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), encrypted.toString("base64"), authTag.toString("base64")].join(":");
}

/** True when `value` looks like this module's `iv:ciphertext:authTag` format. */
export function isEncryptedToken(value: string): boolean {
  const parts = value.split(":");
  return parts.length === 3 && parts.every((p) => p.length > 0 && /^[A-Za-z0-9+/]+=*$/.test(p));
}

export function decryptToken(value: string): string {
  const [ivB64, encB64, tagB64] = value.split(":");
  const key = resolveKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return decipher.update(Buffer.from(encB64, "base64")).toString("utf8") + decipher.final("utf8");
}

/**
 * Decrypt-on-read helper that never throws: returns the input unchanged
 * when it isn't in the encrypted format (a legacy plaintext row from before
 * this module shipped, or a null/empty value) or when decryption fails (e.g.
 * the encryption key was rotated) — a stored OAuth token being temporarily
 * unusable should never turn into a 500 for unrelated app code.
 */
export function decryptTokenSafe<T extends string | null | undefined>(value: T): T {
  if (!value) return value;
  if (!isEncryptedToken(value)) return value;
  try {
    return decryptToken(value) as T;
  } catch {
    return value;
  }
}
