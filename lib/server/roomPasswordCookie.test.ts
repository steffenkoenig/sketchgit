/**
 * Tests for lib/server/roomPasswordCookie.ts (P093)
 */
import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { hasValidRoomUnlock, grantRoomUnlock, ROOM_UNLOCK_TTL_MS } from './roomPasswordCookie';

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-auth-secret-that-is-at-least-32-chars';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('hasValidRoomUnlock', () => {
  it('returns false for an undefined cookie value', () => {
    expect(hasValidRoomUnlock(undefined, 'room-1')).toBe(false);
  });

  it('returns false for a malformed cookie value', () => {
    expect(hasValidRoomUnlock('not-a-valid-cookie', 'room-1')).toBe(false);
  });

  it('returns false for a tampered signature', () => {
    const cookie = grantRoomUnlock(undefined, 'room-1');
    const [json] = cookie.split('.');
    const tampered = `${json}.${'0'.repeat(64)}`;
    expect(hasValidRoomUnlock(tampered, 'room-1')).toBe(false);
  });

  it('returns false for a tampered payload (roomId swapped in)', () => {
    const cookie = grantRoomUnlock(undefined, 'room-1');
    const [json, hmac] = cookie.split('.');
    const payload = JSON.parse(Buffer.from(json, 'base64url').toString('utf8'));
    payload.rooms['room-2'] = payload.rooms['room-1'];
    const forgedJson = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const forged = `${forgedJson}.${hmac}`;
    expect(hasValidRoomUnlock(forged, 'room-2')).toBe(false);
  });

  it('returns true for a freshly granted unlock of the requested room', () => {
    const cookie = grantRoomUnlock(undefined, 'room-1');
    expect(hasValidRoomUnlock(cookie, 'room-1')).toBe(true);
  });

  it('returns false for a room that was never unlocked', () => {
    const cookie = grantRoomUnlock(undefined, 'room-1');
    expect(hasValidRoomUnlock(cookie, 'room-2')).toBe(false);
  });

  it('returns false once the unlock has expired', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const cookie = grantRoomUnlock(undefined, 'room-1');
    vi.setSystemTime(ROOM_UNLOCK_TTL_MS + 1);
    expect(hasValidRoomUnlock(cookie, 'room-1')).toBe(false);
  });

  it('returns true just before expiry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const cookie = grantRoomUnlock(undefined, 'room-1');
    vi.setSystemTime(ROOM_UNLOCK_TTL_MS - 1);
    expect(hasValidRoomUnlock(cookie, 'room-1')).toBe(true);
  });
});

describe('grantRoomUnlock — multi-room sessions', () => {
  it('unlocking a second room preserves access to the first (multi-tab requirement)', () => {
    const cookie1 = grantRoomUnlock(undefined, 'room-1');
    const cookie2 = grantRoomUnlock(cookie1, 'room-2');
    expect(hasValidRoomUnlock(cookie2, 'room-1')).toBe(true);
    expect(hasValidRoomUnlock(cookie2, 'room-2')).toBe(true);
  });

  it('re-unlocking an already-unlocked room refreshes its expiry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const cookie1 = grantRoomUnlock(undefined, 'room-1');
    vi.setSystemTime(ROOM_UNLOCK_TTL_MS - 1000);
    const cookie2 = grantRoomUnlock(cookie1, 'room-1');
    vi.setSystemTime(ROOM_UNLOCK_TTL_MS + 500); // past the FIRST grant's expiry
    expect(hasValidRoomUnlock(cookie2, 'room-1')).toBe(true); // but not the refreshed one
  });

  it('drops expired rooms when merging in a new unlock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const cookie1 = grantRoomUnlock(undefined, 'room-1');
    vi.setSystemTime(ROOM_UNLOCK_TTL_MS + 1);
    const cookie2 = grantRoomUnlock(cookie1, 'room-2');
    expect(hasValidRoomUnlock(cookie2, 'room-1')).toBe(false);
    expect(hasValidRoomUnlock(cookie2, 'room-2')).toBe(true);
  });

  it('caps the number of tracked rooms, evicting the soonest-to-expire first', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    let cookie: string | undefined;
    // Grant unlocks with strictly increasing expiry by advancing the clock
    // between each grant, so eviction order is deterministic.
    for (let i = 0; i < 25; i++) {
      cookie = grantRoomUnlock(cookie, `room-${i}`);
      vi.setSystemTime(i + 1);
    }
    // The earliest-granted rooms (shortest remaining TTL relative to the
    // last grant) should have been evicted once the cap was exceeded.
    expect(hasValidRoomUnlock(cookie, 'room-0')).toBe(false);
    expect(hasValidRoomUnlock(cookie, 'room-24')).toBe(true);
  });

  it('ignores an undefined existing cookie (first-ever unlock)', () => {
    const cookie = grantRoomUnlock(undefined, 'room-1');
    expect(hasValidRoomUnlock(cookie, 'room-1')).toBe(true);
  });

  it('ignores a garbage existing cookie value rather than throwing', () => {
    const cookie = grantRoomUnlock('garbage-not-a-cookie', 'room-1');
    expect(hasValidRoomUnlock(cookie, 'room-1')).toBe(true);
  });
});
