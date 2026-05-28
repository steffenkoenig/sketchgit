/**
 * CommitCoordinator – owns the commit-popup and commit-modal workflows.
 *
 * Responsibilities:
 *  - Show/hide the floating commit-info popup when the user clicks a node.
 *  - Open the commit message modal and persist a new commit.
 *  - Delegate popup actions (checkout, branch-from, rollback) to their
 *    respective subsystems.
 *
 * Cross-coordinator calls are handled via constructor callbacks so that
 * CommitCoordinator can be instantiated and tested without importing
 * BranchCoordinator directly.
 */

import { AppContext } from './appContext';
import { showToast } from '../ui/toast';
import { openModal, closeModal } from '../ui/modals';

export class CommitCoordinator {
  /** SHA of the commit whose popup is currently open; null when closed. */
  private popupSHA: string | null = null;

  /**
   * P055 – Pending confirmation callback; set by showConfirm() and consumed by
   * acceptConfirm() / cancelConfirm().
   */
  private pendingConfirm: ((confirmed: boolean) => void) | null = null;

  /**
   * @param ctx              – shared subsystem references
   * @param refresh          – re-renders timeline + updates UI (provided by app.ts wiring)
   * @param openBranchCreate – delegate to BranchCoordinator.openBranchCreate()
   */
  constructor(
    private readonly ctx: AppContext,
    private readonly refresh: () => void,
    private readonly openBranchCreate: (fromSha: string | null) => void,
  ) {}

  // ─── Commit popup ──────────────────────────────────────────────────────────

