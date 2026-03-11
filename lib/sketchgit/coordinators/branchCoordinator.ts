/**
 * BranchCoordinator – owns the branch-list modal and branch-creation workflow.
 *
 * Responsibilities:
 *  - Render the branch-list modal with clickable items for checkout.
 *  - Open the branch-create form (optionally pre-seeded from a commit SHA).
 *  - Validate the branch name and delegate to GitModel.
 */

import { AppContext } from './appContext';
import { showToast } from '../ui/toast';
import { openModal, closeModal } from '../ui/modals';

export class BranchCoordinator {
  /** SHA to branch from; null means "from current HEAD". */
  private branchFromSHA: string | null = null;
  /** SHA selected via a commit-popup context-menu; forwarded to openBranchCreate. */
  private ctxMenuSHA: string | null = null;

  /**
   * @param ctx     – shared subsystem references
   * @param refresh – re-renders timeline + updates UI (provided by app.ts wiring)
   */
  constructor(
    private readonly ctx: AppContext,
    private readonly refresh: () => void,
  ) {}

  // ─── Branch list modal ─────────────────────────────────────────────────────

  openBranchModal(): void {
    const { git, canvas } = this.ctx;
    const list = document.getElementById('branchListEl');
    if (!list) return;
    list.replaceChildren();

    for (const [name, sha] of Object.entries(git.branches)) {
      const color = git.branchColor(name);
      const item = document.createElement('div');
      item.className = 'branch-item' + (name === git.HEAD ? ' active-branch' : '');

      const dot = document.createElement('div');
      dot.style.width = '10px';
      dot.style.height = '10px';
      dot.style.borderRadius = '50%';
      dot.style.background = color;
      dot.style.flexShrink = '0';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'bname';
      nameSpan.textContent = name;

      const shaSpan = document.createElement('span');
      shaSpan.className = 'bsha';
      shaSpan.textContent = sha ? sha.slice(0, 7) : '';

      item.appendChild(dot);
      item.appendChild(nameSpan);
      item.appendChild(shaSpan);

      item.addEventListener('click', () => {
        git.checkout(name);
        const c = git.commits[git.branches[name]];
        if (c) canvas.loadCanvasData(c.canvas);
        canvas.clearDirty();
        closeModal('branchModal');
        this.refresh();
        showToast(`Switched to branch '${name}'`);
      });
      list.appendChild(item);
    }
    openModal('branchModal');
  }

  // ─── Branch creation ───────────────────────────────────────────────────────

  /**
   * Open the branch-create form.
   *
   * @param fromSha – If provided, the new branch will start from this SHA
   *                  instead of the current HEAD.  Pass `null` or omit to use HEAD.
   */
  openBranchCreate(fromSha?: string | null): void {
    const { git } = this.ctx;
    // A fromSha coming from CommitCoordinator.cpBranchFrom() overrides ctxMenuSHA.
    this.ctxMenuSHA = fromSha !== undefined ? fromSha : this.ctxMenuSHA;
    this.branchFromSHA = this.ctxMenuSHA ?? git.currentSHA();
    const c = this.branchFromSHA ? git.commits[this.branchFromSHA] : null;

    const infoEl = document.getElementById('branchFromInfo');
    if (infoEl) {
      infoEl.replaceChildren();
      const boldEl = document.createElement('b');
      boldEl.textContent = 'From:';
      infoEl.appendChild(boldEl);
      infoEl.appendChild(
        document.createTextNode(
          ' ' + (this.branchFromSHA ? this.branchFromSHA.slice(0, 7) : '?') +
          ' — ' + (c ? c.message : ''),
        ),
      );
    }
    const nameEl = document.getElementById('newBranchName') as HTMLInputElement | null;
    if (nameEl) nameEl.value = '';
    closeModal('branchModal');
    openModal('branchCreateModal');
    setTimeout(() => {
      if (typeof document !== 'undefined') {
        (document.getElementById('newBranchName') as HTMLInputElement | null)?.focus();
      }
    }, 100);
  }

  doCreateBranch(): void {
    const { git } = this.ctx;
    const nameEl = document.getElementById('newBranchName') as HTMLInputElement | null;
    const name = (nameEl?.value ?? '').trim().replace(/\s+/g, '-');
    if (!name) return;
    if (!git.createBranch(name, this.branchFromSHA)) return;
    git.checkout(name);
    closeModal('branchCreateModal');
    this.refresh();
    showToast(`✓ Created & switched to '${name}'`);
    this.ctxMenuSHA = null;
  }
}
