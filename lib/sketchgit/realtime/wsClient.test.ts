// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Minimal WebSocket mock ────────────────────────────────────────────────────
class MockWebSocket {
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  url: string;

  private listeners: Record<string, EventListener[]> = {};

  static lastInstance: MockWebSocket | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.lastInstance = this;
    // Trigger 'open' asynchronously so listeners can be attached first.
    // Uses a 0ms timer so vi.runOnlyPendingTimers() can fire it without
    // also firing the heartbeat (35 s) that is scheduled inside the open handler.
    setTimeout(() => this._emit('open', new Event('open')), 0);
  }

  addEventListener(type: string, listener: EventListener) {
    (this.listeners[type] ||= []).push(listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners[type] = (this.listeners[type] || []).filter((l) => l !== listener);
  }

  send = vi.fn();

  close(code = 1000) {
    this.readyState = MockWebSocket.CLOSED;
    this._emit('close', new CloseEvent('close', { code }));
  }

  _emit(type: string, event: Event) {
    for (const l of (this.listeners[type] || [])) l(event);
  }
}

// Install mock before WsClient is imported so it captures the global.
globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;

// ── Logger mock ───────────────────────────────────────────────────────────────
vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── PollingFallback mock ──────────────────────────────────────────────────────
vi.mock('./pollingFallback', () => ({ PollingFallback: vi.fn() }));

import { WsClient } from './wsClient';
import { logger } from '../logger';
import { PollingFallback } from './pollingFallback';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeClient() {
  return new WsClient();
}

/** Create a fresh mock PollingFallback instance and inject it into PollingFallback mock. */
function makePollingMock(active = false) {
  const instance = {
    _active: active,
    start: vi.fn().mockImplementation(function(this: typeof instance) { this._active = true; }),
    stop:  vi.fn().mockImplementation(function(this: typeof instance) { this._active = false; }),
    isActive: vi.fn().mockImplementation(function(this: typeof instance) { return this._active; }),
    postCommit: vi.fn().mockResolvedValue(undefined),
  };
  // Must use a regular function (not arrow) as the mock implementation so it
  // can be called with `new` in WsClient.startPolling().
  vi.mocked(PollingFallback).mockImplementation(function() {
    return instance;
  } as unknown as typeof PollingFallback);
  return instance;
}

