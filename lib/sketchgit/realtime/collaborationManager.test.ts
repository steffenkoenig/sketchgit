// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CollaborationManager, CollabCallbacks } from './collaborationManager';
import type { WsClient } from './wsClient';
import type { WsMessage, ConnectionStatus } from '../types';

// ─── Mock WsClient ────────────────────────────────────────────────────────────

function makeMockWs() {
  const ws = {
    name: 'TestUser',
    color: '#7c6eff',
    onMessage: null as ((data: WsMessage) => void) | null,
    onStatusChange: null as ((status: ConnectionStatus) => void) | null,
    onClientId: null as ((id: string) => void) | null,
    send: vi.fn(),
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

  it('welcome: sends profile and fullsync-request messages', () => {
    send(ws, { type: 'welcome', clientId: 'c1', roomId: 'r1' });
    const types = ws.send.mock.calls.map((c: unknown[]) => (c[0] as WsMessage).type);
    expect(types).toContain('profile');
    expect(types).toContain('fullsync-request');
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
    setupDom();
    ws = makeMockWs();
    cb = makeCallbacks();
    collab = new CollaborationManager(ws as unknown as WsClient, cb);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('immediate=true: sends draw message right away', () => {
    const canvas = JSON.stringify({ version: '5', objects: [{ _id: 'a', type: 'rect' }] });
    cb.getCanvasData.mockReturnValue(canvas);
    collab.broadcastDraw(true);
    // First broadcast with no snapshot → sends full 'draw'
    const types = ws.send.mock.calls.map((c: unknown[]) => (c[0] as WsMessage).type);
    expect(types).toContain('draw');
  });

  it('immediate=false: coalesces multiple calls into one flush', () => {
    const canvas = JSON.stringify({ version: '5', objects: [{ _id: 'a', type: 'rect' }] });
    cb.getCanvasData.mockReturnValue(canvas);
    collab.broadcastDraw(false);
    collab.broadcastDraw(false);
    collab.broadcastDraw(false);
    vi.runOnlyPendingTimers();
    // Only one flush should have happened
    expect(ws.send).toHaveBeenCalledTimes(1);
  });

  it('does nothing when socket is not connected', () => {
    ws.isConnected.mockReturnValue(false);
    collab.broadcastDraw(true);
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('sends draw-delta after second broadcast (snapshot already set)', () => {
    const canvas = JSON.stringify({ version: '5', objects: [{ _id: 'a', type: 'rect', fill: 'red' }] });
    cb.getCanvasData.mockReturnValue(canvas);
    collab.broadcastDraw(true); // sets the snapshot

    // Change the canvas
    const canvas2 = JSON.stringify({ version: '5', objects: [{ _id: 'a', type: 'rect', fill: 'blue' }] });
    cb.getCanvasData.mockReturnValue(canvas2);
    collab.broadcastDraw(true); // should send draw-delta
    const types = ws.send.mock.calls.map((c: unknown[]) => (c[0] as WsMessage).type);
    expect(types).toContain('draw-delta');
  });

  it('does not send draw-delta when canvas is unchanged', () => {
    const canvas = JSON.stringify({ version: '5', objects: [{ _id: 'a', type: 'rect', fill: 'red' }] });
    cb.getCanvasData.mockReturnValue(canvas);
    collab.broadcastDraw(true); // sets snapshot
    ws.send.mockClear();
    collab.broadcastDraw(true); // no changes
    expect(ws.send).not.toHaveBeenCalled();
  });
});

describe('CollaborationManager – broadcastCursor', () => {
  let ws: MockWs;
  let collab: CollaborationManager;

  beforeEach(() => {
    setupDom();
    ws = makeMockWs();
    collab = new CollaborationManager(ws as unknown as WsClient, makeCallbacks());
  });

  it('sends cursor message when connected and throttle window has passed', () => {
    const wrap = document.getElementById('canvas-wrap')!;
    vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0,
      toJSON: () => ({}),
    });
    (collab as unknown as { lastCursorSent: number }).lastCursorSent = 0;
    collab.broadcastCursor({ e: { clientX: 100, clientY: 200 } as MouseEvent });
    const types = ws.send.mock.calls.map((c: unknown[]) => (c[0] as WsMessage).type);
    expect(types).toContain('cursor');
  });

  it('drops cursor events within the throttle window', () => {
    const wrap = document.getElementById('canvas-wrap')!;
    vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0,
      toJSON: () => ({}),
    });
    (collab as unknown as { lastCursorSent: number }).lastCursorSent = Date.now(); // just sent
    collab.broadcastCursor({ e: { clientX: 100, clientY: 200 } as MouseEvent });
    const types = ws.send.mock.calls.map((c: unknown[]) => (c[0] as WsMessage).type);
    expect(types).not.toContain('cursor');
  });

  it('does nothing when socket is not connected', () => {
    ws.isConnected.mockReturnValue(false);
    collab.broadcastCursor({ e: { clientX: 10, clientY: 20 } as MouseEvent });
    expect(ws.send).not.toHaveBeenCalled();
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
    setupDom();
    const ws = makeMockWs();
    const cb = makeCallbacks();
    cb.getCanvasData.mockReturnValue(
      JSON.stringify({ version: '5', objects: [{ _id: 'a', type: 'rect' }] }),
    );
    const collab = new CollaborationManager(ws as unknown as WsClient, cb);

    // Schedule a pending draw flush
    collab.broadcastDraw(false);

    // Add a remote cursor element
    const layer = document.getElementById('cursor-layer')!;
    const el = document.createElement('div');
    el.id = 'rcursor-p1';
    layer.appendChild(el);
    (collab as unknown as { remoteCursors: Record<string, string> }).remoteCursors['p1'] = 'rcursor-p1';

    collab.destroy();

    // Timer should be cancelled (send should not be called)
    vi.runAllTimers();
    expect(ws.send).not.toHaveBeenCalled();

    // Cursor element should be removed
    expect(document.getElementById('rcursor-p1')).toBeNull();

    vi.useRealTimers();
  });
});
