/**
 * Tests for P057 – validateCommitMessage server-side validation.
 *
 * Uses the exported function directly (pure function, no DB mocking required).
 */
import { describe, it, expect, vi } from 'vitest';
import { validateCommitMessage, MAX_CANVAS_CHARS } from './commitValidation';

const validSha = 'abcdef01';
const validCanvas = JSON.stringify({ version: '5', objects: [] });

describe('MAX_CANVAS_CHARS', () => {
  it('is exactly 2MB (2 * 1024 * 1024 characters)', () => {
    expect(MAX_CANVAS_CHARS).toBe(2 * 1024 * 1024);
  });
});

describe('validateCommitMessage()', () => {
  // ── SHA validation ─────────────────────────────────────────────────────────

  it('accepts a valid 8-char hex SHA', () => {
    const log = vi.fn();
    expect(validateCommitMessage(validSha, { canvas: validCanvas }, log)).toBe(true);
    expect(log).not.toHaveBeenCalled();
  });

  it('accepts a 16-char hex SHA (typical generateSha output)', () => {
    const log = vi.fn();
    expect(validateCommitMessage('abcdef0123456789', { canvas: validCanvas }, log)).toBe(true);
  });

  it('accepts a 64-char hex SHA (max)', () => {
    const sha64 = 'a'.repeat(64);
    const log = vi.fn();
    expect(validateCommitMessage(sha64, { canvas: validCanvas }, log)).toBe(true);
  });

  it('rejects a SHA with uppercase letters', () => {
    const log = vi.fn();
    expect(validateCommitMessage('ABCDEF01', { canvas: validCanvas }, log)).toBe(false);
    expect(log).toHaveBeenCalled();
  });

  it('rejects a SHA that is too short (< 8 chars)', () => {
    const log = vi.fn();
    expect(validateCommitMessage('abcdef0', { canvas: validCanvas }, log)).toBe(false);
  });

  it('rejects a SHA that is too long (> 64 chars)', () => {
    const log = vi.fn();
    expect(validateCommitMessage('a'.repeat(65), { canvas: validCanvas }, log)).toBe(false);
  });

  it('rejects a non-string SHA', () => {
    const log = vi.fn();
    expect(validateCommitMessage(null, { canvas: validCanvas }, log)).toBe(false);
    expect(validateCommitMessage(12345, { canvas: validCanvas }, log)).toBe(false);
  });

  it('rejects a SHA containing non-hex characters', () => {
    const log = vi.fn();
    expect(validateCommitMessage('xyz01234', { canvas: validCanvas }, log)).toBe(false);
  });

  // ── Commit object validation ───────────────────────────────────────────────

  it('rejects a null commit', () => {
    const log = vi.fn();
    expect(validateCommitMessage(validSha, null, log)).toBe(false);
  });

  it('rejects a non-object commit', () => {
    const log = vi.fn();
    expect(validateCommitMessage(validSha, 'string', log)).toBe(false);
  });

  // ── Canvas validation ──────────────────────────────────────────────────────

  it('rejects a commit without a canvas string', () => {
    const log = vi.fn();
    expect(validateCommitMessage(validSha, { canvas: 42 }, log)).toBe(false);
  });

  it('rejects a commit with a missing canvas', () => {
    const log = vi.fn();
    expect(validateCommitMessage(validSha, {}, log)).toBe(false);
  });

  it('rejects a canvas that exceeds MAX_CANVAS_CHARS', () => {
    const log = vi.fn();
    // MAX_CANVAS_CHARS + 1 char limit, so we construct a JSON string that is exactly MAX_CANVAS_CHARS + 1 chars long
    // A JSON string with double quotes at the ends uses 2 chars, so the inner content is MAX_CANVAS_CHARS - 1
    const oversized = '"' + 'x'.repeat(MAX_CANVAS_CHARS - 1) + '"';
    expect(oversized.length).toBe(MAX_CANVAS_CHARS + 1);
    expect(validateCommitMessage(validSha, { canvas: oversized }, log)).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('canvas too large'));
  });

  it('rejects a canvas that is not valid JSON', () => {
    const log = vi.fn();
    expect(validateCommitMessage(validSha, { canvas: '{not json' }, log)).toBe(false);
    expect(log).toHaveBeenCalledWith('canvas is not valid JSON');
  });

  it('accepts a canvas that is exactly MAX_CANVAS_CHARS', () => {
    const log = vi.fn();
    // A JSON string exactly at the limit
    const atLimit = '"' + 'x'.repeat(MAX_CANVAS_CHARS - 2) + '"';
    expect(atLimit.length).toBe(MAX_CANVAS_CHARS);
    expect(validateCommitMessage(validSha, { canvas: atLimit }, log)).toBe(true);
  });

  // ── Parents validation ─────────────────────────────────────────────────────

  it('accepts a commit with no parents field', () => {
    const log = vi.fn();
    expect(validateCommitMessage(validSha, { canvas: validCanvas }, log)).toBe(true);
  });

  it('accepts a commit with 1 valid parent (regular commit)', () => {
    const log = vi.fn();
    expect(validateCommitMessage(validSha, { canvas: validCanvas, parents: ['abcdef01'] }, log)).toBe(true);
  });

  it('accepts a commit with 2 valid parents (merge commit)', () => {
    const log = vi.fn();
    expect(validateCommitMessage(validSha, { canvas: validCanvas, parents: ['abcdef01', '12345678'] }, log)).toBe(true);
  });

  it('rejects a commit with 3 or more parents', () => {
    const log = vi.fn();
    expect(validateCommitMessage(validSha, {
      canvas: validCanvas,
      parents: ['abcdef01', '12345678', 'deadbeef'],
    }, log)).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('too many parents'));
  });

  it('rejects a non-array parents field', () => {
    const log = vi.fn();
    expect(validateCommitMessage(validSha, { canvas: validCanvas, parents: 'abcdef01' }, log)).toBe(false);
  });

  it('rejects parents array containing an invalid SHA', () => {
    const log = vi.fn();
    expect(validateCommitMessage(validSha, {
      canvas: validCanvas,
      parents: ['abcdef01', 'invalid!!'],
    }, log)).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('invalid parent sha'));
  });

  it('rejects parents array containing a non-string element', () => {
    const log = vi.fn();
    expect(validateCommitMessage(validSha, {
      canvas: validCanvas,
      parents: ['abcdef01', 123],
    }, log)).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('invalid parent sha'));
  });
});
