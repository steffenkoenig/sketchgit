// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CollaborationManager, CollabCallbacks } from './collaborationManager';
import type { WsClient } from './wsClient';
import type { WsMessage, ConnectionStatus } from '../types';

// ─── Mock fetch (REST events now go via HTTP, not WS) ────────────────────────

const mockFetch = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal('fetch', mockFetch);

// ─── Mock WsClient ────────────────────────────────────────────────────────────

function makeMockWs() {
  const ws = {
    name: 'TestUser',
    color: '#7c6eff',
    onMessage: null as ((data: WsMessage) => void) | null,
    onStatusChange: null as ((status: ConnectionStatus) => void) | null,
    onClientId: null as ((id: string) => void) | null,
    send: vi.fn(),
    sendBatched: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
  };
  return ws;
}

type MockWs = ReturnType<typeof makeMockWs>;

// ─── Mock Callbacks ───────────────────────────────────────────────────────────

function makeCallbacks(canvasJson = '{"version":"5","objects":[]}') {
  return {
    getCanvasData: vi.fn().mockReturnValue(canvasJson),
    loadCanvasData: vi.fn(),
    renderTimeline: vi.fn(),
    updateUI: vi.fn(),
    getGitState: vi.fn().mockReturnValue({
      commits: { sha1: { sha: 'sha1', message: 'init' } },
      branches: { main: 'sha1' },
      HEAD: 'main',
      detached: null,
    }),
    applyGitState: vi.fn(),
    receiveCommit: vi.fn(),
    applyBranchUpdate: vi.fn(),
  } satisfies CollabCallbacks;
}

// ─── DOM setup helper ─────────────────────────────────────────────────────────

function setupDom() {
  document.body.innerHTML = `
    <div id="myPeerId"></div>
    <div id="peerStatus"></div>
    <div id="liveInd"></div>
    <div id="connectedList"></div>
    <div id="avatarRow"></div>
    <div id="cursor-layer"></div>
    <div id="canvas-wrap" style="left:0;top:0;width:800px;height:600px"></div>
    <input id="remotePeerInput" value="" />
    <div id="collab-panel"></div>
    <div id="toast"></div>
  `;
}

// ─── Shorthand: send a message through the manager ───────────────────────────

function send(ws: MockWs, msg: WsMessage) {
  ws.onMessage!(msg);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CollaborationManager – construction', () => {
  it('registers onMessage and onStatusChange on the WsClient', () => {
    setupDom();
    const ws = makeMockWs();
    new CollaborationManager(ws as unknown as WsClient, makeCallbacks());
    expect(ws.onMessage).toBeTypeOf('function');
    expect(ws.onStatusChange).toBeTypeOf('function');
  });
});

