import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  safeBranchName,
  beginWrite,
  endWrite,
  _test_waitForDrain,
  _test_getInFlightWrites,
  _test_getDrainWaiters,
} from './server.js';

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

describe('server write draining', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset state before each test
    while (_test_getInFlightWrites() > 0) {
      endWrite();
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should increment and decrement inFlightWrites', () => {
    expect(_test_getInFlightWrites()).toBe(0);
    beginWrite();
    expect(_test_getInFlightWrites()).toBe(1);
    beginWrite();
    expect(_test_getInFlightWrites()).toBe(2);
    endWrite();
    expect(_test_getInFlightWrites()).toBe(1);
    endWrite();
    expect(_test_getInFlightWrites()).toBe(0);
  });

  it('should resolve waitForDrain immediately if no in-flight writes', async () => {
    let resolved = false;
    void _test_waitForDrain(1000).then(() => { resolved = true; });
    await vi.runAllTimersAsync();
    expect(resolved).toBe(true);
  });

  it('should wait for in-flight writes to finish before resolving', async () => {
    beginWrite();

    let resolved = false;
    const p = _test_waitForDrain(1000).then(() => { resolved = true; });

    expect(_test_getDrainWaiters().length).toBe(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(resolved).toBe(false); // Still waiting

    endWrite(); // Drops inFlightWrites to 0, which should resolve the waiter

    await p;
    expect(resolved).toBe(true);
    expect(_test_getDrainWaiters().length).toBe(0);
  });

  it('should timeout and resolve if writes do not finish in time', async () => {
    beginWrite();
    let resolved = false;

    const p = _test_waitForDrain(1000);
    void p.then(() => { resolved = true; });

    expect(_test_getDrainWaiters().length).toBe(1);

    vi.runAllTimers();
    await p;

    expect(resolved).toBe(true);
    // Because of the bug fix, the timer callback should correctly find and splice the waiter
    expect(_test_getDrainWaiters().length).toBe(0);

    endWrite(); // reset for next tests if any
  });

  it('should not let inFlightWrites drop below zero', () => {
    expect(_test_getInFlightWrites()).toBe(0);
    endWrite();
    expect(_test_getInFlightWrites()).toBe(0);
  });
});
