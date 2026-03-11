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
    const { git, canvas } = this.ctx;
    const sha = this.popupSHA;
    this.closeCommitPopup();
    if (sha === git.currentSHA()) { showToast('Already at this commit'); return; }
    git.checkoutCommit(sha);
    canvas.loadCanvasData(git.commits[sha].canvas);
    canvas.clearDirty();
    this.refresh();
    showToast('⤵ Viewing commit ' + sha.slice(0, 7) + ' — detached HEAD');
  }

  /** Open the branch-create modal from the current popup commit. */
  cpBranchFrom(): void {
    if (!this.popupSHA) return;
    const fromSha = this.popupSHA;
    this.closeCommitPopup();
    this.openBranchCreate(fromSha);
  }

  /** Roll back the current branch tip to the commit shown in the popup. */
  cpRollback(): void {
    if (!this.popupSHA) return;
    const { git, canvas } = this.ctx;
    const sha = this.popupSHA;
    if (git.detached) { showToast('⚠ Not on a branch', true); this.closeCommitPopup(); return; }
    if (!confirm(`Rollback branch '${git.HEAD}' to ${sha.slice(0, 7)}? This cannot be undone.`)) return;
    this.closeCommitPopup();
    git.branches[git.HEAD] = sha;
    git.detached = null;
    canvas.loadCanvasData(git.commits[sha].canvas);
    canvas.clearDirty();
    this.refresh();
    showToast('Rolled back to ' + sha.slice(0, 7));
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
    const msg = (msgEl?.value ?? '').trim() || 'Update drawing';
    const sha = git.commit(canvas.getCanvasData(), msg);
    if (!sha) return;
    closeModal('commitModal');
    canvas.clearDirty();
    this.refresh();
    showToast(`✓ Committed: ${msg}`);
    ws.send({ type: 'commit', sha, commit: git.commits[sha] });
  }
}
