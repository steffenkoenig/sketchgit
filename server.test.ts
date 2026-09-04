import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { beginWrite, endWrite, _test_waitForDrain, _test_getInFlightWrites, _test_getDrainWaiters } from './server.js';

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
