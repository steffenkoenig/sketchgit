/**
 * wsClient – resilient WebSocket wrapper with automatic reconnection (P004).
 *
 * Features:
 *  - Exponential backoff with ±20 % jitter (1 s base → 30 s cap).
 *  - Up to 10 reconnection attempts, then surfaces a persistent error.
 *  - `onerror` handler (logs; actual reconnect is scheduled by `onclose`).
 *  - Outgoing message queue: messages sent while offline are buffered and
 *    flushed in-order on the next successful connection.
 *  - Heartbeat / keep-alive: if no message arrives within 35 seconds the
 *    connection is proactively closed so `onclose` triggers a reconnect.
 *    The server sends a `ping` every 25 seconds; the client responds with
 *    `pong`.  Stale TCP connections (zombie sockets) are caught this way.
 *  - Connection status events drive the UI badge without coupling to React.
 */

import { ConnectionStatus, WsMessage } from '../types';
import { showToast } from '../ui/toast';
import { logger } from '../logger';

// ─── Reconnect configuration ─────────────────────────────────────────────────

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
const BACKOFF_FACTOR = 2;
const HEARTBEAT_TIMEOUT_MS = 35_000; // close if no message in 35 s

// ─── WsClient ────────────────────────────────────────────────────────────────

export class WsClient {
  // ── Connection state ──────────────────────────────────────────────────────
  private socket: WebSocket | null = null;
  private roomId = 'default';
  private myName = 'User';
  private myColor = '#7c6eff';

  // ── Reconnection state ────────────────────────────────────────────────────
  private retryCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false; // true when disconnect() is called

  // ── Public getters for identity fields ───────────────────────────────────
  get name(): string { return this.myName; }
  get color(): string { return this.myColor; }

  // ── Heartbeat state ───────────────────────────────────────────────────────
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Outgoing message queue ────────────────────────────────────────────────
  private messageQueue: string[] = [];

  // ── Public callbacks ──────────────────────────────────────────────────────
  onMessage: ((data: WsMessage) => void) | null = null;
  onStatusChange: ((status: ConnectionStatus) => void) | null = null;
  onClientId: ((id: string) => void) | null = null;

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Open (or switch to) a room connection. Safe to call multiple times. */
  connect(roomId: string, myName: string, myColor: string): void {
    this.roomId = roomId;
    this.myName = myName;
    this.myColor = myColor;
    this.retryCount = 0;
    this.intentionalClose = false;
    this._openSocket();
  }

  /** Close the connection cleanly – no reconnect will be attempted. */
  disconnect(): void {
    this.intentionalClose = true;
    this._clearTimers();
    if (this.socket) {
      try { this.socket.close(); } catch { /* ignore */ }
      this.socket = null;
    }
    this._setStatus('offline');
  }

  /**
   * Send a message to the server.
   * If the socket is not open the message is queued and sent on reconnect.
   */
  send(data: WsMessage): void {
    const json = JSON.stringify(data);
    if (this.socket?.readyState === WebSocket.OPEN) {
      try { this.socket.send(json); } catch { /* ignore */ }
    } else {
      this.messageQueue.push(json);
    }
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private _buildUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const name = encodeURIComponent(this.myName || 'User');
    const color = encodeURIComponent(this.myColor || '#7c6eff');
    return `${protocol}//${host}/ws?room=${encodeURIComponent(this.roomId)}&name=${name}&color=${color}`;
  }

  private _openSocket(): void {
    this._clearTimers();
    this._setStatus(this.retryCount === 0 ? 'connecting' : 'reconnecting');

    const ws = new WebSocket(this._buildUrl());
    this.socket = ws;

    ws.addEventListener('open', () => {
      this.retryCount = 0;
      this.intentionalClose = false;
      this._setStatus('connected');
      this._resetHeartbeat();
      document.getElementById('liveInd')?.style.setProperty('display', 'block');

      // Flush queued messages
      while (this.messageQueue.length > 0) {
        const msg = this.messageQueue.shift()!;
        try { ws.send(msg); } catch { /* ignore */ }
      }
    });

    ws.addEventListener('message', (ev) => {
      this._resetHeartbeat();
      let data: WsMessage;
      try { data = JSON.parse(ev.data as string) as WsMessage; } catch { return; }

      // Heartbeat protocol: respond to server pings
      if (data.type === 'ping') {
        this.send({ type: 'pong' });
        return;
      }

      // P043 – server is about to restart; surface a brief informational toast.
      if (data.type === 'shutdown-warning') {
        showToast('🔄 Server restarting, reconnecting shortly…');
        return;
      }

      // P069 – room is at capacity; show error and suppress reconnect.
      if (data.type === 'error' && (data as WsMessage & { code?: string }).code === 'ROOM_FULL') {
        showToast('⚠ This room is full. Please try a different room.', true);
        this.intentionalClose = true;
        return;
      }

      this.onMessage?.(data);
    });

    ws.addEventListener('error', () => {
      // onerror is always followed by onclose; log and let onclose handle retry
      logger.warn('[WsClient] WebSocket error – will retry on close');
    });

    ws.addEventListener('close', (ev) => {
      this._clearHeartbeat();
      document.getElementById('liveInd')?.style.setProperty('display', 'none');

      if (this.intentionalClose) return; // clean disconnect, do not retry

      this._scheduleReconnect(ev.code);
    });
  }

  private _scheduleReconnect(closeCode: number): void {
    if (this.retryCount >= MAX_RETRIES) {
      this._setStatus('offline');
      showToast('🔴 Connection lost. Please refresh.', true);
      const peerStatus = document.getElementById('peerStatus');
      if (peerStatus) {
        peerStatus.textContent = '🔴 Offline — refresh to reconnect';
        peerStatus.className = 'peer-status err';
      }
      return;
    }

    this.retryCount += 1;
    this._setStatus('reconnecting');

    // Exponential backoff with ±20 % jitter
    const base = Math.min(BASE_DELAY_MS * BACKOFF_FACTOR ** (this.retryCount - 1), MAX_DELAY_MS);
    const jitter = base * 0.2 * (Math.random() * 2 - 1);
    const delay = Math.round(base + jitter);

    const peerStatus = document.getElementById('peerStatus');
    if (peerStatus) {
      peerStatus.textContent = `🟡 Reconnecting (${this.retryCount}/${MAX_RETRIES})…`;
      peerStatus.className = 'peer-status reconnecting';
    }

    if (closeCode !== 1000 && closeCode !== 1001) {
      // Non-clean close (e.g. 1006 = abnormal) — show toast on first retry
      if (this.retryCount === 1) {
        showToast(`🟡 Disconnected — reconnecting…`);
      }
    }

    this.reconnectTimer = setTimeout(() => this._openSocket(), delay);
  }

  private _resetHeartbeat(): void {
    this._clearHeartbeat();
    this.heartbeatTimer = setTimeout(() => {
      // No message received in HEARTBEAT_TIMEOUT_MS — assume zombie connection
      logger.warn('[WsClient] Heartbeat timeout — closing socket');
      try { this.socket?.close(); } catch { /* ignore */ }
    }, HEARTBEAT_TIMEOUT_MS);
  }

  private _clearHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private _clearTimers(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._clearHeartbeat();
  }

  private _setStatus(status: ConnectionStatus): void {
    this.onStatusChange?.(status);
  }
}
