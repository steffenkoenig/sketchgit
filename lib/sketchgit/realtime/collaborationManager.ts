/**
 * collaborationManager – routes WebSocket messages to the right subsystems
 * and manages cursor rendering and presence UI.
 */

import { WsMessage, PresenceClient } from '../types';
import { WsClient } from './wsClient';
import { showToast } from '../ui/toast';

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

        this.ws.send({ type: 'profile', name: this.ws['myName'], color: this.ws['myColor'] });
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
    el.innerHTML =
      `<div class="rcursor-tip" style="border-bottom-color:${data.color}"></div>` +
      `<div class="rcursor-name" style="background:${data.color}">${data.name}</div>`;
    el.style.left = data.x + 'px';
    el.style.top = data.y + 'px';
  }

  // ─── Broadcast helpers ────────────────────────────────────────────────────

  broadcastDraw(): void {
    if (!this.ws.isConnected()) return;
    this.ws.send({ type: 'draw', canvas: this.cb.getCanvasData() });
  }

  broadcastCursor(e: { e: MouseEvent }): void {
    if (!this.ws.isConnected()) return;
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
      list.innerHTML = others
        .map(
          (c) =>
            `<div class="connected-peer">` +
            `<div style="width:6px;height:6px;background:${c.color || 'var(--a3)'};border-radius:50%"></div>` +
            `${(c.name || 'User').slice(0, 20)}` +
            `</div>`,
        )
        .join('');
    }

    const row = document.getElementById('avatarRow');
    if (row) {
      row.innerHTML = others
        .slice(0, 4)
        .map(
          (c) =>
            `<div class="av" style="background:${c.color || '#7c6eff'}">` +
            `${(c.name || 'U').slice(0, 1).toUpperCase()}` +
            `</div>`,
        )
        .join('');
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
}
