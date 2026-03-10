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

  // Track instances for test inspection
  static lastInstance: MockWebSocket | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.lastInstance = this;
    // Simulate async open so we can attach listeners first
    setTimeout(() => this._emit('open', new Event('open')), 0);
  }

  addEventListener(type: string, listener: EventListener) {
    (this.listeners[type] ||= []).push(listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners[type] = (this.listeners[type] || []).filter((l) => l !== listener);
  }

  send = vi.fn();

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this._emit('close', new CloseEvent('close', { code: 1000 }));
  }

  /** Helper: trigger an event on this socket */
  _emit(type: string, event: Event) {
    for (const l of this.listeners[type] || []) l(event);
  }
}

// Patch global WebSocket before importing WsClient
globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;

import { WsClient } from './wsClient';

function makeClient() {
  return new WsClient();
}

describe('WsClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.lastInstance = null;
    document.body.innerHTML = '<div id="liveInd" style="display:none"></div><div id="peerStatus"></div>';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes name and color getters', () => {
    const client = makeClient();
    client.connect('room1', 'Alice', '#ff0000');
    expect(client.name).toBe('Alice');
    expect(client.color).toBe('#ff0000');
  });

  it('isConnected() returns true when socket is OPEN', () => {
    const client = makeClient();
    client.connect('room1', 'Alice', '#blue');
    expect(client.isConnected()).toBe(true);
  });

  it('isConnected() returns false before connect', () => {
    const client = makeClient();
    expect(client.isConnected()).toBe(false);
  });

  it('fires onStatusChange with "connecting" then "connected" on connect', () => {
    const statuses: string[] = [];
    const client = makeClient();
    client.onStatusChange = (s) => statuses.push(s);
    client.connect('room1', 'Alice', '#blue');
    expect(statuses).toContain('connecting');
    // Simulate socket open
    vi.runAllTimers();
    expect(statuses).toContain('connected');
  });

  it('fires onClientId callback from welcome message if set via onMessage', async () => {
    const client = makeClient();
    const messages: string[] = [];
    client.onMessage = (msg) => {
      if (msg.type === 'welcome') messages.push(msg.clientId as string);
    };
    client.connect('room1', 'Alice', '#blue');
    vi.runAllTimers();

    const ws = MockWebSocket.lastInstance!;
    ws._emit('message', new MessageEvent('message', { data: JSON.stringify({ type: 'welcome', clientId: 'c1', roomId: 'room1' }) }));
    expect(messages).toContain('c1');
  });

  it('responds to ping with pong', () => {
    const client = makeClient();
    client.connect('room1', 'Alice', '#blue');
    vi.runAllTimers();

    const ws = MockWebSocket.lastInstance!;
    ws._emit('message', new MessageEvent('message', { data: JSON.stringify({ type: 'ping' }) }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'pong' }));
  });

  it('queues messages sent while socket is not open and flushes on connect', () => {
    const client = makeClient();
    // Socket not yet connected
    client.send({ type: 'profile', name: 'Alice', color: '#blue' });

    // Now connect and open
    client.connect('room1', 'Alice', '#blue');
    vi.runAllTimers();

    const ws = MockWebSocket.lastInstance!;
    // Queued message should have been flushed
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'profile', name: 'Alice', color: '#blue' }),
    );
  });

  it('disconnect() clears the socket and sets status to offline', () => {
    const statuses: string[] = [];
    const client = makeClient();
    client.onStatusChange = (s) => statuses.push(s);
    client.connect('room1', 'Alice', '#blue');
    vi.runAllTimers();

    client.disconnect();
    expect(statuses).toContain('offline');
    expect(client.isConnected()).toBe(false);
  });

  it('schedules reconnect on unintentional close', () => {
    const statuses: string[] = [];
    const client = makeClient();
    client.onStatusChange = (s) => statuses.push(s);
    client.connect('room1', 'Alice', '#blue');
    vi.runAllTimers(); // triggers open

    const ws = MockWebSocket.lastInstance!;
    ws.readyState = MockWebSocket.CLOSED;
    ws._emit('close', new CloseEvent('close', { code: 1006 }));

    expect(statuses).toContain('reconnecting');
  });

  it('does not reconnect after intentional disconnect', () => {
    const statuses: string[] = [];
    const client = makeClient();
    client.onStatusChange = (s) => statuses.push(s);
    client.connect('room1', 'Alice', '#blue');
    vi.runAllTimers();
    statuses.length = 0; // reset

    client.disconnect(); // intentional
    vi.runAllTimers(); // advance to any pending reconnect timers

    // Should not re-connect
    expect(statuses.filter((s) => s === 'connecting' || s === 'reconnecting')).toHaveLength(0);
  });

  it('shows offline toast and stops retrying after MAX_RETRIES', () => {
    document.body.innerHTML += '<div id="toast"></div>';
    const client = makeClient();
    client.connect('room1', 'Alice', '#blue');
    vi.runAllTimers();

    // Exhaust all 10 retries
    for (let i = 0; i < 11; i++) {
      const ws = MockWebSocket.lastInstance!;
      ws.readyState = MockWebSocket.CLOSED;
      ws._emit('close', new CloseEvent('close', { code: 1006 }));
      vi.runAllTimers();
    }

    expect(document.getElementById('toast')?.classList.contains('show')).toBe(true);
  });

  it('ignores malformed JSON in incoming messages', () => {
    const client = makeClient();
    client.onMessage = vi.fn();
    client.connect('room1', 'Alice', '#blue');
    vi.runAllTimers();

    const ws = MockWebSocket.lastInstance!;
    expect(() => {
      ws._emit('message', new MessageEvent('message', { data: 'not-json' }));
    }).not.toThrow();
    expect(client.onMessage).not.toHaveBeenCalled();
  });
});
