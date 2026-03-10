/**
 * collaborationManager – routes WebSocket messages to the right subsystems
 * and manages cursor rendering and presence UI.
 */

import { WsMessage, PresenceClient } from '../types';
import { WsClient } from './wsClient';
import { showToast } from '../ui/toast';

// ─── Throttle constants (P006) ────────────────────────────────────────────────

/** Max cursor broadcast frequency: 10 updates / second = 100 ms minimum interval. */
const CURSOR_THROTTLE_MS = 100;

/** Max draw-delta broadcast frequency during active drawing: ~10 frames / second. */
const DRAW_THROTTLE_MS = 100;

// ─── Callbacks injected by the orchestrator ───────────────────────────────────

export interface CollabCallbacks {
  getCanvasData: () => string;
  loadCanvasData: (data: string) => void;
  renderTimeline: () => void;
  updateUI: () => void;
  /** Return current git state snapshot for fullsync-request replies. */
  getGitState: () => { commits: Record<string, unknown>; branches: Record<string, string>; HEAD: string; detached: string | null };
  /** Apply a fullsync payload from another peer or the server. */
  applyGitState: (state: { commits: Record<string, unknown>; branches: Record<string, string>; HEAD: string; detached: string | null }) => void;
  /** Called when a peer broadcasts a commit we don't have yet. */
  receiveCommit: (sha: string, commit: unknown) => void;
}

export class CollaborationManager {
  wsClientId: string | null = null;
  currentRoomId = 'default';

  private presenceClients: PresenceClient[] = [];
  private remoteCursors: Record<string, string> = {}; // clientId → element id
  private collabOpen = false;

  private readonly ws: WsClient;
  private readonly cb: CollabCallbacks;

  // ─── P006: draw-delta state ───────────────────────────────────────────────
  /**
   * Snapshot of the last broadcast canvas state, keyed by object id.
   * Stores both the serialised string (for O(1) change detection) and the
   * parsed object (for property-level diff without re-parsing).
   */
  private lastBroadcastSnapshot: Record<string, { json: string; obj: Record<string, unknown> }> = {};
  /** Pending draw-delta flush timer. */
  private drawFlushTimer: ReturnType<typeof setTimeout> | null = null;

  // ─── P006: cursor throttle state ─────────────────────────────────────────
  private lastCursorSent = 0;

  constructor(ws: WsClient, callbacks: CollabCallbacks) {
    this.ws = ws;
    this.cb = callbacks;

    this.ws.onMessage = (data) => this.handleMessage(data);
    this.ws.onStatusChange = (status) => this.handleStatusChange(status);
  }

  // ─── Message routing ──────────────────────────────────────────────────────

