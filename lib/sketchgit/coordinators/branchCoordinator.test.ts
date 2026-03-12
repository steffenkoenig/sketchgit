/**
 * Tests for BranchCoordinator.
 *
 * Verifies branch-list rendering, branch-create form setup, and
 * branch creation logic.
 */

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BranchCoordinator } from './branchCoordinator';
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

function makeCtx(): AppContext {
  return {
    git: {
      HEAD: 'main',
      detached: null,
      branches: { main: 'sha0', feature: 'sha1' } as Record<string, string>,
      commits: {
        sha0: { sha: 'sha0', message: 'Initial commit', canvas: '{}' },
        sha1: { sha: 'sha1', message: 'Feature commit', canvas: '{}' },
      } as Record<string, unknown>,
      currentSHA: vi.fn().mockReturnValue('sha0'),
      branchColor: vi.fn().mockReturnValue('#7c6eff'),
      checkout: vi.fn(),
      createBranch: vi.fn().mockReturnValue(true),
    } as unknown as AppContext['git'],
    canvas: {
      loadCanvasData: vi.fn(),
      clearDirty: vi.fn(),
    } as unknown as AppContext['canvas'],
    ws: { send: vi.fn() } as unknown as AppContext['ws'],
    collab: {
      getPresenceClients: vi.fn().mockReturnValue([]),
      getMyClientId: vi.fn().mockReturnValue(''),
    } as unknown as AppContext['collab'],
  };
}

function setupDom() {
  document.body.innerHTML = `
    <div id="branchListEl"></div>
    <div id="branchFromInfo"></div>
    <input id="newBranchName" value=""/>
  `;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BranchCoordinator', () => {
  let ctx: AppContext;
  let refresh: () => void;
  let coord: BranchCoordinator;

  beforeEach(() => {
    setupDom();
    vi.clearAllMocks();
    ctx = makeCtx();
    refresh = vi.fn();
    coord = new BranchCoordinator(ctx, refresh);
  });

  // ─── openBranchModal ──────────────────────────────────────────────────────

  describe('openBranchModal()', () => {
    it('renders one list item per branch', () => {
      coord.openBranchModal();
      const items = document.querySelectorAll('.branch-item');
      expect(items).toHaveLength(2); // main + feature
    });

    it('marks the HEAD branch item as active', () => {
      coord.openBranchModal();
      const active = document.querySelectorAll('.active-branch');
      expect(active).toHaveLength(1);
      expect(active[0].querySelector('.bname')?.textContent).toBe('main');
    });

    it('opens the branch modal', () => {
      coord.openBranchModal();
      expect(mockOpenModal).toHaveBeenCalledWith('branchModal');
    });

    it('does nothing when branchListEl is absent from the DOM', () => {
      document.getElementById('branchListEl')!.remove();
      expect(() => coord.openBranchModal()).not.toThrow();
      expect(mockOpenModal).not.toHaveBeenCalled();
    });
  });

  // ─── openBranchCreate ─────────────────────────────────────────────────────

  describe('openBranchCreate()', () => {
    it('opens the branchCreateModal', () => {
      coord.openBranchCreate();
      expect(mockOpenModal).toHaveBeenCalledWith('branchCreateModal');
    });

    it('closes the branchModal before opening branchCreateModal', () => {
      coord.openBranchCreate();
      expect(mockCloseModal).toHaveBeenCalledWith('branchModal');
    });

    it('uses the provided SHA as the branch origin', () => {
      coord.openBranchCreate('sha1');
      const info = document.getElementById('branchFromInfo')!;
      expect(info.textContent).toContain('sha1'.slice(0, 7));
    });

    it('falls back to currentSHA when no fromSha is provided', () => {
      (ctx.git.currentSHA as ReturnType<typeof vi.fn>).mockReturnValue('sha0');
      coord.openBranchCreate();
      const info = document.getElementById('branchFromInfo')!;
      expect(info.textContent).toContain('sha0'.slice(0, 7));
    });
  });

  // ─── doCreateBranch ───────────────────────────────────────────────────────

  describe('doCreateBranch()', () => {
    it('creates a branch and switches to it', () => {
      (document.getElementById('newBranchName') as HTMLInputElement).value = 'my-feature';
      coord.doCreateBranch();
      expect(ctx.git.createBranch).toHaveBeenCalledWith('my-feature', null);
      expect(ctx.git.checkout).toHaveBeenCalledWith('my-feature');
      expect(refresh).toHaveBeenCalledOnce();
    });

    it('converts spaces in branch names to hyphens', () => {
      (document.getElementById('newBranchName') as HTMLInputElement).value = 'my new branch';
      coord.doCreateBranch();
      expect(ctx.git.createBranch).toHaveBeenCalledWith('my-new-branch', null);
    });

    it('does nothing when the name input is empty', () => {
      (document.getElementById('newBranchName') as HTMLInputElement).value = '';
      coord.doCreateBranch();
      expect(ctx.git.createBranch).not.toHaveBeenCalled();
    });

    it('does nothing when createBranch returns false (name conflict)', () => {
      (ctx.git.createBranch as ReturnType<typeof vi.fn>).mockReturnValue(false);
      (document.getElementById('newBranchName') as HTMLInputElement).value = 'main';
      coord.doCreateBranch();
      expect(ctx.git.checkout).not.toHaveBeenCalled();
    });

    it('shows a success toast after creating a branch', () => {
      (document.getElementById('newBranchName') as HTMLInputElement).value = 'hotfix';
      coord.doCreateBranch();
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('hotfix'));
    });
  });

  // ─── P053: openBranchModal sends branch-update after switch ──────────────

  describe('P053: openBranchModal() branch-switch', () => {
    it('sends branch-update after switching branches', () => {
      coord.openBranchModal();
      const featureItem = document.querySelector('.branch-item:not(.active-branch)') as HTMLElement;
      featureItem.click();
      expect((ctx.ws.send as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'branch-update',
          branch: 'feature',
          isRollback: false,
        }),
      );
    });
  });
});