/**
 * Tests for MergeCoordinator.
 *
 * Covers the merge-modal, clean merge path, conflict detection path,
 * and the conflict-resolution workflow (resolveAllOurs/Theirs,
 * applyMergeResolution).
 */

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MergeCoordinator } from './mergeCoordinator';
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

function makeCtx(mergeResult: unknown = { done: true }): AppContext {
  return {
    git: {
      HEAD: 'main',
      detached: null as string | null,
      branches: { main: 'sha0', feature: 'sha1' } as Record<string, string>,
      commits: {
        sha0: { sha: 'sha0', message: 'init', canvas: '{"objects":[]}', branch: 'main' },
        sha1: { sha: 'sha1', message: 'feat', canvas: '{"objects":[]}', branch: 'feature' },
      } as Record<string, unknown>,
      merge: vi.fn().mockReturnValue(mergeResult),
      generateSha: vi.fn().mockReturnValue('sha_merge'),
      branchColor: vi.fn().mockReturnValue('#7c6eff'),
    } as unknown as AppContext['git'],
    canvas: {
      loadCanvasData: vi.fn(),
      clearDirty: vi.fn(),
    } as unknown as AppContext['canvas'],
    ws: {} as AppContext['ws'],
    collab: {} as AppContext['collab'],
  };
}