  private handleMessage(data: WsMessage): void {
    switch (data.type) {
      case 'welcome': {
        this.wsClientId = data.clientId as string;
        this.currentRoomId = (data.roomId as string) || this.currentRoomId;
        const link = this.roomInviteLink(this.currentRoomId);

        const myPeerEl = document.getElementById('myPeerId');
        if (myPeerEl) myPeerEl.textContent = link;

        // Reflect room id in the URL bar
        const url = new URL(window.location.href);
        url.searchParams.set('room', this.currentRoomId);
        window.history.replaceState({}, '', url.toString());

        const peerStatus = document.getElementById('peerStatus');
        if (peerStatus) {
          peerStatus.textContent = `✓ Connected to room '${this.currentRoomId}'`;
          peerStatus.className = 'peer-status ok';
        }

        this.ws.send({ type: 'profile', name: this.ws.name, color: this.ws.color });
        this.ws.send({ type: 'fullsync-request', senderId: this.wsClientId });
        break;
      }

      case 'presence': {
        this.presenceClients = Array.isArray(data.clients)
          ? (data.clients as PresenceClient[])
          : [];
        this.updateCollabUI();
        // Remove stale remote cursors
        const ids = new Set(this.presenceClients.map((c) => c.clientId));
        for (const id of Object.keys(this.remoteCursors)) {
          if (!ids.has(id)) {
            document.getElementById(this.remoteCursors[id])?.remove();
            delete this.remoteCursors[id];
          }
        }
        break;
      }

      case 'user-left': {
        const leftId = data.clientId as string;
        if (this.remoteCursors[leftId]) {
          document.getElementById(this.remoteCursors[leftId])?.remove();
          delete this.remoteCursors[leftId];
        }
        break;
      }

      case 'cursor': {
        this.updateRemoteCursor(data.senderId as string, {
          x: data.x as number,
          y: data.y as number,
          name: (data.senderName as string) || 'User',
          color: (data.senderColor as string) || '#7c6eff',
        });
        break;
      }

      case 'draw': {
        this.cb.loadCanvasData(data.canvas as string);
        this.cb.renderTimeline();
        break;
      }

      case 'draw-delta': {
        // Apply an incremental canvas delta from a peer (P006).
        this._applyDrawDelta(
          data.added as Record<string, unknown>[] | undefined,
          data.modified as Record<string, unknown>[] | undefined,
          data.removed as string[] | undefined,
        );
        break;
      }

      case 'commit': {
        this.cb.receiveCommit(data.sha as string, data.commit);
        this.cb.renderTimeline();
        showToast('📥 Commit received: ' + (data.commit as { message: string })?.message);
        break;
      }

      case 'fullsync-request': {
        const gitState = this.cb.getGitState();
        this.ws.send({
          type: 'fullsync',
          targetId: data.senderId as string,
          commits: gitState.commits,
          branches: gitState.branches,
          HEAD: gitState.HEAD,
          detached: gitState.detached,
        });
        break;
      }

      case 'fullsync': {
        if (data.targetId && data.targetId !== this.wsClientId) break;
        this.cb.applyGitState({
          commits: (data.commits as Record<string, unknown>) || {},
          branches: (data.branches as Record<string, string>) || {},
          HEAD: data.HEAD as string,
          detached: (data.detached as string | null) ?? null,
        });
        // Reset delta snapshot so the next broadcast is a full draw.
        this.lastBroadcastSnapshot = {};
        this.cb.renderTimeline();
        this.cb.updateUI();
        break;
      }

      default:
        break;
    }
  }

  private handleStatusChange(status: import('../types').ConnectionStatus): void {
    const liveInd = document.getElementById('liveInd');
    if (liveInd) {
      liveInd.style.display = status === 'connected' ? 'block' : 'none';
    }

    if (status === 'offline' || status === 'connecting') {
      this.presenceClients = [];
      this.updateCollabUI();
    }
  }

  // ─── Cursor rendering ─────────────────────────────────────────────────────

  private updateRemoteCursor(clientId: string, data: { x: number; y: number; name: string; color: string }): void {
    if (!clientId || clientId === this.wsClientId) return;
    const layer = document.getElementById('cursor-layer');
    if (!layer) return;

    let el = document.getElementById('rcursor-' + clientId);
    if (!el) {
      el = document.createElement('div');
      el.className = 'rcursor';
      el.id = 'rcursor-' + clientId;
      layer.appendChild(el);
      this.remoteCursors[clientId] = el.id;
    }
    el.replaceChildren();
    const tip = document.createElement('div');
    tip.className = 'rcursor-tip';
    tip.style.borderBottomColor = data.color;
    const nameEl = document.createElement('div');
    nameEl.className = 'rcursor-name';
    nameEl.style.background = data.color;
    nameEl.textContent = data.name;
    el.appendChild(tip);
    el.appendChild(nameEl);
    el.style.left = data.x + 'px';
    el.style.top = data.y + 'px';
  }

  // ─── Broadcast helpers (P006) ─────────────────────────────────────────────

  /**
   * Schedule a draw-delta broadcast.  Calls are coalesced: at most one flush
   * fires every DRAW_THROTTLE_MS milliseconds.  Pass `immediate = true` on
   * mouse-up / end-of-stroke to send the final state right away.
   */
  broadcastDraw(immediate = false): void {
    if (!this.ws.isConnected()) return;

    if (immediate) {
      if (this.drawFlushTimer !== null) {
        clearTimeout(this.drawFlushTimer);
        this.drawFlushTimer = null;
      }
      this._flushDrawDelta();
      return;
    }

    if (this.drawFlushTimer === null) {
      this.drawFlushTimer = setTimeout(() => {
        this.drawFlushTimer = null;
        this._flushDrawDelta();
      }, DRAW_THROTTLE_MS);
    }
  }

