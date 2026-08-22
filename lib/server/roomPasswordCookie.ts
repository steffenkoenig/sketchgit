/**
 * lib/server/roomPasswordCookie.ts
 *
 * P093 – Signed cookie proving a client has already entered the correct
 * password for one or more rooms this session, so they aren't re-prompted
 * on every request/reconnect. Mirrors P091's shareLinkTokens.ts scope-cookie
 * pattern (HMAC-signed `<base64url_payload>.<hmac_hex>`, constant-time
 * verify) but the payload is a map of `{ roomId: expiresAtMs }` rather than
 * a single scope, so unlocking room A in one tab doesn't clobber an
 * already-unlocked room B in another tab — the proposal's explicit
 * multi-room-session requirement. One cookie (not one per room) keeps the
 * request header size bounded regardless of how many rooms a user unlocks.
 *
 * Secret resolution mirrors shareLinkTokens.ts: SHARE_LINK_SECRET →
 * INVITATION_SECRET → AUTH_SECRET.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "sketchgit_room_unlock";
/** How long an unlock lasts before the password must be re-entered. */
const UNLOCK_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
/**
 * Cap on concurrently-unlocked rooms tracked in one cookie. Prevents
 * unbounded cookie growth for a user who unlocks many rooms over time;
 * the oldest entries are evicted first. 20 rooms is generous for a
 * realistic session while keeping the cookie well under typical
 * ~4KB per-cookie browser limits.
 */
const MAX_UNLOCKED_ROOMS = 20;

export { COOKIE_NAME as ROOM_UNLOCK_COOKIE_NAME, UNLOCK_TTL_MS as ROOM_UNLOCK_TTL_MS };

interface RoomUnlockPayload {
  /** roomId -> expiry (unix ms) */
  rooms: Record<string, number>;
}

function getSecret(): string {
  const s =
    process.env.SHARE_LINK_SECRET ??
    process.env.INVITATION_SECRET ??
    process.env.AUTH_SECRET;
  if (!s) {
    throw new Error(
      "No secret configured for room-unlock cookie signing. Set SHARE_LINK_SECRET, INVITATION_SECRET, or AUTH_SECRET.",
    );
  }
  return s;
}

function sign(payload: RoomUnlockPayload): string {
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const hmac = createHmac("sha256", getSecret()).update(json).digest("hex");
  return `${json}.${hmac}`;
}

/** Parses and HMAC-verifies a cookie value. Returns null if missing, tampered, or malformed. */
function parse(value: string | undefined): RoomUnlockPayload | null {
  if (!value) return null;
  const dotIdx = value.lastIndexOf(".");
  if (dotIdx < 1) return null;
  const json = value.slice(0, dotIdx);
  const receivedHmac = value.slice(dotIdx + 1);
  const expected = createHmac("sha256", getSecret()).update(json).digest("hex");
  if (expected.length !== receivedHmac.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(receivedHmac, "hex"))) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(json, "base64url").toString("utf8")) as RoomUnlockPayload;
    if (!payload || typeof payload.rooms !== "object" || payload.rooms === null) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * True when the given cookie value grants unexpired access to `roomId`.
 * Used by both the WS upgrade handler and REST route access checks.
 */
export function hasValidRoomUnlock(cookieValue: string | undefined, roomId: string): boolean {
  const payload = parse(cookieValue);
  if (!payload) return false;
  const exp = payload.rooms[roomId];
  return typeof exp === "number" && Date.now() < exp;
}

/**
 * Produces a new signed cookie value that grants access to `roomId`,
 * merged with any still-valid unlocks already present in `existingCookieValue`
 * (so unlocking a second room doesn't lose access to the first). Expired
 * entries are dropped; if the merged set exceeds MAX_UNLOCKED_ROOMS, the
 * oldest-expiring entries are evicted first.
 */
export function grantRoomUnlock(existingCookieValue: string | undefined, roomId: string): string {
  const now = Date.now();
  const existing = parse(existingCookieValue);
  const rooms: Record<string, number> = {};

  if (existing) {
    for (const [id, exp] of Object.entries(existing.rooms)) {
      if (exp > now) rooms[id] = exp;
    }
  }

  rooms[roomId] = now + UNLOCK_TTL_MS;

  const entries = Object.entries(rooms).sort((a, b) => b[1] - a[1]); // newest-expiring first
  const trimmed = Object.fromEntries(entries.slice(0, MAX_UNLOCKED_ROOMS));

  return sign({ rooms: trimmed });
}
