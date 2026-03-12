/**
 * CollaborationCoordinator – manages user identity, WebSocket room setup,
 * and the collaboration panel UI.
 *
 * Responsibilities:
 *  - Store and broadcast the user's display name and avatar colour.
 *  - Initialise the canvas, git model, and WebSocket connection on startup.
 *  - Delegate to CollaborationManager for peer-panel interactions.
 */

import { AppContext } from './appContext';
import { BRANCH_COLORS } from '../types';
import { openModal, closeModal } from '../ui/modals';

export class CollaborationCoordinator {
  /** Current user's display name (mutable via setName()). */
  myName = 'User';
  /**
   * Avatar colour picked randomly at startup.
   * Math.random() is appropriate here – avatar colour is non-sensitive.
   */
  myColor: string = BRANCH_COLORS[Math.floor(Math.random() * BRANCH_COLORS.length)];

  /**
   * @param ctx     – shared subsystem references
   * @param refresh – re-renders timeline + updates UI (provided by app.ts wiring)
   */
  constructor(
    private readonly ctx: AppContext,
    private readonly refresh: () => void,
  ) {}

  // ─── Bootstrap ─────────────────────────────────────────────────────────────

  /** Initialise canvas, git model, and connect to the WebSocket room. */
  init(): void {
    const { canvas, git, collab, ws } = this.ctx;

    canvas.init();
    const initData = JSON.stringify({ version: '5.3.1', objects: [], background: '#0a0a0f' });
    git.init(initData);
    this.refresh();

    const initialRoom = collab.getRoomFromUrl();
    const inputEl = document.getElementById('remotePeerInput') as HTMLInputElement | null;
    if (inputEl) inputEl.value = initialRoom;
    const myPeerEl = document.getElementById('myPeerId');
    if (myPeerEl) myPeerEl.textContent = collab.roomInviteLink(initialRoom);
    ws.connect(initialRoom, this.myName, this.myColor);

    openModal('nameModal');
    // Guard against the timer firing outside a browser/jsdom environment
    // (e.g. after a test's jsdom environment is torn down).
    setTimeout(() => {
      if (typeof document !== 'undefined') {
        (document.getElementById('nameInput') as HTMLInputElement | null)?.focus();
      }
    }, 200);
  }

  // ─── Identity ──────────────────────────────────────────────────────────────

  setName(): void {
    const { ws } = this.ctx;
    const n = (document.getElementById('nameInput') as HTMLInputElement | null)?.value.trim();
    if (n) {
      this.myName = n;
      if (ws.isConnected()) {
        ws.send({ type: 'profile', name: this.myName, color: this.myColor });
      }
    }
    closeModal('nameModal');
  }

  // ─── Collaboration panel ───────────────────────────────────────────────────

  connectToPeer(): void {
    this.ctx.collab.connectToPeerUI(this.myName, this.myColor);
  }

  copyPeerId(): void {
    this.ctx.collab.copyPeerId();
  }

  toggleCollabPanel(): void {
    this.ctx.collab.toggleCollabPanel();
  }

  // P080 – Presenter mode
  togglePresenting(): void {
    this.ctx.collab.togglePresenting();
  }
}
