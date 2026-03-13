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
import { loadPreferences, savePreferences } from '../userPreferences';

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

    // Restore saved preferences for returning visitors (works for anonymous
    // users too – no account required).
    const prefs = loadPreferences();
    if (prefs) {
      if (prefs.name) this.myName = prefs.name;
      if (prefs.color) this.myColor = prefs.color;
    }

    canvas.init();
    const initData = JSON.stringify({ version: '5.3.1', objects: [], background: '#0a0a0f' });
    git.init(initData);
    this.refresh();

    // Fall back to the last-visited room when the URL carries no room param.
    const initialRoom = collab.getRoomFromUrl(prefs?.lastRoomId ?? '');
    const inputEl = document.getElementById('remotePeerInput') as HTMLInputElement | null;
    if (inputEl) inputEl.value = initialRoom;
    const myPeerEl = document.getElementById('myPeerId');
    if (myPeerEl) myPeerEl.textContent = collab.roomInviteLink(initialRoom);
    ws.connect(initialRoom, this.myName, this.myColor);

    if (prefs?.name) {
      // Returning visitor recognised — pre-fill the input in case they want
      // to change it later, but skip the blocking modal entirely.
      const nameInput = document.getElementById('nameInput') as HTMLInputElement | null;
      if (nameInput) nameInput.value = prefs.name;
    } else {
      openModal('nameModal');
      // Guard against the timer firing outside a browser/jsdom environment
      // (e.g. after a test's jsdom environment is torn down).
      setTimeout(() => {
        if (typeof document !== 'undefined') {
          (document.getElementById('nameInput') as HTMLInputElement | null)?.focus();
        }
      }, 200);
    }
  }

  // ─── Identity ──────────────────────────────────────────────────────────────

  setName(): void {
    const { ws, collab } = this.ctx;
    const n = (document.getElementById('nameInput') as HTMLInputElement | null)?.value.trim();
    if (n) {
      this.myName = n;
      // Persist so the name modal is skipped on the next visit.
      savePreferences({ name: n, color: this.myColor });
      if (ws.isConnected()) {
        collab.sendProfile(this.myName, this.myColor);
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
