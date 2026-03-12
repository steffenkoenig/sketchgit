
/**
 * BranchCoordinator – owns the branch-list modal and branch-creation workflow.
 *
 * Responsibilities:
 *  - Render the branch-list modal with clickable items for checkout.
 *  - Open the branch-create form (optionally pre-seeded from a commit SHA).
 *  - Validate the branch name and delegate to GitModel.
 *
 * P079 – Shows peer avatar dots next to each branch in the modal, and sends
 *        a `profile` message after checkout so the server's presence reflects
 *        the new branch immediately.
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

    // P079 – build branch → peers map for the presence avatars
    const presencePeers = this.ctx.collab.getPresenceClients();
    const myId = this.ctx.collab.getMyClientId();
    const peersByBranch = new Map<string, typeof presencePeers>();
    for (const peer of presencePeers) {
      if (peer.clientId === myId) continue;
      const b = peer.branch ?? 'main';
      const existing = peersByBranch.get(b) ?? [];
      existing.push(peer);
      peersByBranch.set(b, existing);
    }

    for (const [name, sha] of Object.entries(git.branches)) {
      const color = git.branchColor(name);
      const item = document.createElement('div');
      item.className = 'branch-item' + (name === git.HEAD ? ' active-branch' : '');

      const dot = document.createElement('div');
      dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0`;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'bname';
      nameSpan.textContent = name;

      const shaSpan = document.createElement('span');
      shaSpan.className = 'bsha';
      shaSpan.textContent = sha ? sha.slice(0, 7) : '';

      item.appendChild(dot);
      item.appendChild(nameSpan);
      item.appendChild(shaSpan);

      // P079 – peer presence avatars for this branch
      const peers = peersByBranch.get(name) ?? [];
      if (peers.length > 0) {
        const MAX_SHOWN = 3;
        const group = document.createElement('div');
        group.className = 'branch-peers';
        group.style.cssText = 'display:flex;gap:2px;align-items:center;margin-left:auto;flex-shrink:0';
        group.title = peers.map((p) => p.name || 'User').join(', ');
        for (const peer of peers.slice(0, MAX_SHOWN)) {
          const av = document.createElement('div');
          av.style.cssText = `width:16px;height:16px;border-radius:50%;background:${peer.color || '#7c6eff'};display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:600;flex-shrink:0`;
          av.textContent = (peer.name || 'U').slice(0, 1).toUpperCase();
          av.title = peer.name || 'User';
          group.appendChild(av);
        }
        if (peers.length > MAX_SHOWN) {
          const extra = document.createElement('span');
          extra.style.cssText = 'font-size:9px;color:var(--a1,#7c6eff);font-weight:600;flex-shrink:0';
          extra.textContent = `+${peers.length - MAX_SHOWN}`;
          group.appendChild(extra);
        }
        item.appendChild(group);
      }

      item.addEventListener('click', () => {
        const branchTip = git.branches[name];
        git.checkout(name);
        const c = git.commits[branchTip];
        if (c) canvas.loadCanvasData(c.canvas);
        canvas.clearDirty();
        closeModal('branchModal');
        this.refresh();
        showToast(`Switched to branch '${name}'`);
        // P053 – notify peers of HEAD change (no new commit; updates presence display)
        this.ctx.ws.send({ type: 'branch-update', branch: name, headSha: branchTip, isRollback: false });
        // P079 – update server's record of our branch for presence
        this.ctx.ws.send({
          type: 'profile',
          name: this.ctx.ws.name,
          color: this.ctx.ws.color,
          branch: name,
          headSha: branchTip ?? null,
        });
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
