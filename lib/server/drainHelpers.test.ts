/**
 * Unit tests for the P043 graceful-shutdown drain helpers.
 *
 * The helpers (beginWrite / endWrite / waitForDrain) are module-level
 * functions in server.ts which is not directly importable in unit tests.
 * Instead, we inline equivalent implementations here to verify the logic
 * in isolation.
 */
import { describe, it, expect, vi } from 'vitest';

// ─── Inline implementation of drain helpers (mirrors server.ts) ───────────────
function makeDrainHelpers() {
  let inFlightWrites = 0;
  const drainWaiters: Array<() => void> = [];

  function beginWrite(): void {
    inFlightWrites++;
  }

  function endWrite(): void {
    inFlightWrites--;
    if (inFlightWrites <= 0) {
      inFlightWrites = 0;
      drainWaiters.splice(0).forEach((resolve) => resolve());
    }
  }

  function waitForDrain(timeoutMs: number): Promise<void> {
    if (inFlightWrites === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        const idx = drainWaiters.indexOf(resolve);
        if (idx !== -1) drainWaiters.splice(idx, 1);
        resolve();
      }, timeoutMs);
      drainWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  function getInflight() { return inFlightWrites; }

  return { beginWrite, endWrite, waitForDrain, getInflight };
}

describe('P043 drain helpers', () => {
  it('beginWrite increments and endWrite decrements the counter', () => {
    const { beginWrite, endWrite, getInflight } = makeDrainHelpers();
    expect(getInflight()).toBe(0);
    beginWrite();
    expect(getInflight()).toBe(1);
    beginWrite();
    expect(getInflight()).toBe(2);
    endWrite();
    expect(getInflight()).toBe(1);
    endWrite();
    expect(getInflight()).toBe(0);
  });

  it('waitForDrain resolves immediately when inFlightWrites is 0', async () => {
    const { waitForDrain } = makeDrainHelpers();
    await expect(waitForDrain(5_000)).resolves.toBeUndefined();
  });

  it('waitForDrain resolves when all writes complete', async () => {
    const { beginWrite, endWrite, waitForDrain } = makeDrainHelpers();
    beginWrite();
    beginWrite();
    const drain = waitForDrain(5_000);
    endWrite();
    endWrite();
    await expect(drain).resolves.toBeUndefined();
  });

  it('waitForDrain resolves after timeout even if writes are stuck', async () => {
    vi.useFakeTimers();
    const { beginWrite, waitForDrain, getInflight } = makeDrainHelpers();
    beginWrite(); // never call endWrite — simulate stuck write
    const drain = waitForDrain(100);
    vi.advanceTimersByTime(100);
    await expect(drain).resolves.toBeUndefined();
    expect(getInflight()).toBe(1); // still stuck
    vi.useRealTimers();
  });

  it('multiple simultaneous beginWrite/endWrite calls are handled correctly', async () => {
    const { beginWrite, endWrite, waitForDrain, getInflight } = makeDrainHelpers();
    for (let i = 0; i < 5; i++) beginWrite();
    expect(getInflight()).toBe(5);
    const drain = waitForDrain(5_000);
    for (let i = 0; i < 5; i++) endWrite();
    await drain;
    expect(getInflight()).toBe(0);
  });

  it('counter does not go below zero on extra endWrite calls', () => {
    const { endWrite, getInflight } = makeDrainHelpers();
    endWrite(); // called without a matching beginWrite
    expect(getInflight()).toBe(0);
  });
});