/** Fire only the 0-ms "open" timer created by MockWebSocket. */
function openSocket() {
  vi.runOnlyPendingTimers();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WsClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.lastInstance = null;
    document.body.innerHTML = [
      '<div id="liveInd" style="display:none"></div>',
      '<div id="peerStatus"></div>',
      '<div id="toast"></div>',
    ].join('');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Getters ──────────────────────────────────────────────────────────────

  it('exposes name and color via getters', () => {
    const client = makeClient();
    client.connect('room1', 'Alice', '#ff0000');
    expect(client.name).toBe('Alice');
    expect(client.color).toBe('#ff0000');
  });

  // ── isConnected ──────────────────────────────────────────────────────────

  it('isConnected() is false before connect()', () => {
    const client = makeClient();
    expect(client.isConnected()).toBe(false);
  });

  it('isConnected() is true immediately after the socket opens', () => {
    const client = makeClient();
    client.connect('room1', 'Alice', '#blue');
    // Socket is OPEN (default readyState) before open event fires
    expect(client.isConnected()).toBe(true);
  });

  // ── Status callbacks ─────────────────────────────────────────────────────

  it('fires onStatusChange("connecting") synchronously on connect()', () => {
    const statuses: string[] = [];
    const client = makeClient();
    client.onStatusChange = (s) => statuses.push(s);
    client.connect('room1', 'Alice', '#blue');
    expect(statuses).toContain('connecting');
  });

  it('fires onStatusChange("connected") when the socket open event fires', () => {
    const statuses: string[] = [];
    const client = makeClient();
    client.onStatusChange = (s) => statuses.push(s);
    client.connect('room1', 'Alice', '#blue');
    openSocket(); // fire the 0-ms open timer; does NOT fire the 35-s heartbeat
    expect(statuses).toContain('connected');
  });

  // ── Message handling ─────────────────────────────────────────────────────

  it('routes non-ping messages to onMessage', () => {
    const received: unknown[] = [];
    const client = makeClient();
    client.onMessage = (msg) => received.push(msg);
    client.connect('room1', 'Alice', '#blue');
    openSocket();

    const ws = MockWebSocket.lastInstance!;
    ws._emit('message', new MessageEvent('message', {
      data: JSON.stringify({ type: 'welcome', clientId: 'c1', roomId: 'room1' }),
    }));
    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe('welcome');
  });

  it('responds to server ping with pong', () => {
    const client = makeClient();
    client.connect('room1', 'Alice', '#blue');
    openSocket();

    const ws = MockWebSocket.lastInstance!;
    ws._emit('message', new MessageEvent('message', {
      data: JSON.stringify({ type: 'ping' }),
    }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'pong' }));
  });

  it('silently ignores malformed JSON in incoming messages', () => {
    const client = makeClient();
    client.onMessage = vi.fn();
    client.connect('room1', 'Alice', '#blue');
    openSocket();

    const ws = MockWebSocket.lastInstance!;
    expect(() => {
      ws._emit('message', new MessageEvent('message', { data: 'not-json' }));
    }).not.toThrow();
    expect(client.onMessage).not.toHaveBeenCalled();
  });

  // ── Message queue ────────────────────────────────────────────────────────

  it('queues messages sent while offline and flushes them on connect', () => {
    const client = makeClient();
    client.send({ type: 'profile', name: 'Alice', color: '#blue' });

    client.connect('room1', 'Alice', '#blue');
    openSocket();

    const ws = MockWebSocket.lastInstance!;
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'profile', name: 'Alice', color: '#blue' }),
    );
  });

  // ── disconnect ───────────────────────────────────────────────────────────

  it('disconnect() fires onStatusChange("offline") and isConnected becomes false', () => {
    const statuses: string[] = [];
    const client = makeClient();
    client.onStatusChange = (s) => statuses.push(s);
    client.connect('room1', 'Alice', '#blue');
    openSocket();

    client.disconnect();
    expect(statuses).toContain('offline');
    expect(client.isConnected()).toBe(false);
  });

  // ── Reconnection ─────────────────────────────────────────────────────────

  it('schedules a reconnect (status=reconnecting) on an unintentional close', () => {
    const statuses: string[] = [];
    const client = makeClient();
    client.onStatusChange = (s) => statuses.push(s);
    client.connect('room1', 'Alice', '#blue');
    openSocket();

    const ws = MockWebSocket.lastInstance!;
    ws.readyState = MockWebSocket.CLOSED;
    ws._emit('close', new CloseEvent('close', { code: 1006 }));

    expect(statuses).toContain('reconnecting');
  });

  it('does NOT reconnect after intentional disconnect()', () => {
    const statuses: string[] = [];
    const client = makeClient();
    client.onStatusChange = (s) => statuses.push(s);
    client.connect('room1', 'Alice', '#blue');
    openSocket();
    statuses.length = 0;

    client.disconnect();
    // Fire only timers that were pending before disconnect — there should be none.
    vi.runOnlyPendingTimers();

    expect(statuses.filter((s) => s === 'connecting' || s === 'reconnecting')).toHaveLength(0);
  });

  it('shows an offline toast and stops retrying after MAX_RETRIES (10)', () => {
    const client = makeClient();
    client.connect('room1', 'Alice', '#blue');
    openSocket();

    const ws = MockWebSocket.lastInstance!;
    // Emit 11 close events from the same socket instance.
    // Each call to _scheduleReconnect increments retryCount.
    // On the 11th call retryCount >= MAX_RETRIES → offline toast shown.
    for (let i = 0; i <= 10; i++) {
      ws.readyState = MockWebSocket.CLOSED;
      ws._emit('close', new CloseEvent('close', { code: 1006 }));
    }

    expect(document.getElementById('toast')?.classList.contains('show')).toBe(true);
  });

  it('fires reconnect timer via runOnlyPendingTimers and opens a new socket', () => {
    const client = makeClient();
    client.connect('room1', 'Alice', '#blue');
    openSocket();

    const firstWs = MockWebSocket.lastInstance!;
    firstWs.readyState = MockWebSocket.CLOSED;
    firstWs._emit('close', new CloseEvent('close', { code: 1006 }));
    // Fire the reconnect delay timer (not the heartbeat).
    vi.runOnlyPendingTimers();

    // A new MockWebSocket should have been created.
    expect(MockWebSocket.lastInstance).not.toBe(firstWs);
  });

  // ── Error handler ────────────────────────────────────────────────────────

  it('logs a warning via logger.warn on WebSocket error (no fields when ErrorEvent is bare)', () => {
    const client = makeClient();
    client.connect('room1', 'Alice', '#blue');

    const ws = MockWebSocket.lastInstance!;
    // Emit a bare ErrorEvent (no message / error – typical for WS connect failures)
    ws._emit('error', new Event('error'));

    expect(logger.warn).toHaveBeenCalledWith(
      {},
      '[WsClient] WebSocket error – will retry on close',
    );
  });

  it('includes message and error fields in logger.warn when ErrorEvent carries details', () => {
    const client = makeClient();
    client.connect('room1', 'Alice', '#blue');

    const ws = MockWebSocket.lastInstance!;
    const underlyingError = new Error('connection refused');
    const ev = new ErrorEvent('error', { message: 'WebSocket error', error: underlyingError });
    ws._emit('error', ev);

    expect(logger.warn).toHaveBeenCalledWith(
      { message: 'WebSocket error', error: 'connection refused' },
      '[WsClient] WebSocket error – will retry on close',
    );
  });
});

