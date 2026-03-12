/**
 * Tests for CommitCoordinator.
 *
 * Verifies the commit-popup and commit-modal workflows using a mocked
 * AppContext so no canvas, git, or WebSocket infrastructure is needed.
 */

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommitCoordinator } from './commitCoordinator';
import type { AppContext } from './appContext';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../ui/toast', () => ({ showToast: vi.fn() }));
vi.mock('../ui/modals', () => ({ openModal: vi.fn(), closeModal: vi.fn() }));

import { showToast } from '../ui/toast';
import { openModal, closeModal } from '../ui/modals';

const mockShowToast = showToast as ReturnType<typeof vi.fn>;
const mockOpenModal = openModal as ReturnType<typeof vi.fn>;
const mockCloseModal = closeModal as ReturnType<typeof vi.fn>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides?: Partial<AppContext['git']>): AppContext {
  const git = {
    HEAD: 'main',
    detached: null as string | null,
    currentSHA: vi.fn().mockReturnValue('sha0'),
    branchColor: vi.fn().mockReturnValue('#7c6eff'),
    branches: { main: 'sha0' } as Record<string, string>,
    commits: {
      sha0: {
        sha: 'sha0', message: 'Initial commit', branch: 'main',
        ts: new Date('2025-01-01').getTime(), canvas: '{}', parents: [],
      },
    } as Record<string, unknown>,
    checkout: vi.fn().mockReturnValue('sha0'),
    checkoutCommit: vi.fn(),
    commit: vi.fn().mockReturnValue('sha1'),
    generateSha: vi.fn().mockReturnValue('sha2'),
    ...overrides,
  };
  return {
    git: git as unknown as AppContext['git'],
    canvas: {
      isDirty: true,
      getCanvasData: vi.fn().mockReturnValue('{"objects":[]}'),
      loadCanvasData: vi.fn(),
      clearDirty: vi.fn(),
    } as unknown as AppContext['canvas'],
    ws: { send: vi.fn(), isConnected: vi.fn().mockReturnValue(true) } as unknown as AppContext['ws'],
    collab: {} as AppContext['collab'],
  };
}

