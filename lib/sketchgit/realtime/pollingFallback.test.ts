// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PollingFallback, POLL_INTERVAL_MS } from './pollingFallback';
import { WsMessage } from '../types';

// ── Logger mock ───────────────────────────────────────────────────────────────
vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCommitItem(sha: string, branch = 'main') {
  return {
    sha,
    parent: null,
    parents: [],
    branch,
    message: `commit ${sha}`,
    ts: 1000,
    canvas: '{"objects":[]}',
    isMerge: false,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PollingFallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('isActive() is false before start()', () => {
    const fb = new PollingFallback('room1', vi.fn());
    expect(fb.isActive()).toBe(false);
  });

  it('isActive() is true after start() and false after stop()', () => {
    const fb = new PollingFallback('room1', vi.fn());
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ commits: [] }) } as Response);
    fb.start(new Set());
    expect(fb.isActive()).toBe(true);
    fb.stop();
    expect(fb.isActive()).toBe(false);
  });

  it('dispatches only new commits (not already in knownShas)', async () => {
    const received: WsMessage[] = [];
    const fb = new PollingFallback('room1', (msg) => received.push(msg));
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ commits: [makeCommitItem('sha1'), makeCommitItem('sha2')] }),
    } as Response);

    // sha1 is already known; only sha2 should be dispatched
    fb.start(new Set(['sha1']));
    // Flush the immediate poll's microtasks
    await Promise.resolve();
    await Promise.resolve();

    expect(received).toHaveLength(1);
    expect((received[0] as { sha: string }).sha).toBe('sha2');
    fb.stop();
  });

  it('polls again after POLL_INTERVAL_MS', async () => {
    const fb = new PollingFallback('room1', vi.fn());
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ commits: [] }) } as Response);
    fb.start(new Set());
    // Drain the immediate poll
    await Promise.resolve();
    await Promise.resolve();

    const firstCallCount = vi.mocked(fetch).mock.calls.length;
    // Advance one poll interval and drain its microtasks
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    await Promise.resolve();
    await Promise.resolve();
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(firstCallCount);

    fb.stop();
  });

  it('does not poll after stop()', async () => {
    const fb = new PollingFallback('room1', vi.fn());
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ commits: [] }) } as Response);
    fb.start(new Set());
    await Promise.resolve();
    fb.stop();

    const callCount = vi.mocked(fetch).mock.calls.length;
    vi.advanceTimersByTime(POLL_INTERVAL_MS * 3);
    await Promise.resolve();
    expect(vi.mocked(fetch).mock.calls.length).toBe(callCount);
  });

  it('does not dispatch the same SHA twice across multiple polls', async () => {
    const received: WsMessage[] = [];
    const fb = new PollingFallback('room1', (msg) => received.push(msg));
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ commits: [makeCommitItem('sha-abc')] }),
    } as Response);

    fb.start(new Set());
    await Promise.resolve();
    await Promise.resolve();

    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    await Promise.resolve();
    await Promise.resolve();

    // sha-abc should only be dispatched once
    const count = received.filter((m) => (m as { sha: string }).sha === 'sha-abc').length;
    expect(count).toBe(1);

    fb.stop();
  });

  it('builds the correct fetch URL with canvas=true', async () => {
    const fb = new PollingFallback('my-room', vi.fn());
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ commits: [] }) } as Response);
    fb.start(new Set());
    await Promise.resolve();
    await Promise.resolve();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/rooms/my-room/commits?take=50&canvas=true',
    );
    fb.stop();
  });

  it('URL-encodes the roomId', async () => {
    const fb = new PollingFallback('room with spaces', vi.fn());
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ commits: [] }) } as Response);
    fb.start(new Set());
    await Promise.resolve();
    await Promise.resolve();

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('room%20with%20spaces');
    fb.stop();
  });

  it('does not throw when fetch fails (network error)', async () => {
    const fb = new PollingFallback('room1', vi.fn());
    vi.mocked(fetch).mockRejectedValue(new Error('network error'));
    fb.start(new Set());
    // Give the immediate poll a chance to run and recover
    await Promise.resolve();
    await Promise.resolve();
    fb.stop();
  });

  it('does not dispatch when fetch returns non-OK status', async () => {
    const received: WsMessage[] = [];
    const fb = new PollingFallback('room1', (msg) => received.push(msg));
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503, json: async () => ({}) } as Response);
    fb.start(new Set());
    await Promise.resolve();
    await Promise.resolve();

    expect(received).toHaveLength(0);
    fb.stop();
  });
});

// ─── postCommit ───────────────────────────────────────────────────────────────

describe('PollingFallback.postCommit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('POSTs the commit to the REST endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ sha: 'sha1' }) } as Response);
    const fb = new PollingFallback('room1', vi.fn());
    const commit = { branch: 'main', message: 'test', canvas: '{}', parents: [] };
    await fb.postCommit('sha1', commit);

    expect(fetch).toHaveBeenCalledWith(
      '/api/rooms/room1/commits',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha: 'sha1', commit }),
      }),
    );
  });

  it('does not throw on network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    const fb = new PollingFallback('room1', vi.fn());
    await expect(fb.postCommit('sha1', {})).resolves.not.toThrow();
  });
});