  /** Compute and transmit a draw-delta (or full `draw` if snapshot is empty). */
  private _flushDrawDelta(): void {
    if (!this.ws.isConnected()) return;

    const canvasJson = this.cb.getCanvasData();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(canvasJson) as Record<string, unknown>;
    } catch {
      console.warn('[CollabManager] Failed to parse canvas JSON for delta');
      return;
    }
    const objects = (parsed.objects as Record<string, unknown>[] | undefined) ?? [];

    // Build current snapshot: id → { json, obj } in a single pass.
    const currentSnapshot: Record<string, { json: string; obj: Record<string, unknown> }> = {};
    for (const obj of objects) {
      const id = obj._id as string | undefined;
      if (id) currentSnapshot[id] = { json: JSON.stringify(obj), obj };
    }

    const prev = this.lastBroadcastSnapshot;

    // If we have no prior snapshot, fall back to a full `draw` message.
    if (Object.keys(prev).length === 0 && objects.length > 0) {
      this.ws.send({ type: 'draw', canvas: canvasJson });
      this.lastBroadcastSnapshot = currentSnapshot;
      return;
    }

    const added: Record<string, unknown>[] = [];
    // `modified` carries only the _id plus changed properties (minimal patch).
    const modified: Record<string, unknown>[] = [];
    const removed: string[] = [];

    for (const [id, { json, obj: currObj }] of Object.entries(currentSnapshot)) {
      if (!prev[id]) {
        // New object — send full JSON so the peer can add it.
        added.push(currObj);
      } else if (prev[id].json !== json) {
        // Changed object — diff properties against the stored parsed copy
        // (no re-parsing needed).
        const prevObj = prev[id].obj;
        const patch: Record<string, unknown> = { _id: id };
        for (const [k, v] of Object.entries(currObj)) {
          if (k === '_id') continue;
          const pv = prevObj[k];
          // Fast path: primitive equality; slow path: stringify nested structures.
          if (pv !== v && (typeof v !== 'object' || typeof pv !== 'object' || JSON.stringify(pv) !== JSON.stringify(v))) {
            patch[k] = v;
          }
        }
        if (Object.keys(patch).length > 1) modified.push(patch);
      }
    }
    for (const id of Object.keys(prev)) {
      if (!currentSnapshot[id]) removed.push(id);
    }

    if (added.length === 0 && modified.length === 0 && removed.length === 0) return;

