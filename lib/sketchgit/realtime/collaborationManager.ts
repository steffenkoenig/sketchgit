/**
 * collaborationManager – routes WebSocket messages to the right subsystems
 * and manages cursor rendering and presence UI.
 */

import { WsMessage, PresenceClient } from '../types';
import { WsClient } from './wsClient';
import { showToast } from '../ui/toast';
import { logger } from '../logger';

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
  /**
   * P053 – Apply a branch pointer update received from a peer (rollback relay).
   * Only called when `isRollback` is true in the branch-update message.
   */
  applyBranchUpdate: (branch: string, headSha: string) => void;
  /** P067 – Apply a remote object lock (visual indicator). */
  applyRemoteLock?: (clientId: string, objectIds: string[], color: string) => void;
  /** P067 – Clear a remote object lock. */
  clearRemoteLock?: (clientId: string) => void;
  /** P080 – Apply a remote viewport transform (presenter follow mode). */
  applyViewport?: (vpt: [number, number, number, number, number, number]) => void;
  /** P080 – Return the current local canvas viewport for broadcasting. */
  getViewport?: () => [number, number, number, number, number, number];
}

export class CollaborationManager {
  wsClientId: string | null = null;
  currentRoomId = 'default';

  private presenceClients: PresenceClient[] = [];
  private remoteCursors: Record<string, string> = {}; // clientId → element id
  private collabOpen = false;

  private readonly ws: WsClient;
  private readonly cb: CollabCallbacks;

  // ── P067: Auto-expire timers for remote object locks ─────────────────────
  private lockExpireTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // ── P080: Presenter / follower state ─────────────────────────────────────
  private _isPresenting = false;
  private followingClientId: string | null = null;
  private viewSyncTimer: ReturnType<typeof setInterval> | null = null;
  /** clientId of the active presenter in this room (null = no active presenter) */
  private presenterClientId: string | null = null;

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
        // P079 – announce current branch to the server so presence is accurate
        const gitState = this.cb.getGitState();
        const initBranch = gitState.detached ? undefined : gitState.HEAD;
        const initHeadSha = initBranch ? (gitState.branches[initBranch] ?? null) : null;
        if (initBranch) {
          this.ws.send({ type: 'profile', name: this.ws.name, color: this.ws.color, branch: initBranch, headSha: initHeadSha });
        }
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
        // P067 – clear lock for the departed peer
        if (leftId) {
          clearTimeout(this.lockExpireTimers.get(leftId));
          this.lockExpireTimers.delete(leftId);
          this.cb.clearRemoteLock?.(leftId);
        }
        // P080 – if the presenter left, exit follow mode
        if (this.followingClientId === leftId) this.followingClientId = null;
        if (this.presenterClientId === leftId) this.presenterClientId = null;
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

      // P053 – handle branch pointer updates (rollback/switch) from peers
      case 'branch-update': {
        if (data.isRollback && typeof data.branch === 'string' && typeof data.headSha === 'string') {
          this.cb.applyBranchUpdate(data.branch, data.headSha);
        }
        this.cb.renderTimeline();
        this.cb.updateUI();
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
        // P067 – object lock/unlock messages
        if (data.type === 'object-lock') {
          const senderId = data.senderId as string;
          if (senderId && senderId !== this.wsClientId) {
            const objectIds = (data.objectIds as string[]) ?? [];
            const color = (data.senderColor as string) || (data.color as string) || '#fbbf24';
            this.cb.applyRemoteLock?.(senderId, objectIds, color);
            clearTimeout(this.lockExpireTimers.get(senderId));
            const timer = setTimeout(() => {
              this.cb.clearRemoteLock?.(senderId);
              this.lockExpireTimers.delete(senderId);
            }, 5_000);
            this.lockExpireTimers.set(senderId, timer);
          }
          break;
        }
        if (data.type === 'object-unlock') {
          const senderId = data.senderId as string;
          if (senderId) {
            clearTimeout(this.lockExpireTimers.get(senderId));
            this.lockExpireTimers.delete(senderId);
            this.cb.clearRemoteLock?.(senderId);
          }
          break;
        }

        // P080 – presenter / follow mode messages
        if (data.type === 'follow-request') {
          const presenterName = (data.senderName as string) || 'A peer';
          const senderId = data.senderId as string;
          this.presenterClientId = senderId;
          // Auto-follow: immediately start following the presenter.
          // A future enhancement can show a dismiss button instead.
          this.followingClientId = senderId;
          this.ws.send({ type: 'follow-accept' });
          showToast(`${presenterName} is presenting — following their view`);
          break;
        }
        if (data.type === 'follow-stop') {
          if (this.followingClientId === data.senderId) {
            this.followingClientId = null;
            this.presenterClientId = null;
          }
          break;
        }
        if (data.type === 'view-sync') {
          if (this.followingClientId === data.senderId) {
            const vpt = data.vpt as [number, number, number, number, number, number];
            if (Array.isArray(vpt) && vpt.length === 6) {
              this.cb.applyViewport?.(vpt);
            }
          }
          break;
        }
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
      // P067 – clear all remote locks when disconnected
      for (const [id, timer] of this.lockExpireTimers) {
        clearTimeout(timer);
        this.cb.clearRemoteLock?.(id);
      }
      this.lockExpireTimers.clear();
      // P080 – stop presenting / following when disconnected
      this._stopPresenting();
      this.followingClientId = null;
      this.presenterClientId = null;
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
      logger.warn('[CollabManager] Failed to parse canvas JSON for delta');
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

    // P073 – use sendBatched so a concurrent cursor update is coalesced into
    // a single WebSocket frame (same microtask tick).
    this.ws.sendBatched({ type: 'draw-delta', added, modified, removed });
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
      logger.warn('[CollabManager] Failed to parse canvas JSON for delta apply');
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
    // P073 – use sendBatched to coalesce with a concurrent draw-delta.
    this.ws.sendBatched({
      type: 'cursor',
      x: e.e.clientX - rect.left,
      y: e.e.clientY - rect.top,
    });
    // P080 – any canvas interaction while following exits follow mode
    if (this.followingClientId) this.exitFollowMode();
  }