// ─── NEXT_PUBLIC_WS_URL override ─────────────────────────────────────────────

describe('WsClient._buildUrl NEXT_PUBLIC_WS_URL override', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.lastInstance = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.NEXT_PUBLIC_WS_URL;
  });

  it('uses NEXT_PUBLIC_WS_URL as the WebSocket base when set', () => {
    process.env.NEXT_PUBLIC_WS_URL = 'wss://my-ws-server.railway.app/ws';
    const client = makeClient();
    client.connect('room1', 'Alice', '#a78bfa');

    const ws = MockWebSocket.lastInstance!;
    expect(ws.url).toBe(
      'wss://my-ws-server.railway.app/ws?room=room1&name=Alice&color=%23a78bfa',
    );
  });

  it('falls back to the same-host /ws path when NEXT_PUBLIC_WS_URL is not set', () => {
    delete process.env.NEXT_PUBLIC_WS_URL;
    const client = makeClient();
    client.connect('room1', 'Alice', '#ff0000');

    const ws = MockWebSocket.lastInstance!;
    // jsdom default origin is http://localhost:3000 so protocol → ws: (includes port)
    expect(ws.url).toMatch(/^ws:\/\/localhost(:\d+)?\/ws\?room=room1/);
  });
});

// ─── Polling fallback integration ────────────────────────────────────────────