    this.ws.send({ type: 'draw-delta', added, modified, removed });
    this.lastBroadcastSnapshot = currentSnapshot;
  }

  /** Apply an incoming draw-delta from a peer by patching the current canvas. */
  private _applyDrawDelta(
    added: Record<string, unknown>[] = [],
    modified: Record<string, unknown>[] = [],
    removed: string[] = [],
  ): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(this.cb.getCanvasData()) as Record<string, unknown>;
    } catch {
      console.warn('[CollabManager] Failed to parse canvas JSON for delta apply');
      return;
    }

    const objects = (parsed.objects as Record<string, unknown>[] | undefined) ?? [];
    const objMap: Record<string, Record<string, unknown>> = {};
    for (const obj of objects) {
      const id = obj._id as string | undefined;
      if (id) objMap[id] = obj;
    }

    for (const obj of added) {
      const id = obj._id as string | undefined;
      if (id) objMap[id] = obj;
    }
    for (const obj of modified) {
      const id = obj._id as string | undefined;
      if (id) objMap[id] = { ...(objMap[id] ?? {}), ...obj };
    }
    for (const id of removed) {
      delete objMap[id];
    }

    parsed.objects = Object.values(objMap);
    this.cb.loadCanvasData(JSON.stringify(parsed));

    // Reset snapshot so the next local broadcast is a full `draw` rather than
    // diffing against a now-stale pre-peer-update baseline.
    this.lastBroadcastSnapshot = {};
  }

  /**
   * Throttled cursor broadcast: at most one message every CURSOR_THROTTLE_MS.
   */
  broadcastCursor(e: { e: MouseEvent }): void {
    if (!this.ws.isConnected()) return;
    const now = Date.now();
    if (now - this.lastCursorSent < CURSOR_THROTTLE_MS) return;
    this.lastCursorSent = now;

    const rect = document.getElementById('canvas-wrap')?.getBoundingClientRect();
    if (!rect) return;
    this.ws.send({
      type: 'cursor',
      x: e.e.clientX - rect.left,
      y: e.e.clientY - rect.top,
    });
  }

  // ─── Presence UI ──────────────────────────────────────────────────────────

  updateCollabUI(): void {
    const others = this.presenceClients.filter((c) => c.clientId !== this.wsClientId);

    const list = document.getElementById('connectedList');
    if (list) {
      list.replaceChildren();
      for (const c of others) {
        const peer = document.createElement('div');
        peer.className = 'connected-peer';
        const dot = document.createElement('div');
        dot.style.width = '6px';
        dot.style.height = '6px';
        dot.style.background = c.color || 'var(--a3)';
        dot.style.borderRadius = '50%';
        peer.appendChild(dot);
        peer.appendChild(document.createTextNode((c.name || 'User').slice(0, 20)));
        list.appendChild(peer);
      }
    }

    const row = document.getElementById('avatarRow');
    if (row) {
      row.replaceChildren();
      for (const c of others.slice(0, 4)) {
        const av = document.createElement('div');
        av.className = 'av';
        av.style.background = c.color || '#7c6eff';
        av.textContent = (c.name || 'U').slice(0, 1).toUpperCase();
        row.appendChild(av);
      }
    }
  }

  // ─── Room management ──────────────────────────────────────────────────────

  roomInviteLink(roomId: string): string {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    return url.toString();
  }

  sanitizeRoomId(value: string): string {
    const cleaned = (value || 'default').trim().slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, '-');
    return cleaned || 'default';
  }

  getRoomFromUrl(): string {
    const params = new URLSearchParams(window.location.search);
    const raw = (params.get('room') || '').trim();
    return this.sanitizeRoomId(raw || 'default');
  }

  copyPeerId(): void {
    const link = this.roomInviteLink(this.currentRoomId || 'default');
    navigator.clipboard.writeText(link).then(() => showToast('✓ Invite link copied'));
  }

  toggleCollabPanel(): void {
    this.collabOpen = !this.collabOpen;
    document.getElementById('collab-panel')?.classList.toggle('open', this.collabOpen);
  }

  connectToPeerUI(myName: string, myColor: string): void {
    const input = document.getElementById('remotePeerInput') as HTMLInputElement | null;
    const requestedRoom = this.sanitizeRoomId(
      (input?.value ?? '').trim() || this.currentRoomId || 'default',
    );
    if (input) input.value = requestedRoom;

    if (this.ws.isConnected() && requestedRoom === this.currentRoomId) {
      showToast('Already connected to this room');
      return;
    }

    const peerStatus = document.getElementById('peerStatus');
    if (peerStatus) {
      peerStatus.textContent = 'Connecting…';
      peerStatus.className = 'peer-status';
    }

    this.ws.connect(requestedRoom, myName, myColor);
  }

  closeExternalCursors(): void {
    for (const id of Object.keys(this.remoteCursors)) {
      document.getElementById(this.remoteCursors[id])?.remove();
    }
    this.remoteCursors = {};
  }

  // P020: Release all resources held by this manager.
  destroy(): void {
    // Cancel any pending draw-delta flush timer.
    if (this.drawFlushTimer !== null) {
      clearTimeout(this.drawFlushTimer);
      this.drawFlushTimer = null;
    }
    // Remove all remote cursor DOM elements.
    for (const elId of Object.values(this.remoteCursors)) {
      document.getElementById(elId)?.remove();
    }
    this.remoteCursors = {};
    this.lastBroadcastSnapshot = {};
  }
}