describe('CollaborationManager – message handling', () => {
  let ws: MockWs;
  let cb: ReturnType<typeof makeCallbacks>;
  let collab: CollaborationManager;

  beforeEach(() => {
    setupDom();
    ws = makeMockWs();
    cb = makeCallbacks();
    collab = new CollaborationManager(ws as unknown as WsClient, cb);
  });

  // ── welcome ─────────────────────────────────────────────────────────────

  it('welcome: stores clientId and roomId', () => {
    send(ws, { type: 'welcome', clientId: 'c1', roomId: 'room-abc' });
    expect(collab.wsClientId).toBe('c1');
    expect(collab.currentRoomId).toBe('room-abc');
  });

  it('welcome: updates #myPeerId with invite link', () => {
    send(ws, { type: 'welcome', clientId: 'c1', roomId: 'room-xyz' });
    expect(document.getElementById('myPeerId')!.textContent).toContain('room-xyz');
  });

  it('welcome: sends profile via REST and fullsync-request via WS', () => {
    mockFetch.mockClear();
    send(ws, { type: 'welcome', clientId: 'c1', roomId: 'r1' });
    // fullsync-request stays on WS
    const types = ws.send.mock.calls.map((c: unknown[]) => (c[0] as WsMessage).type);
    expect(types).toContain('fullsync-request');
    // profile is now submitted via REST
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/profile'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('welcome: keeps currentRoomId when roomId is absent from message', () => {
    collab.currentRoomId = 'my-room';
    send(ws, { type: 'welcome', clientId: 'c2' } as WsMessage);
    expect(collab.currentRoomId).toBe('my-room');
  });

  // ── presence ────────────────────────────────────────────────────────────

  it('presence: populates connectedList with other peers', () => {
    collab.wsClientId = 'me';
    send(ws, {
      type: 'presence',
      clients: [
        { clientId: 'me', name: 'Me', color: '#ff0' },
        { clientId: 'peer1', name: 'Alice', color: '#f00' },
      ],
    } as WsMessage);
    expect(document.getElementById('connectedList')!.children).toHaveLength(1);
  });

  it('presence: removes stale remote cursors for disconnected clients', () => {
    collab.wsClientId = 'me';
    // First add a stale cursor manually
    const layer = document.getElementById('cursor-layer')!;
    const el = document.createElement('div');
    el.id = 'rcursor-stale';
    layer.appendChild(el);
    (collab as unknown as { remoteCursors: Record<string, string> }).remoteCursors['stale'] = 'rcursor-stale';

    send(ws, {
      type: 'presence',
      clients: [{ clientId: 'me', name: 'Me', color: '#ff0' }],
    } as WsMessage);
    expect(document.getElementById('rcursor-stale')).toBeNull();
  });

  // ── user-left ───────────────────────────────────────────────────────────

  it('user-left: removes cursor element for that client', () => {
    const layer = document.getElementById('cursor-layer')!;
    const el = document.createElement('div');
    el.id = 'rcursor-abc';
    layer.appendChild(el);
    (collab as unknown as { remoteCursors: Record<string, string> }).remoteCursors['abc'] = 'rcursor-abc';

    send(ws, { type: 'user-left', clientId: 'abc' } as WsMessage);
    expect(document.getElementById('rcursor-abc')).toBeNull();
  });

  // ── cursor ──────────────────────────────────────────────────────────────

  it('cursor: creates a remote cursor element', () => {
    collab.wsClientId = 'me';
    send(ws, {
      type: 'cursor',
      senderId: 'peer1',
      senderName: 'Bob',
      senderColor: '#0f0',
      x: 50,
      y: 100,
    } as WsMessage);
    const el = document.getElementById('rcursor-peer1');
    expect(el).not.toBeNull();
  });

  it('cursor: ignores own cursor (senderId === wsClientId)', () => {
    collab.wsClientId = 'me';
    send(ws, {
      type: 'cursor',
      senderId: 'me',
      senderName: 'Me',
      senderColor: '#0f0',
      x: 10,
      y: 20,
    } as WsMessage);
    expect(document.getElementById('rcursor-me')).toBeNull();
  });

  // ── draw ─────────────────────────────────────────────────────────────────

  it('draw: calls loadCanvasData and renderTimeline', () => {
    const data = '{"version":"5","objects":[]}';
    send(ws, { type: 'draw', canvas: data } as WsMessage);
    expect(cb.loadCanvasData).toHaveBeenCalledWith(data);
    expect(cb.renderTimeline).toHaveBeenCalled();
  });

  // ── draw-delta ───────────────────────────────────────────────────────────

  it('draw-delta: merges added objects into canvas', () => {
    const newObj = { _id: 'obj1', type: 'rect', left: 10, top: 20 };
    send(ws, { type: 'draw-delta', added: [newObj], modified: [], removed: [] } as WsMessage);
    expect(cb.loadCanvasData).toHaveBeenCalled();
    const loaded = JSON.parse((cb.loadCanvasData as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    const ids = (loaded.objects as { _id: string }[]).map((o) => o._id);
    expect(ids).toContain('obj1');
  });

  it('draw-delta: removes deleted objects from canvas', () => {
    const canvas = JSON.stringify({ version: '5', objects: [{ _id: 'obj1', type: 'rect' }] });
    cb.getCanvasData.mockReturnValue(canvas);
    send(ws, { type: 'draw-delta', added: [], modified: [], removed: ['obj1'] } as WsMessage);
    const loaded = JSON.parse((cb.loadCanvasData as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    const ids = (loaded.objects as { _id: string }[]).map((o) => o._id);
    expect(ids).not.toContain('obj1');
  });

  it('draw-delta: merges property patches into existing objects', () => {
    const canvas = JSON.stringify({
      version: '5',
      objects: [{ _id: 'obj1', type: 'rect', fill: 'red' }],
    });
    cb.getCanvasData.mockReturnValue(canvas);
    send(ws, {
      type: 'draw-delta',
      added: [],
      modified: [{ _id: 'obj1', fill: 'blue' }],
      removed: [],
    } as WsMessage);
    const loaded = JSON.parse((cb.loadCanvasData as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    const obj = (loaded.objects as { _id: string; fill: string }[]).find((o) => o._id === 'obj1');
    expect(obj?.fill).toBe('blue');
  });

  // ── commit ───────────────────────────────────────────────────────────────

  it('commit: calls receiveCommit and renderTimeline', () => {
    const commitData = { sha: 'abc123', message: 'test commit' };
    send(ws, { type: 'commit', sha: 'abc123', commit: commitData } as WsMessage);
    expect(cb.receiveCommit).toHaveBeenCalledWith('abc123', commitData);
    expect(cb.renderTimeline).toHaveBeenCalled();
  });

  // P053 – branch-update
  it('branch-update (isRollback=true): calls applyBranchUpdate + renderTimeline + updateUI', () => {
    send(ws, { type: 'branch-update', branch: 'main', headSha: 'sha_old', isRollback: true } as WsMessage);
    expect(cb.applyBranchUpdate).toHaveBeenCalledWith('main', 'sha_old');
    expect(cb.renderTimeline).toHaveBeenCalled();
    expect(cb.updateUI).toHaveBeenCalled();
  });

  it('branch-update (isRollback=false): does NOT call applyBranchUpdate but still refreshes UI', () => {
    send(ws, { type: 'branch-update', branch: 'feature', headSha: 'sha1', isRollback: false } as WsMessage);
    expect(cb.applyBranchUpdate).not.toHaveBeenCalled();
    expect(cb.renderTimeline).toHaveBeenCalled();
    expect(cb.updateUI).toHaveBeenCalled();
  });

  // ── fullsync-request ─────────────────────────────────────────────────────

  it('fullsync-request: sends back the current git state', () => {
    collab.wsClientId = 'me';
    send(ws, { type: 'fullsync-request', senderId: 'peer1' } as WsMessage);
    const sent = ws.send.mock.calls.find(
      (c: unknown[]) => (c[0] as WsMessage).type === 'fullsync',
    );
    expect(sent).toBeDefined();
    expect((sent![0] as WsMessage & { targetId: string }).targetId).toBe('peer1');
  });

  // ── fullsync ─────────────────────────────────────────────────────────────

  it('fullsync: applies git state when targetId matches our clientId', () => {
    collab.wsClientId = 'me';
    const state = { commits: {}, branches: { main: 'sha1' }, HEAD: 'main', detached: null };
    send(ws, { type: 'fullsync', targetId: 'me', ...state } as WsMessage);
    expect(cb.applyGitState).toHaveBeenCalledWith(state);
    expect(cb.renderTimeline).toHaveBeenCalled();
    expect(cb.updateUI).toHaveBeenCalled();
  });

  it('fullsync: ignores messages intended for another client', () => {
    collab.wsClientId = 'me';
    const state = { commits: {}, branches: {}, HEAD: 'main', detached: null };
    send(ws, { type: 'fullsync', targetId: 'someone-else', ...state } as WsMessage);
    expect(cb.applyGitState).not.toHaveBeenCalled();
  });

  it('fullsync: applies when targetId is undefined (broadcast)', () => {
    collab.wsClientId = 'me';
    const state = { commits: {}, branches: {}, HEAD: 'main', detached: null };
    send(ws, { type: 'fullsync', ...state } as WsMessage);
    expect(cb.applyGitState).toHaveBeenCalled();
  });
});

describe('CollaborationManager – status changes', () => {
  let ws: MockWs;
  let collab: CollaborationManager;

  beforeEach(() => {
    setupDom();
    ws = makeMockWs();
    collab = new CollaborationManager(ws as unknown as WsClient, makeCallbacks());
  });

  it('shows liveInd when status is "connected"', () => {
    ws.onStatusChange!('connected');
    expect(document.getElementById('liveInd')!.style.display).toBe('block');
  });

  it('hides liveInd when status is "offline"', () => {
    ws.onStatusChange!('offline');
    expect(document.getElementById('liveInd')!.style.display).toBe('none');
  });

  it('clears presence list when status becomes "offline"', () => {
    // Populate presenceClients via a 'presence' message first
    collab.wsClientId = 'me';
    send(ws, {
      type: 'presence',
      clients: [{ clientId: 'peer1', name: 'Bob', color: '#f00' }],
    } as WsMessage);
    // Now go offline
    ws.onStatusChange!('offline');
    expect(document.getElementById('connectedList')!.children).toHaveLength(0);
  });
});

describe('CollaborationManager – broadcastDraw', () => {
  let ws: MockWs;
  let cb: ReturnType<typeof makeCallbacks>;
  let collab: CollaborationManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockClear();
    setupDom();
    ws = makeMockWs();
    cb = makeCallbacks();
    collab = new CollaborationManager(ws as unknown as WsClient, cb);
    // Simulate welcome handshake so _postEvent is not blocked.
    (collab as unknown as { wsClientId: string }).wsClientId = 'test-client';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('immediate=true: sends draw message via REST right away', () => {
    const canvas = JSON.stringify({ version: '5', objects: [{ _id: 'a', type: 'rect' }] });
    cb.getCanvasData.mockReturnValue(canvas);
    collab.broadcastDraw(true);
    // First broadcast with no snapshot → sends full 'draw' via REST
    const drawCalls = mockFetch.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes('/draw'),
    );
    expect(drawCalls.length).toBeGreaterThan(0);
    const body = JSON.parse((drawCalls[0][1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body.type).toBe('draw');
  });

  it('immediate=false: coalesces multiple calls into one flush', () => {
    const canvas = JSON.stringify({ version: '5', objects: [{ _id: 'a', type: 'rect' }] });
    cb.getCanvasData.mockReturnValue(canvas);
    collab.broadcastDraw(false);
    collab.broadcastDraw(false);
    collab.broadcastDraw(false);
    vi.runOnlyPendingTimers();
    // Only one REST call should have happened
    const drawCalls = mockFetch.mock.calls.filter((c: unknown[]) => (c[0] as string).includes('/draw'));
    expect(drawCalls).toHaveLength(1);
  });

  it('does nothing when socket is not connected', () => {
    ws.isConnected.mockReturnValue(false);
    collab.broadcastDraw(true);
    // No REST call for draw
    const drawCalls = mockFetch.mock.calls.filter((c: unknown[]) => (c[0] as string).includes('/draw'));
    expect(drawCalls).toHaveLength(0);
  });

  it('does nothing before the welcome message assigns a clientId', () => {
    // Reset clientId to simulate pre-welcome state
    (collab as unknown as { wsClientId: null }).wsClientId = null;
    const canvas = JSON.stringify({ version: '5', objects: [{ _id: 'a', type: 'rect' }] });
    cb.getCanvasData.mockReturnValue(canvas);
    collab.broadcastDraw(true);
    const drawCalls = mockFetch.mock.calls.filter((c: unknown[]) => (c[0] as string).includes('/draw'));
    expect(drawCalls).toHaveLength(0);
  });

  it('sends draw-delta after second broadcast (snapshot already set)', () => {
    const canvas = JSON.stringify({ version: '5', objects: [{ _id: 'a', type: 'rect', fill: 'red' }] });
    cb.getCanvasData.mockReturnValue(canvas);
    collab.broadcastDraw(true); // sets the snapshot
    mockFetch.mockClear();

    // Change the canvas
    const canvas2 = JSON.stringify({ version: '5', objects: [{ _id: 'a', type: 'rect', fill: 'blue' }] });
    cb.getCanvasData.mockReturnValue(canvas2);
    collab.broadcastDraw(true); // should send draw-delta via REST
    const drawCalls = mockFetch.mock.calls.filter((c: unknown[]) => (c[0] as string).includes('/draw'));
    expect(drawCalls.length).toBeGreaterThan(0);
    const body = JSON.parse((drawCalls[0][1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body.type).toBe('draw-delta');
  });

  it('does not send draw-delta when canvas is unchanged', () => {
    const canvas = JSON.stringify({ version: '5', objects: [{ _id: 'a', type: 'rect', fill: 'red' }] });
    cb.getCanvasData.mockReturnValue(canvas);
    collab.broadcastDraw(true); // sets snapshot
    mockFetch.mockClear();
    collab.broadcastDraw(true); // no changes
    const drawCalls = mockFetch.mock.calls.filter((c: unknown[]) => (c[0] as string).includes('/draw'));
    expect(drawCalls).toHaveLength(0);
  });
});

describe('CollaborationManager – broadcastCursor', () => {
  let ws: MockWs;
  let collab: CollaborationManager;

  beforeEach(() => {
    setupDom();
    mockFetch.mockClear();
    ws = makeMockWs();
    collab = new CollaborationManager(ws as unknown as WsClient, makeCallbacks());
    // Simulate welcome handshake so _postEvent is not blocked.
    (collab as unknown as { wsClientId: string }).wsClientId = 'test-client';
  });

  it('sends cursor message via REST when connected and throttle window has passed', () => {
    const wrap = document.getElementById('canvas-wrap')!;
    vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0,
      toJSON: () => ({}),
    });
    (collab as unknown as { lastCursorSent: number }).lastCursorSent = 0;
    collab.broadcastCursor({ e: { clientX: 100, clientY: 200 } as MouseEvent });
    // cursor is now submitted via REST
    const cursorCalls = mockFetch.mock.calls.filter((c: unknown[]) => (c[0] as string).includes('/cursor'));
    expect(cursorCalls.length).toBeGreaterThan(0);
    const body = JSON.parse((cursorCalls[0][1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body.type).toBe('cursor');
  });

  it('drops cursor events within the throttle window', () => {
    const wrap = document.getElementById('canvas-wrap')!;
    vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0,
      toJSON: () => ({}),
    });
    (collab as unknown as { lastCursorSent: number }).lastCursorSent = Date.now(); // just sent
    collab.broadcastCursor({ e: { clientX: 100, clientY: 200 } as MouseEvent });
    const cursorCalls = mockFetch.mock.calls.filter((c: unknown[]) => (c[0] as string).includes('/cursor'));
    expect(cursorCalls).toHaveLength(0);
  });

  it('does nothing when socket is not connected', () => {
    ws.isConnected.mockReturnValue(false);
    collab.broadcastCursor({ e: { clientX: 10, clientY: 20 } as MouseEvent });
    const cursorCalls = mockFetch.mock.calls.filter((c: unknown[]) => (c[0] as string).includes('/cursor'));
    expect(cursorCalls).toHaveLength(0);
  });
});

describe('CollaborationManager – room utilities', () => {
  let ws: MockWs;
  let collab: CollaborationManager;

  beforeEach(() => {
    setupDom();
    ws = makeMockWs();
    collab = new CollaborationManager(ws as unknown as WsClient, makeCallbacks());
  });

  it('roomInviteLink includes the room id as a query parameter', () => {
    const link = collab.roomInviteLink('my-room');
    expect(link).toContain('room=my-room');
  });

  it('sanitizeRoomId strips disallowed characters', () => {
    expect(collab.sanitizeRoomId('hello world!')).toBe('hello-world-');
  });

  it('sanitizeRoomId falls back to "default" for empty input', () => {
    expect(collab.sanitizeRoomId('')).toBe('default');
  });

  it('getRoomFromUrl reads the room query param', () => {
    Object.defineProperty(window, 'location', {
      value: new URL('http://localhost/?room=test-room'),
      writable: true,
    });
    expect(collab.getRoomFromUrl()).toBe('test-room');
  });

  it('toggleCollabPanel opens and closes the panel', () => {
    const panel = document.getElementById('collab-panel')!;
    collab.toggleCollabPanel();
    expect(panel.classList.contains('open')).toBe(true);
    collab.toggleCollabPanel();
    expect(panel.classList.contains('open')).toBe(false);
  });

  it('connectToPeerUI shows toast when already on the same room', () => {
    collab.currentRoomId = 'my-room';
    (document.getElementById('remotePeerInput') as HTMLInputElement).value = 'my-room';
    collab.connectToPeerUI('Alice', '#ff0');
    // isConnected = true, requestedRoom = 'my-room' = currentRoomId → toast
    expect(document.getElementById('toast')!.classList.contains('show')).toBe(true);
  });

  it('connectToPeerUI calls ws.connect for a new room', () => {
    collab.currentRoomId = 'old-room';
    (document.getElementById('remotePeerInput') as HTMLInputElement).value = 'new-room';
    collab.connectToPeerUI('Alice', '#ff0');
    expect(ws.connect).toHaveBeenCalledWith('new-room', 'Alice', '#ff0');
  });

  it('closeExternalCursors removes all remote cursor elements', () => {
    const layer = document.getElementById('cursor-layer')!;
    const el = document.createElement('div');
    el.id = 'rcursor-p1';
    layer.appendChild(el);
    (collab as unknown as { remoteCursors: Record<string, string> }).remoteCursors['p1'] = 'rcursor-p1';

    collab.closeExternalCursors();
    expect(document.getElementById('rcursor-p1')).toBeNull();
  });
});

describe('CollaborationManager – destroy', () => {
  it('cancels pending draw flush timer and removes cursor elements', () => {
    vi.useFakeTimers();
    mockFetch.mockClear();
    setupDom();
    const ws = makeMockWs();
    const cb = makeCallbacks();
    cb.getCanvasData.mockReturnValue(
      JSON.stringify({ version: '5', objects: [{ _id: 'a', type: 'rect' }] }),
    );
    const collab = new CollaborationManager(ws as unknown as WsClient, cb);
    // Simulate post-welcome state so _postEvent would fire if timer ran
    (collab as unknown as { wsClientId: string }).wsClientId = 'test-client';

    // Schedule a pending draw flush
    collab.broadcastDraw(false);

    // Add a remote cursor element
    const layer = document.getElementById('cursor-layer')!;
    const el = document.createElement('div');
    el.id = 'rcursor-p1';
    layer.appendChild(el);
    (collab as unknown as { remoteCursors: Record<string, string> }).remoteCursors['p1'] = 'rcursor-p1';

    collab.destroy();

    // Timer should be cancelled (no REST call should be made)
    vi.runAllTimers();
    const drawCalls = mockFetch.mock.calls.filter((c: unknown[]) => (c[0] as string).includes('/draw'));
    expect(drawCalls).toHaveLength(0);

    // Cursor element should be removed
    expect(document.getElementById('rcursor-p1')).toBeNull();

    vi.useRealTimers();
  });
});

describe('P067 CollaborationManager – object-lock relay', () => {
  let collab: CollaborationManager;
  let ws: ReturnType<typeof makeMockWs>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cb: CollabCallbacks & { applyRemoteLock: any; clearRemoteLock: any };

  beforeEach(() => {
    setupDom();
    ws = makeMockWs();
    cb = {
      ...makeCallbacks(),
      applyRemoteLock: vi.fn(),
      clearRemoteLock: vi.fn(),
    };
    collab = new CollaborationManager(ws as unknown as WsClient, cb);
    (ws as unknown as { onMessage: (m: WsMessage) => void }).onMessage = () => {};
  });

  it('calls applyRemoteLock when an object-lock message arrives', () => {
    vi.useFakeTimers();
    (collab as unknown as { handleMessage: (m: WsMessage) => void }).handleMessage({
      type: 'object-lock',
      senderId: 'peer1',
      senderColor: '#ff0',
      objectIds: ['obj-a', 'obj-b'],
    } as WsMessage);
    expect(cb.applyRemoteLock).toHaveBeenCalledWith('peer1', ['obj-a', 'obj-b'], '#ff0');
    vi.useRealTimers();
  });

  it('auto-expires lock after 5 seconds', () => {
    vi.useFakeTimers();
    (collab as unknown as { handleMessage: (m: WsMessage) => void }).handleMessage({
      type: 'object-lock',
      senderId: 'peer1',
      senderColor: '#ff0',
      objectIds: ['obj-a'],
    } as WsMessage);
    vi.advanceTimersByTime(5_001);
    expect(cb.clearRemoteLock).toHaveBeenCalledWith('peer1');
    vi.useRealTimers();
  });

  it('calls clearRemoteLock when an object-unlock message arrives', () => {
    (collab as unknown as { handleMessage: (m: WsMessage) => void }).handleMessage({
      type: 'object-unlock',
      senderId: 'peer1',
    } as WsMessage);
    expect(cb.clearRemoteLock).toHaveBeenCalledWith('peer1');
  });

  it('clears lock when user-left is received for the locking peer', () => {
    vi.useFakeTimers();
    (collab as unknown as { handleMessage: (m: WsMessage) => void }).handleMessage({
      type: 'object-lock',
      senderId: 'peer1',
      senderColor: '#ff0',
      objectIds: ['obj-a'],
    } as WsMessage);
    (collab as unknown as { handleMessage: (m: WsMessage) => void }).handleMessage({
      type: 'user-left',
      clientId: 'peer1',
    } as WsMessage);
    expect(cb.clearRemoteLock).toHaveBeenCalledWith('peer1');
    vi.useRealTimers();
  });
});

describe('P079 CollaborationManager – updateCollabUI with branch label', () => {
  it('shows branch label when peer has branch set', () => {
    setupDom();
    const ws = makeMockWs();
    const collab = new CollaborationManager(ws as unknown as WsClient, makeCallbacks());
    (collab as unknown as { wsClientId: string }).wsClientId = 'me';
    (collab as unknown as { presenceClients: import('../types').PresenceClient[] }).presenceClients = [
      { clientId: 'peer1', name: 'Alice', color: '#ff0', branch: 'feature/x' },
    ];
    collab.updateCollabUI();
    const list = document.getElementById('connectedList')!;
    expect(list.innerHTML).toContain('feature/x');
  });

  it('shows no branch label when peer branch is absent', () => {
    setupDom();
    const ws = makeMockWs();
    const collab = new CollaborationManager(ws as unknown as WsClient, makeCallbacks());
    (collab as unknown as { wsClientId: string }).wsClientId = 'me';
    (collab as unknown as { presenceClients: import('../types').PresenceClient[] }).presenceClients = [
      { clientId: 'peer1', name: 'Bob', color: '#f00' },
    ];
    collab.updateCollabUI();
    const list = document.getElementById('connectedList')!;
    expect(list.innerHTML).not.toContain('⎇');
  });

  it('getPresenceClients returns a copy of presenceClients', () => {
    setupDom();
    const ws = makeMockWs();
    const collab = new CollaborationManager(ws as unknown as WsClient, makeCallbacks());
    const peers = [{ clientId: 'p1', name: 'X', color: '#f' }];
    (collab as unknown as { presenceClients: import('../types').PresenceClient[] }).presenceClients = peers;
    const result = collab.getPresenceClients();
    expect(result).toEqual(peers);
    expect(result).not.toBe(peers); // should be a copy
  });
});

describe('P080 CollaborationManager – presenter mode', () => {
  it('startPresenting sends follow-request via REST and starts view-sync timer', () => {
    vi.useFakeTimers();
    mockFetch.mockClear();
    setupDom();
    const ws = makeMockWs();
    const collab = new CollaborationManager(ws as unknown as WsClient, makeCallbacks());
    (collab as unknown as { wsClientId: string }).wsClientId = 'me';
    collab.startPresenting();
    // follow-request now submitted via REST
    const followCalls = mockFetch.mock.calls.filter((c: unknown[]) => (c[0] as string).includes('/follow'));
    expect(followCalls.length).toBeGreaterThan(0);
    const body = JSON.parse((followCalls[0][1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body.action).toBe('request');
    expect(collab.isPresenting).toBe(true);
    collab.stopPresenting();
    vi.useRealTimers();
  });

  it('stopPresenting sends follow-stop via REST and clears timer', () => {
    vi.useFakeTimers();
    mockFetch.mockClear();
    setupDom();
    const ws = makeMockWs();
    const collab = new CollaborationManager(ws as unknown as WsClient, makeCallbacks());
    (collab as unknown as { wsClientId: string }).wsClientId = 'me';
    collab.startPresenting();
    mockFetch.mockClear();
    collab.stopPresenting();
    // follow-stop now submitted via REST
    const followCalls = mockFetch.mock.calls.filter((c: unknown[]) => (c[0] as string).includes('/follow'));
    expect(followCalls.length).toBeGreaterThan(0);
    const body = JSON.parse((followCalls[0][1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body.action).toBe('stop');
    expect(collab.isPresenting).toBe(false);
    vi.useRealTimers();
  });
});
