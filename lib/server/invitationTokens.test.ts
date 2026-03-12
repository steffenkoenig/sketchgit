/**
 * Tests for lib/server/invitationTokens.ts (P066)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateInvitationToken,
  signInvitationToken,
  verifyInvitationSignature,
} from './invitationTokens';

beforeAll(() => {
  // signInvitationToken/verifyInvitationSignature require AUTH_SECRET to be set.
  process.env.AUTH_SECRET = 'test-auth-secret-that-is-at-least-32-chars';
});

describe('invitationTokens (P066)', () => {
  it('generateInvitationToken returns a 64-character hex string', () => {
    const token = generateInvitationToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it('generates a unique token each time', () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a).not.toBe(b);
  });

  it('verifyInvitationSignature returns true for a valid signature', () => {
    const token = generateInvitationToken();
    const roomId = 'room-abc123';
    const expiresAt = Date.now() + 3600_000;
    const sig = signInvitationToken(token, roomId, expiresAt);
    expect(verifyInvitationSignature(token, roomId, expiresAt, sig)).toBe(true);
  });

  it('verifyInvitationSignature returns false for a tampered token', () => {
    const token = generateInvitationToken();
    const roomId = 'room-abc123';
    const expiresAt = Date.now() + 3600_000;
    const sig = signInvitationToken(token, roomId, expiresAt);
    // Change one character of the token
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    expect(verifyInvitationSignature(tampered, roomId, expiresAt, sig)).toBe(false);
  });

  it('verifyInvitationSignature returns false for a tampered roomId', () => {
    const token = generateInvitationToken();
    const roomId = 'room-abc123';
    const expiresAt = Date.now() + 3600_000;
    const sig = signInvitationToken(token, roomId, expiresAt);
    expect(verifyInvitationSignature(token, 'room-other', expiresAt, sig)).toBe(false);
  });

  it('verifyInvitationSignature returns false for a tampered expiresAt', () => {
    const token = generateInvitationToken();
    const roomId = 'room-abc123';
    const expiresAt = Date.now() + 3600_000;
    const sig = signInvitationToken(token, roomId, expiresAt);
    expect(verifyInvitationSignature(token, roomId, expiresAt + 1, sig)).toBe(false);
  });

  it('verifyInvitationSignature returns false for an empty signature', () => {
    const token = generateInvitationToken();
    const roomId = 'room-abc123';
    const expiresAt = Date.now() + 3600_000;
    expect(verifyInvitationSignature(token, roomId, expiresAt, '')).toBe(false);
  });
});
