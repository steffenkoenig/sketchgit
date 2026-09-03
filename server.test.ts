import { describe, it, expect } from 'vitest';
import { safeBranchName } from './server.js';

describe('safeBranchName', () => {
  it('returns "main" for null or undefined', () => {
    expect(safeBranchName(null)).toBe('main');
    expect(safeBranchName(undefined)).toBe('main');
  });

  it('returns "main" for empty or whitespace-only strings', () => {
    expect(safeBranchName('')).toBe('main');
    expect(safeBranchName('   ')).toBe('main');
  });

  it('preserves valid characters (letters, digits, /, _, -, .)', () => {
    expect(safeBranchName('feature/my-branch_name.123')).toBe('feature/my-branch_name.123');
    expect(safeBranchName('aZ09/_-.')).toBe('aZ09/_-.');
  });

  it('replaces invalid characters with hyphens', () => {
    expect(safeBranchName('feature/my branch!')).toBe('feature/my-branch-');
    expect(safeBranchName('hello@world#')).toBe('hello-world-');
    expect(safeBranchName('test*branch')).toBe('test-branch');
  });

  it('trims leading and trailing whitespace', () => {
    expect(safeBranchName('  feature/branch  ')).toBe('feature/branch');
  });

  it('truncates strings exceeding 100 characters', () => {
    const longString = 'a'.repeat(150);
    const result = safeBranchName(longString);
    expect(result).toHaveLength(100);
    expect(result).toBe('a'.repeat(100));
  });

  it('trims whitespace before truncating', () => {
    const longString = '   ' + 'a'.repeat(150);
    const result = safeBranchName(longString);
    expect(result).toHaveLength(100);
    expect(result).toBe('a'.repeat(100));
  });
});