describe('WsClient polling fallback', () => {
  let polling: ReturnType<typeof makePollingMock>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    polling = makePollingMock();
    MockWebSocket.lastInstance = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('isPolling() is false initially', () => {
    const client = makeClient();
    expect(client.isPolling()).toBe(false);
  });

  it('startPolling() activates polling and passes initial SHAs', () => {
    const client = makeClient();
    client.connect('room1', 'Alice', '#blue');
    const shas = new Set(['sha1', 'sha2']);
    client.startPolling(shas);

    expect(client.isPolling()).toBe(true);
    expect(polling.start).toHaveBeenCalledWith(shas);
  });

  it('stopPolling() deactivates polling', () => {
    const client = makeClient();
    client.connect('room1', 'Alice', '#blue');
    client.startPolling(new Set());
    client.stopPolling();

    expect(client.isPolling()).toBe(false);
    expect(polling.stop).toHaveBeenCalled();
  });

  it('connect() stops any active polling before opening a new socket', () => {
    const client = makeClient();
    client.connect('room1', 'Alice', '#blue');
    client.startPolling(new Set());
    expect(client.isPolling()).toBe(true);

    // Calling connect() again (e.g. manual reconnect) should stop polling.
    client.connect('room1', 'Alice', '#blue');
    expect(polling.stop).toHaveBeenCalled();
  });

  it('disconnect() stops polling', () => {
    const client = makeClient();
    client.connect('room1', 'Alice', '#blue');
    client.startPolling(new Set());
    client.disconnect();

    expect(polling.stop).toHaveBeenCalled();
  });

  it('send({ type: "commit" }) is routed to postCommit() when polling is active', () => {
    const client = makeClient();
    client.connect('room1', 'Alice', '#blue');
    client.startPolling(new Set());

    const ws = MockWebSocket.lastInstance!;
    const commitMsg = { type: 'commit' as const, sha: 'sha1', commit: { branch: 'main', message: 'test', canvas: '{}', parents: [] } };
    client.send(commitMsg);

    // Should NOT go to the WebSocket
    expect(ws.send).not.toHaveBeenCalled();
    // Should be routed to postCommit
    expect(polling.postCommit).toHaveBeenCalledWith('sha1', commitMsg.commit);
  });

  it('send() of non-commit messages is NOT routed to REST when polling', () => {
    const client = makeClient();
    client.connect('room1', 'Alice', '#blue');
    openSocket(); // open the WS connection
    client.startPolling(new Set());

    const ws = MockWebSocket.lastInstance!;
    client.send({ type: 'pong' });

    // Non-commit message still goes through WS
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'pong' }));
    expect(polling.postCommit).not.toHaveBeenCalled();
  });
});

// ─── P073: sendBatched ───────────────────────────────────────────────────────

describe('WsClient.sendBatched (P073)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    MockWebSocket.lastInstance = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends a single batched message directly (no array wrapping)', async () => {
    const client = makeClient();
    client.connect('room1', 'Alice', '#blue');
    openSocket();
    const ws = MockWebSocket.lastInstance!;

    client.sendBatched({ type: 'cursor', x: 10, y: 20 } as Parameters<typeof client.sendBatched>[0]);

    // Flush the microtask queue so queueMicrotask fires
    await Promise.resolve();

    expect(ws.send).toHaveBeenCalledOnce();
    const sent = JSON.parse(ws.send.mock.calls[0][0] as string) as unknown;
    // Single message → NOT wrapped in array
    expect(sent).toMatchObject({ type: 'cursor', x: 10, y: 20 });
    expect(Array.isArray(sent)).toBe(false);
  });

  it('coalesces two messages sent in the same microtask into a JSON array', async () => {
    const client = makeClient();
    client.connect('room1', 'Alice', '#blue');
    openSocket();
    const ws = MockWebSocket.lastInstance!;

    client.sendBatched({ type: 'cursor', x: 1, y: 2 } as Parameters<typeof client.sendBatched>[0]);
    client.sendBatched({ type: 'draw-delta', added: [], modified: [], removed: [] } as Parameters<typeof client.sendBatched>[0]);

    // Flush the microtask queue
    await Promise.resolve();

    // Both messages should be combined into one send() call
    expect(ws.send).toHaveBeenCalledOnce();
    const sent = JSON.parse(ws.send.mock.calls[0][0] as string) as unknown[];
    expect(Array.isArray(sent)).toBe(true);
    expect(sent).toHaveLength(2);
    expect((sent[0] as Record<string, unknown>).type).toBe('cursor');
    expect((sent[1] as Record<string, unknown>).type).toBe('draw-delta');
  });

  it('falls back to send() queue when socket is not open', () => {
    const client = makeClient();
    client.connect('room1', 'Alice', '#blue');
    // Do NOT open the socket – stays in CONNECTING state

    const ws = MockWebSocket.lastInstance!;
    ws.readyState = MockWebSocket.CLOSING; // simulate not-open

    client.sendBatched({ type: 'cursor', x: 1, y: 2 } as Parameters<typeof client.sendBatched>[0]);

    // Falls back to send() → queued as string
    expect(ws.send).not.toHaveBeenCalled();
  });
});
