/**
 * Tests for P056 – nonce-based CSP helper.
 */
import { describe, it, expect } from 'vitest';
import { buildCsp } from './csp';

describe('buildCsp()', () => {
  it('includes nonce in script-src', () => {
    const csp = buildCsp('abc123nonce==', false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123nonce=='");
  });

  it('includes nonce in style-src', () => {
    const csp = buildCsp('abc123nonce==', false);
    expect(csp).toContain("style-src 'self' 'nonce-abc123nonce=='");
  });

  it('does NOT include unsafe-inline', () => {
    const csp = buildCsp('testnonce', false);
    expect(csp).not.toContain("'unsafe-inline'");
  });

  it('includes default-src self', () => {
    const csp = buildCsp('n', false);
    expect(csp).toContain("default-src 'self'");
  });

  it('includes connect-src for WebSocket', () => {
    const csp = buildCsp('n', false);
    expect(csp).toContain("connect-src 'self' ws: wss:");
  });

  it('does NOT add upgrade-insecure-requests in dev', () => {
    const csp = buildCsp('n', false);
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('adds upgrade-insecure-requests in production', () => {
    const csp = buildCsp('n', true);
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('uses different nonces for different requests (property test)', () => {
    const csp1 = buildCsp('nonce1', false);
    const csp2 = buildCsp('nonce2', false);
    expect(csp1).not.toBe(csp2);
    expect(csp1).toContain('nonce-nonce1');
    expect(csp2).toContain('nonce-nonce2');
  });
});