function setupDom() {
  document.body.innerHTML = `
    <div id="commit-popup"></div>
    <div id="cp-head-badge"></div>
    <div id="cp-sha"></div>
    <div id="cp-msg"></div>
    <div id="cp-meta"></div>
    <input id="commitMsg" value=""/>
  `;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CommitCoordinator', () => {
  let ctx: AppContext;
  let refresh: () => void;
  let openBranchCreate: (fromSha: string | null) => void;
  let coord: CommitCoordinator;

  beforeEach(() => {
    setupDom();
    vi.clearAllMocks();
    ctx = makeCtx();
    refresh = vi.fn();
    openBranchCreate = vi.fn();
    coord = new CommitCoordinator(ctx, refresh, openBranchCreate);
  });

  // ─── Commit popup ──────────────────────────────────────────────────────────

  describe('openCommitPopup()', () => {
    it('adds "open" class to the popup element', () => {
      coord.openCommitPopup('sha0', 100, 100);
      expect(document.getElementById('commit-popup')?.classList.contains('open')).toBe(true);
    });

    it('fills the sha, message and meta elements', () => {
      coord.openCommitPopup('sha0', 100, 100);
      expect(document.getElementById('cp-sha')?.textContent).toContain('sha0');
      expect(document.getElementById('cp-msg')?.textContent).toBe('Initial commit');
    });

    it('shows head-badge for the current HEAD commit', () => {
      coord.openCommitPopup('sha0', 100, 100);
      expect((document.getElementById('cp-head-badge') as HTMLElement).style.display).toBe('inline-flex');
    });

    it('does nothing when the SHA is not in commits', () => {
      coord.openCommitPopup('unknown-sha', 0, 0);
      expect(document.getElementById('commit-popup')?.classList.contains('open')).toBe(false);
    });
  });

  describe('closeCommitPopup()', () => {
    it('removes "open" class from the popup', () => {
      document.getElementById('commit-popup')!.classList.add('open');
      coord.closeCommitPopup();
      expect(document.getElementById('commit-popup')?.classList.contains('open')).toBe(false);
    });
  });

  // ─── cpCheckout ───────────────────────────────────────────────────────────

  describe('cpCheckout()', () => {
    it('does nothing if no popup is open', () => {
      coord.cpCheckout();
      expect(ctx.git.checkoutCommit).not.toHaveBeenCalled();
    });

    it('shows toast if already at the commit', () => {
      coord.openCommitPopup('sha0', 0, 0);
      coord.cpCheckout();
      expect(mockShowToast).toHaveBeenCalledWith('Already at this commit');
    });

    it('calls checkoutCommit and refresh for a different commit (not a branch tip)', () => {
      (ctx.git.commits as Record<string, unknown>)['sha1'] = {
        sha: 'sha1', message: 'Second', branch: 'main', ts: Date.now(), canvas: '{}', parents: [],
      };
      coord.openCommitPopup('sha1', 0, 0);
      coord.cpCheckout();
      expect(ctx.git.checkoutCommit).toHaveBeenCalledWith('sha1');
      expect(refresh).toHaveBeenCalledOnce();
    });

    it('switches to branch directly when the commit is a branch tip (no detached HEAD)', () => {
      // sha0 is the tip of 'main' (set in makeCtx); checking out sha0 from a
      // different current SHA should call git.checkout('main'), not checkoutCommit.
      (ctx.git.currentSHA as ReturnType<typeof vi.fn>).mockReturnValue('sha1');
      (ctx.git.checkout as ReturnType<typeof vi.fn>).mockReturnValue('sha0');
      coord.openCommitPopup('sha0', 0, 0);
      coord.cpCheckout();
      expect(ctx.git.checkout).toHaveBeenCalledWith('main');
      expect(ctx.git.checkoutCommit).not.toHaveBeenCalled();
      expect(refresh).toHaveBeenCalledOnce();
    });

    it('shows branch-switch toast when checking out a branch tip', () => {
      (ctx.git.currentSHA as ReturnType<typeof vi.fn>).mockReturnValue('sha1');
      (ctx.git.checkout as ReturnType<typeof vi.fn>).mockReturnValue('sha0');
      coord.openCommitPopup('sha0', 0, 0);
      coord.cpCheckout();
      expect(mockShowToast).toHaveBeenCalledWith("Switched to branch 'main'");
    });

    it('sends branch-update (not detached) when checking out a branch tip', () => {
      (ctx.git.currentSHA as ReturnType<typeof vi.fn>).mockReturnValue('sha1');
      (ctx.git.checkout as ReturnType<typeof vi.fn>).mockReturnValue('sha0');
      coord.openCommitPopup('sha0', 0, 0);
      coord.cpCheckout();
      expect(ctx.ws.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'branch-update', branch: 'main', headSha: 'sha0', isRollback: false }),
      );
    });
  });

  // ─── cpBranchFrom ─────────────────────────────────────────────────────────

  describe('cpBranchFrom()', () => {
    it('delegates to openBranchCreate with the popup SHA', () => {
      coord.openCommitPopup('sha0', 0, 0);
      coord.cpBranchFrom();
      expect(openBranchCreate).toHaveBeenCalledWith('sha0');
    });

    it('does nothing if no popup SHA is set', () => {
      coord.cpBranchFrom();
      expect(openBranchCreate).not.toHaveBeenCalled();
    });
  });

  // ─── openCommitModal ──────────────────────────────────────────────────────

  describe('openCommitModal()', () => {
    it('opens the commit modal when canvas is dirty', () => {
      (ctx.canvas as { isDirty: boolean }).isDirty = true;
      coord.openCommitModal();
      expect(mockOpenModal).toHaveBeenCalledWith('commitModal');
    });

    it('shows a toast and does NOT open the modal when canvas is clean', () => {
      (ctx.canvas as { isDirty: boolean }).isDirty = false;
      coord.openCommitModal();
      expect(mockOpenModal).not.toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Nothing new to commit');
    });
  });

  // ─── doCommit ─────────────────────────────────────────────────────────────

  describe('doCommit()', () => {
    it('commits canvas data and broadcasts via WebSocket', () => {
      const msgInput = document.getElementById('commitMsg') as HTMLInputElement;
      msgInput.value = 'My commit';
      (ctx.git.commits as Record<string, unknown>)['sha1'] = { sha: 'sha1', message: 'My commit' };

      coord.doCommit();

      expect(ctx.git.commit).toHaveBeenCalledWith('{"objects":[]}', 'My commit');
      expect(ctx.ws.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'commit', sha: 'sha1' }),
      );
      expect(mockCloseModal).toHaveBeenCalledWith('commitModal');
      expect(ctx.canvas.clearDirty).toHaveBeenCalled();
      expect(refresh).toHaveBeenCalledOnce();
    });

    it('uses "Update drawing" as default message when input is blank', () => {
      (document.getElementById('commitMsg') as HTMLInputElement).value = '';
      (ctx.git.commits as Record<string, unknown>)['sha1'] = { sha: 'sha1', message: 'Update drawing' };
      coord.doCommit();
      expect(ctx.git.commit).toHaveBeenCalledWith(expect.any(String), 'Update drawing');
    });

    it('does nothing if git.commit returns null (nothing to commit)', () => {
      (ctx.git.commit as ReturnType<typeof vi.fn>).mockReturnValue(null);
      coord.doCommit();
      expect(ctx.ws.send).not.toHaveBeenCalled();
    });
  });

  // ─── P053: cpCheckout sends branch-update ─────────────────────────────────

  describe('P053: cpCheckout()', () => {
    it('sends branch-update with detached=true after checkout of a non-tip commit', () => {
      // sha99 is NOT a branch tip, so detached HEAD path is taken.
      (ctx.git.commits as Record<string, unknown>)['sha99'] = {
        sha: 'sha99', message: 'Old commit', branch: 'main', ts: Date.now(), canvas: '{}', parents: [],
      };
      (coord as unknown as { popupSHA: string }).popupSHA = 'sha99';
      (ctx.git.currentSHA as ReturnType<typeof vi.fn>).mockReturnValue('sha0'); // different sha
      coord.cpCheckout();
      expect(ctx.ws.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'branch-update', detached: true, headSha: 'sha99' }),
      );
    });

    it('does NOT send branch-update when already at that commit', () => {
      (coord as unknown as { popupSHA: string }).popupSHA = 'sha0';
      (ctx.git.currentSHA as ReturnType<typeof vi.fn>).mockReturnValue('sha0');
      coord.cpCheckout();
      expect(ctx.ws.send).not.toHaveBeenCalled();
    });
  });

  // ─── P053/P055: cpRollback uses confirm modal ────────────────────────────────

  describe('P053/P055: cpRollback()', () => {
    beforeEach(() => {
      document.body.innerHTML += `
        <p id="confirmModalMessage"></p>
        <button id="confirmModalOkBtn">Confirm</button>
        <div id="confirmModal"></div>
      `;
    });

    it('opens the confirm modal instead of calling window.confirm()', () => {
      const confirmSpy = vi.spyOn(window, 'confirm');
      (coord as unknown as { popupSHA: string }).popupSHA = 'sha0';
      ctx.git.detached = null;
      coord.cpRollback();
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(mockOpenModal).toHaveBeenCalledWith('confirmModal');
    });

    it('sends branch-update after acceptConfirm', () => {
      (coord as unknown as { popupSHA: string }).popupSHA = 'sha0';
      ctx.git.detached = null;
      coord.cpRollback();
      coord.acceptConfirm();
      expect(ctx.ws.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'branch-update', isRollback: true, headSha: 'sha0' }),
      );
    });

    it('does NOT perform rollback after cancelConfirm', () => {
      (coord as unknown as { popupSHA: string }).popupSHA = 'sha0';
      ctx.git.detached = null;
      coord.cpRollback();
      coord.cancelConfirm();
      expect(ctx.ws.send).not.toHaveBeenCalled();
      expect(ctx.canvas.loadCanvasData).not.toHaveBeenCalled();
    });
  });
});