function setupDom() {
  document.body.innerHTML = `
    <div id="mergeTargetName"></div>
    <select id="mergeSourceSelect"></select>
    <div id="conflictList"></div>
    <div id="conflictStats"></div>
    <div id="conflictSummary"></div>
  `;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MergeCoordinator', () => {
  let ctx: AppContext;
  let refresh: () => void;
  let coord: MergeCoordinator;

  beforeEach(() => {
    setupDom();
    vi.clearAllMocks();
    refresh = vi.fn();
  });

  // ─── openMergeModal ───────────────────────────────────────────────────────

  describe('openMergeModal()', () => {
    beforeEach(() => {
      ctx = makeCtx();
      coord = new MergeCoordinator(ctx, refresh);
    });

    it('sets the merge target name to HEAD', () => {
      coord.openMergeModal();
      expect(document.getElementById('mergeTargetName')?.textContent).toBe('main');
    });

    it('populates the source select with non-HEAD branches', () => {
      coord.openMergeModal();
      const sel = document.getElementById('mergeSourceSelect') as HTMLSelectElement;
      expect(sel.options).toHaveLength(1);
      expect(sel.options[0].value).toBe('feature');
    });

    it('shows a toast and does NOT open modal when in detached HEAD', () => {
      ctx.git.detached = 'sha0';
      coord.openMergeModal();
      expect(mockOpenModal).not.toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('⚠ Cannot merge in detached HEAD', true);
    });

    it('shows a toast when there are no other branches', () => {
      (ctx.git.branches as Record<string, string>) = { main: 'sha0' };
      coord.openMergeModal();
      expect(mockOpenModal).not.toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('No other branches to merge', true);
    });
  });

  // ─── doMerge – clean merge ────────────────────────────────────────────────

  describe('doMerge() – clean merge', () => {
    beforeEach(() => {
      ctx = makeCtx({ done: true });
      coord = new MergeCoordinator(ctx, refresh);
    });

    it('loads merged canvas data and calls refresh', () => {
      coord.openMergeModal();
      const sel = document.getElementById('mergeSourceSelect') as HTMLSelectElement;
      (sel as unknown as { value: string }).value = 'feature';
      coord.doMerge();

      expect(ctx.canvas.loadCanvasData).toHaveBeenCalled();
      expect(ctx.canvas.clearDirty).toHaveBeenCalled();
      expect(refresh).toHaveBeenCalledOnce();
    });
  });

  // ─── doMerge – conflict path ──────────────────────────────────────────────

  describe('doMerge() – conflicts', () => {
    const conflictPayload = {
      conflicts: [
        {
          label: 'rect',
          oursObj: { _id: 'obj1', fill: 'red' },
          propConflicts: [
            { prop: 'fill', ours: 'red', theirs: 'blue', chosen: 'ours' as const },
          ],
        },
      ],
      cleanObjects: [null],
      oursData: '{"objects":[{"_id":"obj1","fill":"red"}]}',
      branchNames: {
        ours: 'main', theirs: 'feature',
        targetBranch: 'main', sourceBranch: 'feature',
        targetSHA: 'sha0', sourceSHA: 'sha1',
      },
    };

    beforeEach(() => {
      ctx = makeCtx({ conflicts: conflictPayload });
      coord = new MergeCoordinator(ctx, refresh);
    });

    it('opens the conflict modal when conflicts are present', () => {
      coord.openMergeModal();
      coord.doMerge();
      expect(mockOpenModal).toHaveBeenCalledWith('conflictModal');
    });

    it('shows a toast about the number of conflicts', () => {
      coord.openMergeModal();
      coord.doMerge();
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('1 conflict'), true,
      );
    });
  });

  // ─── Bulk resolution ──────────────────────────────────────────────────────

  describe('resolveAllOurs() / resolveAllTheirs()', () => {
    const conflictPayload = {
      conflicts: [
        {
          label: 'rect',
          oursObj: { _id: 'obj1' },
          propConflicts: [
            { prop: 'fill', ours: 'red', theirs: 'blue', chosen: 'theirs' as const },
          ],
        },
      ],
      cleanObjects: [null],
      oursData: '{"objects":[]}',
      branchNames: {
        ours: 'main', theirs: 'feature',
        targetBranch: 'main', sourceBranch: 'feature',
        targetSHA: 'sha0', sourceSHA: 'sha1',
      },
    };

    beforeEach(() => {
      ctx = makeCtx({ conflicts: conflictPayload });
      coord = new MergeCoordinator(ctx, refresh);
      coord.openMergeModal();
      coord.doMerge(); // sets pendingMerge
    });

    it('resolveAllOurs sets every conflict choice to "ours"', () => {
      coord.resolveAllOurs();
      // Access pendingMerge via type cast for assertion
      const pm = (coord as unknown as { pendingMerge: typeof conflictPayload | null }).pendingMerge;
      expect(pm?.conflicts[0].propConflicts[0].chosen).toBe('ours');
    });

    it('resolveAllTheirs sets every conflict choice to "theirs"', () => {
      coord.resolveAllTheirs();
      const pm = (coord as unknown as { pendingMerge: typeof conflictPayload | null }).pendingMerge;
      expect(pm?.conflicts[0].propConflicts[0].chosen).toBe('theirs');
    });
  });

  // ─── applyMergeResolution ─────────────────────────────────────────────────

  describe('applyMergeResolution()', () => {
    const conflictPayload = {
      conflicts: [
        {
          label: 'rect',
          oursObj: { _id: 'obj1', fill: 'red' },
          propConflicts: [
            { prop: 'fill', ours: 'red', theirs: 'blue', chosen: 'ours' as const },
          ],
        },
      ],
      cleanObjects: [null],
      oursData: '{"objects":[{"_id":"obj1","fill":"red"}]}',
      branchNames: {
        ours: 'main', theirs: 'feature',
        targetBranch: 'main', sourceBranch: 'feature',
        targetSHA: 'sha0', sourceSHA: 'sha1',
      },
    };

    beforeEach(() => {
      ctx = makeCtx({ conflicts: conflictPayload });
      coord = new MergeCoordinator(ctx, refresh);
      coord.openMergeModal();
      coord.doMerge(); // sets pendingMerge
    });

    it('creates a merge commit in git and updates the branch tip', () => {
      coord.applyMergeResolution();
      expect(ctx.git.generateSha).toHaveBeenCalled();
      expect((ctx.git.commits as Record<string, unknown>)['sha_merge']).toBeDefined();
      expect(ctx.git.branches['main']).toBe('sha_merge');
    });

    it('loads merged canvas data and clears dirty flag', () => {
      coord.applyMergeResolution();
      expect(ctx.canvas.loadCanvasData).toHaveBeenCalled();
      expect(ctx.canvas.clearDirty).toHaveBeenCalled();
    });

    it('calls refresh and shows a success toast', () => {
      coord.applyMergeResolution();
      expect(refresh).toHaveBeenCalledOnce();
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Merge complete'));
    });

    it('closes the conflict modal', () => {
      coord.applyMergeResolution();
      expect(mockCloseModal).toHaveBeenCalledWith('conflictModal');
    });
  });
});