  // P067 – broadcast that the local user selected objects (object-lock)
  broadcastLock(objectIds: string[]): void {
    if (!this.ws.isConnected() || objectIds.length === 0) return;
    this.ws.sendBatched({ type: 'object-lock', objectIds });
  }

  // P067 – broadcast that the local user deselected objects (object-unlock)
  broadcastUnlock(): void {
    if (!this.ws.isConnected()) return;
    this.ws.sendBatched({ type: 'object-unlock' });
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

        // Colour dot
        const dot = document.createElement('div');
        dot.style.cssText = `width:6px;height:6px;background:${c.color || 'var(--a3)'};border-radius:50%;flex-shrink:0`;
        peer.appendChild(dot);

        // Name + branch column
        const info = document.createElement('div');
        info.style.cssText = 'display:flex;flex-direction:column;overflow:hidden';

        const nameEl = document.createElement('span');
        nameEl.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.8rem';
        nameEl.textContent = (c.name || 'User').slice(0, 20);
        info.appendChild(nameEl);

        // P079 – branch label
        if (c.branch) {
          const branchEl = document.createElement('span');
          branchEl.style.cssText = 'font-size:0.65rem;color:var(--a1,#7c6eff);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0.8';
          branchEl.textContent = '\u23b7 ' + c.branch.slice(0, 24);
          info.appendChild(branchEl);
        }

        peer.appendChild(info);
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

  // P079 – Presence accessors used by BranchCoordinator
  getPresenceClients(): PresenceClient[] {
    return [...this.presenceClients];
  }

  getMyClientId(): string {
    return this.wsClientId ?? '';
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
    void navigator.clipboard.writeText(link).then(() => showToast('✓ Invite link copied'));
  }

  toggleCollabPanel(): void {
    this.collabOpen = !this.collabOpen;
    document.getElementById('collab-panel')?.classList.toggle('open', this.collabOpen);
  }

  // ── P080: Presenter mode ──────────────────────────────────────────────────

  get isPresenting(): boolean { return this._isPresenting; }

  /** Broadcast a follow-request to all room peers and start sending view-sync at 8 Hz. */
  startPresenting(): void {
    if (this._isPresenting) return;
    this._isPresenting = true;
    this.ws.send({ type: 'follow-request' });
    // Update the "Present" button visual
    document.getElementById('presentBtn')?.classList.add('presenting');
    // Broadcast viewport at 8 Hz while presenting
    this.viewSyncTimer = setInterval(() => {
      const vpt = this.cb.getViewport?.();
      if (vpt) {
        const gitState = this.cb.getGitState();
        this.ws.sendBatched({
          type: 'view-sync',
          vpt,
          branch: gitState.detached ? undefined : gitState.HEAD,
          // detached is the commit SHA string when in detached HEAD; null for a normal branch.
          headSha: gitState.detached !== null
            ? gitState.detached
            : (gitState.branches[gitState.HEAD] ?? null),
        });
      }
    }, 125); // 1000ms / 8 = 125ms
  }

  /** Stop presenting and notify all followers. */
  private _stopPresenting(): void {
    if (!this._isPresenting) return;
    this._isPresenting = false;
    if (this.viewSyncTimer !== null) {
      clearInterval(this.viewSyncTimer);
      this.viewSyncTimer = null;
    }
    document.getElementById('presentBtn')?.classList.remove('presenting');
  }

  stopPresenting(): void {
    this._stopPresenting();
    this.ws.send({ type: 'follow-stop' });
  }

  /** Toggle presenter mode from the UI button. */
  togglePresenting(): void {
    if (this._isPresenting) {
      this.stopPresenting();
    } else {
      this.startPresenting();
    }
  }

  /** Exit follow mode (triggered by local interaction while following). */
  exitFollowMode(): void {
    if (!this.followingClientId) return;
    this.followingClientId = null;
    this.presenterClientId = null;
    showToast('Exited follow mode');
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
