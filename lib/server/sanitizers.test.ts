/**
 * Unit tests for P047 sanitizer helpers (safeBranchName / safeCommitMessage).
 *
 * The helpers are module-level functions in server.ts which is not importable
 * in unit tests. We inline equivalent implementations to verify the logic.
 */
import { describe, it, expect } from 'vitest';

// ─── Inline implementations (mirror server.ts) ────────────────────────────────
function safeBranchName(value: string | null | undefined): string {
  const trimmed = (value ?? 'main').trim().slice(0, 100);
  return trimmed.replace(/[^a-zA-Z0-9/_\-.]/g, '-') || 'main';
}

function safeCommitMessage(value: string | null | undefined): string {
  return (value ?? '').trim().slice(0, 500) || '(no message)';
}

describe('safeBranchName (P047)', () => {
  it('allows standard git branch characters', () => {
    expect(safeBranchName('feature/my-branch_1.0')).toBe('feature/my-branch_1.0');
  });

  it('replaces spaces with hyphens', () => {
    expect(safeBranchName('branch with spaces')).toBe('branch-with-spaces');
  });

  it('replaces NUL bytes with hyphens', () => {
    expect(safeBranchName('branch\x00nul')).toBe('branch-nul');
  });

  it('replaces semicolons with hyphens', () => {
    expect(safeBranchName('branch;injection')).toBe('branch-injection');
  });

  it('slices to 100 characters', () => {
    const long = 'a'.repeat(150);
    expect(safeBranchName(long).length).toBe(100);
  });

  it('returns "main" for null', () => {
    expect(safeBranchName(null)).toBe('main');
  });

  it('returns "main" for empty string', () => {
    expect(safeBranchName('')).toBe('main');
  });

  it('returns "main" for whitespace-only string', () => {
    expect(safeBranchName('   ')).toBe('main');
  });

  it('allows dots in branch names', () => {
    expect(safeBranchName('release-1.2.3')).toBe('release-1.2.3');
  });
});

describe('safeCommitMessage (P047)', () => {
  it('returns the message unchanged for valid input', () => {
    expect(safeCommitMessage('Add new feature')).toBe('Add new feature');
  });

  it('trims leading and trailing whitespace', () => {
    expect(safeCommitMessage('  hello  ')).toBe('hello');
  });

  it('caps at 500 characters', () => {
    const long = 'x'.repeat(600);
    expect(safeCommitMessage(long).length).toBe(500);
  });

  it('returns "(no message)" for null', () => {
    expect(safeCommitMessage(null)).toBe('(no message)');
  });

  it('returns "(no message)" for empty string', () => {
    expect(safeCommitMessage('')).toBe('(no message)');
  });

  it('returns "(no message)" for whitespace-only string', () => {
    expect(safeCommitMessage('   ')).toBe('(no message)');
  });
});
