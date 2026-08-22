/**
 * P090 – Admin API secret check.
 *
 * There's no site-wide admin role in this app's RBAC (RoomMembership roles
 * are per-room), so admin-only routes (feature flags today) are guarded by a
 * shared secret in the `x-admin-secret` header, checked against
 * ADMIN_API_SECRET. Constant-time comparison matches the pattern established
 * in lib/server/shareLinkTokens.ts (P054).
 */
import { timingSafeEqual } from "node:crypto";

/**
 * Returns true if `provided` matches ADMIN_API_SECRET. Always false if
 * ADMIN_API_SECRET is unset (admin routes are disabled, not open) or if
 * `provided` is missing.
 */
export function verifyAdminSecret(provided: string | null): boolean {
  const expected = process.env.ADMIN_API_SECRET;
  if (!expected || !provided) return false;
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}