  openCommitPopup(sha: string, screenX: number, screenY: number): void {
    this.popupSHA = sha;
    const { git } = this.ctx;
    const c = git.commits[sha];
    if (!c) return;

    const isHead = sha === git.currentSHA();
    const headBadge = document.getElementById('cp-head-badge');
    if (headBadge) headBadge.style.display = isHead ? 'inline-flex' : 'none';

    const shaEl = document.getElementById('cp-sha');
    if (shaEl) shaEl.textContent = sha.slice(0, 12) + '…';
    const msgEl = document.getElementById('cp-msg');
    if (msgEl) msgEl.textContent = c.message;
    const d = new Date(c.ts);
    const metaEl = document.getElementById('cp-meta');
    if (metaEl) {
      metaEl.textContent =
        `${c.branch} · ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    const popup = document.getElementById('commit-popup');
    if (popup) {
      popup.classList.add('open');
      const pw = 230, ph = 180;
      let x = screenX - pw / 2;
      let y = screenY - ph - 14;
      x = Math.max(8, Math.min(x, window.innerWidth - pw - 8));
      if (y < 8) y = screenY + 18;
      popup.style.left = x + 'px';
      popup.style.top = y + 'px';
    }
  }

  closeCommitPopup(): void {
    document.getElementById('commit-popup')?.classList.remove('open');
    this.popupSHA = null;
  }

  /** Checkout the commit currently shown in the popup. */
  cpCheckout(): void {
    if (!this.popupSHA) return;
    const { git, canvas, ws } = this.ctx;
    const sha = this.popupSHA;
    this.closeCommitPopup();
    if (sha === git.currentSHA()) { showToast('Already at this commit'); return; }

    // If this commit is the tip of a branch, simply switch to that branch
    // rather than entering detached HEAD state.
    const branchEntry = Object.entries(git.branches).find(([, tipSha]) => tipSha === sha);
    if (branchEntry) {
      const [branchName] = branchEntry;
      git.checkout(branchName);
      canvas.loadCanvasData(git.commits[sha].canvas);
      canvas.clearDirty();
      this.refresh();
      showToast(`Switched to branch '${branchName}'`);
      ws.send({ type: 'branch-update', branch: branchName, headSha: sha, isRollback: false });
      return;
    }

    // Older commit (not a branch tip) – enter detached HEAD; drawing will
    // automatically prompt the user to create a new branch.
    git.checkoutCommit(sha);
    canvas.loadCanvasData(git.commits[sha].canvas);
    canvas.clearDirty();
    this.refresh();
    showToast('⤵ Viewing commit ' + sha.slice(0, 7) + ' — draw to auto-create a branch');
    // P053 – notify peers of detached HEAD checkout
    ws.send({ type: 'branch-update', branch: null, headSha: sha, detached: true });
  }

  /** Open the branch-create modal from the current popup commit. */
  cpBranchFrom(): void {
    if (!this.popupSHA) return;
    const fromSha = this.popupSHA;
    this.closeCommitPopup();
    this.openBranchCreate(fromSha);
  }

  /**
   * Open the share modal pre-filled with the commit currently shown in the popup.
   * Fires a DOM custom event so the React shell can update its state without
   * creating a hard import dependency between canvas-side code and React.
   */
  cpShareCommit(): void {
    if (!this.popupSHA) return;
    const sha = this.popupSHA;
    this.closeCommitPopup();
    document.dispatchEvent(
      new CustomEvent('sketchgit:openShareModal', { detail: { commitSha: sha } }),
    );
  }

  /** Roll back the current branch tip to the commit shown in the popup. */
  cpRollback(): void {
    if (!this.popupSHA) return;
    const { git } = this.ctx;
    const sha = this.popupSHA;
    if (git.detached) { showToast('⚠ Not on a branch', true); this.closeCommitPopup(); return; }

    const branch = git.HEAD;
    this.closeCommitPopup();

    // P055 – open accessible confirm modal instead of window.confirm()
    this.showConfirm(
      `Rollback branch '${branch}' to ${sha.slice(0, 7)}? This cannot be undone.`,
      '⚠ Rollback',
      (confirmed) => {
        if (!confirmed) return;
        const { git: g, canvas, ws } = this.ctx;
        g.branches[branch] = sha;
        g.detached = null;
        canvas.loadCanvasData(g.commits[sha].canvas);
        canvas.clearDirty();
        this.refresh();
        showToast('Rolled back to ' + sha.slice(0, 7));
        // P053 – notify peers that this branch tip was rolled back
        ws.send({ type: 'branch-update', branch, headSha: sha, isRollback: true });
      },
    );
  }

  // ─── Commit modal ──────────────────────────────────────────────────────────

  openCommitModal(): void {
    if (!this.ctx.canvas.isDirty) { showToast('Nothing new to commit'); return; }
    const msgEl = document.getElementById('commitMsg') as HTMLInputElement | null;
    if (msgEl) msgEl.value = '';
    openModal('commitModal');
    setTimeout(() => {
      if (typeof document !== 'undefined') {
        (document.getElementById('commitMsg') as HTMLInputElement | null)?.focus();
      }
    }, 100);
  }

  doCommit(): void {
    const { git, canvas, ws } = this.ctx;
    const msgEl = document.getElementById('commitMsg') as HTMLInputElement | null;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msg = (msgEl?.value ?? '').trim() || `Snapshot at ${timeStr}`;
    const sha = git.commit(canvas.getCanvasData(), msg);
    if (!sha) return;
    closeModal('commitModal');
    canvas.clearDirty();
    this.refresh();
    showToast(`✓ Committed: ${msg}`);
    ws.send({ type: 'commit', sha, commit: git.commits[sha] });
  }

  // ─── P055: Accessible confirmation dialog ─────────────────────────────────

  /**
   * Open the accessible confirm modal (replaces window.confirm()).
   * `onResult` is called with `true` when confirmed, `false` when cancelled.
   */
  private showConfirm(message: string, confirmLabel: string, onResult: (ok: boolean) => void): void {
    const msgEl = document.getElementById('confirmModalMessage');
    if (msgEl) msgEl.textContent = message;
    const okBtn = document.getElementById('confirmModalOkBtn');
    if (okBtn) okBtn.textContent = confirmLabel;
    this.pendingConfirm = onResult;
    openModal('confirmModal');
  }

  /** Called when the user clicks the Confirm button in the confirm modal. */
  acceptConfirm(): void {
    const cb = this.pendingConfirm;
    this.pendingConfirm = null;
    closeModal('confirmModal');
    cb?.(true);
  }

  /** Called when the user clicks Cancel or presses Escape in the confirm modal. */
  cancelConfirm(): void {
    const cb = this.pendingConfirm;
    this.pendingConfirm = null;
    closeModal('confirmModal');
    cb?.(false);
  }
}
