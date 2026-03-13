/**
 * Tests for lib/server/shareLinkTokens.ts (P091)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateShareLinkToken,
  signShareLinkToken,
  verifyShareLinkSignature,
  signScopeCookie,
  verifyScopeCookie,
  parseCookies,
  mapPermissionToRole,
  SCOPE_COOKIE_TTL_MS,
  type ScopeCookiePayload,
} from './shareLinkTokens';

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-auth-secret-that-is-at-least-32-chars';
});

// ─── generateShareLinkToken ───────────────────────────────────────────────────

describe('generateShareLinkToken', () => {
  it('returns a 64-character hex string', () => {
    const token = generateShareLinkToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it('generates a unique token each time', () => {
    expect(generateShareLinkToken()).not.toBe(generateShareLinkToken());
  });
});

// ─── signShareLinkToken / verifyShareLinkSignature ────────────────────────────

describe('verifyShareLinkSignature', () => {
  const token = 'a'.repeat(64);
  const roomId = 'room-abc123';
  const scope = 'ROOM';
  const expiresAt = Date.now() + 3_600_000;

  it('returns true for a valid signature', () => {
    const sig = signShareLinkToken(token, roomId, scope, expiresAt);
    expect(verifyShareLinkSignature(token, roomId, scope, expiresAt, sig)).toBe(true);
  });

  it('returns true for a null (no-expiry) expiresAt', () => {
    const sig = signShareLinkToken(token, roomId, scope, null);
    expect(verifyShareLinkSignature(token, roomId, scope, null, sig)).toBe(true);
  });

  it('returns false for a tampered token', () => {
    const sig = signShareLinkToken(token, roomId, scope, expiresAt);
    const bad = 'b'.repeat(64);
    expect(verifyShareLinkSignature(bad, roomId, scope, expiresAt, sig)).toBe(false);
  });

  it('returns false for a tampered roomId', () => {
    const sig = signShareLinkToken(token, roomId, scope, expiresAt);
    expect(verifyShareLinkSignature(token, 'room-other', scope, expiresAt, sig)).toBe(false);
  });

  it('returns false for a tampered scope', () => {
    const sig = signShareLinkToken(token, roomId, scope, expiresAt);
    expect(verifyShareLinkSignature(token, roomId, 'BRANCH', expiresAt, sig)).toBe(false);
  });

  it('returns false for a tampered expiresAt', () => {
    const sig = signShareLinkToken(token, roomId, scope, expiresAt);
    expect(verifyShareLinkSignature(token, roomId, scope, expiresAt + 1, sig)).toBe(false);
  });

  it('returns false for an empty signature', () => {
    expect(verifyShareLinkSignature(token, roomId, scope, expiresAt, '')).toBe(false);
  });
});

// ─── signScopeCookie / verifyScopeCookie ──────────────────────────────────────

describe('scope cookie', () => {
  const payload: ScopeCookiePayload = {
    linkId: 'link_1',
    roomId: 'room-xyz',
    scope: 'BRANCH',
    branches: ['feature/x', 'main'],
    commitSha: null,
    permission: 'WRITE',
    exp: Date.now() + SCOPE_COOKIE_TTL_MS,
  };

  it('round-trips a valid payload', () => {
    const value = signScopeCookie(payload);
    const result = verifyScopeCookie(value);
    expect(result).not.toBeNull();
    expect(result?.linkId).toBe(payload.linkId);
    expect(result?.scope).toBe('BRANCH');
    expect(result?.branches).toEqual(['feature/x', 'main']);
    expect(result?.permission).toBe('WRITE');
  });

  it('returns null for a tampered payload', () => {
    const value = signScopeCookie(payload);
    const dotIdx = value.lastIndexOf('.');
    const tampered = 'Z' + value.slice(1, dotIdx) + '.' + value.slice(dotIdx + 1);
    expect(verifyScopeCookie(tampered)).toBeNull();
  });

  it('returns null for a tampered HMAC', () => {
    const value = signScopeCookie(payload);
    const dotIdx = value.lastIndexOf('.');
    const tampered = value.slice(0, dotIdx + 1) + 'Z'.repeat(64);
    expect(verifyScopeCookie(tampered)).toBeNull();
  });

  it('returns null for an expired cookie', () => {
    const expired = signScopeCookie({ ...payload, exp: Date.now() - 1 });
    expect(verifyScopeCookie(expired)).toBeNull();
  });

  it('returns null for malformed cookie value (no dot)', () => {
    expect(verifyScopeCookie('nodot')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(verifyScopeCookie('')).toBeNull();
  });
});

// ─── parseCookies ─────────────────────────────────────────────────────────────

describe('parseCookies', () => {
  it('returns empty map for undefined', () => {
    expect(parseCookies(undefined).size).toBe(0);
  });

  it('parses a single cookie', () => {
    const map = parseCookies('foo=bar');
    expect(map.get('foo')).toBe('bar');
  });

  it('parses multiple cookies', () => {
    const map = parseCookies('a=1; b=2; c=3');
    expect(map.get('a')).toBe('1');
    expect(map.get('b')).toBe('2');
    expect(map.get('c')).toBe('3');
  });

  it('URL-decodes cookie values', () => {
    const map = parseCookies('token=hello%20world');
    expect(map.get('token')).toBe('hello world');
  });

  it('ignores entries without equals sign', () => {
    const map = parseCookies('novalue; key=val');
    expect(map.has('novalue')).toBe(false);
    expect(map.get('key')).toBe('val');
  });
});

// ─── mapPermissionToRole ──────────────────────────────────────────────────────

describe('mapPermissionToRole', () => {
  it('maps ADMIN to OWNER', () => {
    expect(mapPermissionToRole('ADMIN')).toBe('OWNER');
  });
  it('maps BRANCH_CREATE to EDITOR', () => {
    expect(mapPermissionToRole('BRANCH_CREATE')).toBe('EDITOR');
  });
  it('maps WRITE to COMMITTER', () => {
    expect(mapPermissionToRole('WRITE')).toBe('COMMITTER');
  });
  it('maps VIEW to VIEWER', () => {
    expect(mapPermissionToRole('VIEW')).toBe('VIEWER');
  });
});
