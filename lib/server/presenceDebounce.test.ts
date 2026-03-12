/**
 * Unit tests for the P044 presence-broadcast debouncing pattern.
 *
 * These tests validate the debounce behaviour in isolation using Vitest's
 * fake-timer utilities, mirroring the `schedulePushPresence` logic in server.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Minimal replica of the schedulePushPresence logic ───────────────────────
// The actual implementation lives in server.ts (a runtime executable), so we
// replicate the same algorithm here to allow unit testing without spinning up
// the full server.

function createPresenceScheduler(debounceMs: number, pushPresence: (roomId: string) => void) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function schedulePushPresence(roomId: string): void {
    const existing = timers.get(roomId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      timers.delete(roomId);
      pushPresence(roomId);
    }, debounceMs);

    timers.set(roomId, timer);
  }

  function clearAll(): void {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
  }

  return { schedulePushPresence, clearAll, timerCount: () => timers.size };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('P044 – schedulePushPresence debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces 5 rapid calls into a single pushPresence invocation', () => {
    const pushPresence = vi.fn();
    const { schedulePushPresence } = createPresenceScheduler(80, pushPresence);

    for (let i = 0; i < 5; i++) {
      schedulePushPresence('room-1');
    }

    // No broadcast yet – debounce window still open
    expect(pushPresence).not.toHaveBeenCalled();

    // Advance past the debounce window
    vi.advanceTimersByTime(80);
    expect(pushPresence).toHaveBeenCalledTimes(1);
    expect(pushPresence).toHaveBeenCalledWith('room-1');
  });

  it('uses separate debounce timers per room', () => {
    const pushPresence = vi.fn();
    const { schedulePushPresence } = createPresenceScheduler(80, pushPresence);

    schedulePushPresence('room-1');
    schedulePushPresence('room-2');

    vi.advanceTimersByTime(80);
    expect(pushPresence).toHaveBeenCalledTimes(2);
    expect(pushPresence).toHaveBeenCalledWith('room-1');
    expect(pushPresence).toHaveBeenCalledWith('room-2');
  });

  it('with 0ms debounce fires after flushing the event loop', () => {
    const pushPresence = vi.fn();
    const { schedulePushPresence } = createPresenceScheduler(0, pushPresence);

    schedulePushPresence('room-1');
    schedulePushPresence('room-1'); // rapid second call resets the timer
    schedulePushPresence('room-1'); // rapid third call resets again

    expect(pushPresence).not.toHaveBeenCalled(); // still queued
    vi.advanceTimersByTime(0);
    // Only one call because the rapid burst collapsed into a single timer
    expect(pushPresence).toHaveBeenCalledTimes(1);
  });

  it('calls pushPresence twice when separated by more than the debounce window', () => {
    const pushPresence = vi.fn();
    const { schedulePushPresence } = createPresenceScheduler(80, pushPresence);

    schedulePushPresence('room-1');
    vi.advanceTimersByTime(80);     // fires the first broadcast
    expect(pushPresence).toHaveBeenCalledTimes(1);

    schedulePushPresence('room-1'); // new burst after the window
    vi.advanceTimersByTime(80);     // fires the second broadcast
    expect(pushPresence).toHaveBeenCalledTimes(2);
  });

  it('clearAll prevents pushPresence from firing (shutdown behaviour)', () => {
    const pushPresence = vi.fn();
    const { schedulePushPresence, clearAll } = createPresenceScheduler(80, pushPresence);

    schedulePushPresence('room-1');
    schedulePushPresence('room-2');

    // Simulate graceful shutdown: cancel all pending timers
    clearAll();

    vi.advanceTimersByTime(200); // nothing should fire
    expect(pushPresence).not.toHaveBeenCalled();
  });
});
