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
    ws: { send: vi.fn() } as unknown as AppContext['ws'],
    collab: {
      sendCommit: vi.fn(),
    } as unknown as AppContext['collab'],
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
      mergedCanvasProps: {},
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
      mergedCanvasProps: {},
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
      mergedCanvasProps: {},
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

    // P052 – conflict-resolved merge sends commit via REST
    it('P052: sends commit via REST after conflict resolution', () => {
      coord.applyMergeResolution();
      expect(ctx.collab.sendCommit).toHaveBeenCalledOnce();
      const [sha, commit] = (ctx.collab.sendCommit as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
      expect(sha).toBe('sha_merge');
      expect(commit.isMerge).toBe(true);
      expect((commit.parents as string[])).toHaveLength(2);
    });

    it('applies mergedCanvasProps (BUG-019 preservation of canvas-level props)', () => {
      // Setup payload with specific canvas background property
      const customPayload = {
        ...conflictPayload,
        mergedCanvasProps: { background: '#abcdef', someCanvasSetting: true },
      };
      ctx = makeCtx({ conflicts: customPayload });
      coord = new MergeCoordinator(ctx, refresh);
      coord.openMergeModal();
      coord.doMerge();

      coord.applyMergeResolution();

      // Check canvas data passed to loadCanvasData contains background & someCanvasSetting
      expect(ctx.canvas.loadCanvasData).toHaveBeenCalledWith(
        expect.stringContaining('"background":"#abcdef"')
      );
      expect(ctx.canvas.loadCanvasData).toHaveBeenCalledWith(
        expect.stringContaining('"someCanvasSetting":true')
      );
    });
  });

  // ─── P052: doMerge broadcasts merge commit ────────────────────────────────

  describe('P052: doMerge (clean) sends commit via REST', () => {
    beforeEach(() => {
      // Return a clean merge result with sha
      ctx = makeCtx({ done: true, sha: 'sha_clean_merge' });
      // Pre-populate commits so doMerge can look up sha_clean_merge
      (ctx.git.commits as Record<string, unknown>)['sha_clean_merge'] = {
        sha: 'sha_clean_merge', message: "Merge 'feature' into 'main'",
        canvas: '{"objects":[]}', branch: 'main', isMerge: true,
        parents: ['sha0', 'sha1'],
      };
      ctx.git.branches['main'] = 'sha_clean_merge';
      coord = new MergeCoordinator(ctx, refresh);
    });

    it('sends commit via REST after clean merge', () => {
      coord.doMerge();
      expect(ctx.collab.sendCommit).toHaveBeenCalledOnce();
      const [sha] = (ctx.collab.sendCommit as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown];
      expect(sha).toBe('sha_clean_merge');
    });

    it('does NOT send commit when merge returns null', () => {
      ctx.git.merge = vi.fn().mockReturnValue(null);
      coord.doMerge();
      expect(ctx.collab.sendCommit).not.toHaveBeenCalled();
    });
  });

  // ─── Mermaid and UI formatting ───────────────────────────────────────────

  describe('Mermaid conflict handling and value formatting', () => {
    it('resolveAllOurs and resolveAllTheirs handles mermaid line conflicts', () => {
      const conflictPayload = {
        conflicts: [
          {
            label: 'mermaid',
            oursObj: { _id: 'obj1', _mermaidCode: 'graph TD' },
            propConflicts: [
              {
                prop: '_mermaidCode',
                ours: 'graph TD',
                theirs: 'graph LR',
                chosen: 'theirs' as const,
                mermaidLineConflicts: [
                  { lineNumber: 1, ours: 'A', theirs: 'B', chosen: 'theirs' as const }
                ]
              },
            ],
          },
        ],
        cleanObjects: [null],
        oursData: '{"objects":[]}',
        mergedCanvasProps: {},
        branchNames: {
          ours: 'main', theirs: 'feature',
          targetBranch: 'main', sourceBranch: 'feature',
          targetSHA: 'sha0', sourceSHA: 'sha1',
        },
      };

      ctx = makeCtx({ conflicts: conflictPayload });
      coord = new MergeCoordinator(ctx, refresh);
      coord.openMergeModal();
      coord.doMerge();

      coord.resolveAllOurs();
      let pm = (coord as any).pendingMerge;
      expect(pm.conflicts[0].propConflicts[0].chosen).toBe('ours');
      expect(pm.conflicts[0].propConflicts[0].mermaidLineConflicts[0].chosen).toBe('ours');

      coord.resolveAllTheirs();
      pm = (coord as any).pendingMerge;
      expect(pm.conflicts[0].propConflicts[0].chosen).toBe('theirs');
      expect(pm.conflicts[0].propConflicts[0].mermaidLineConflicts[0].chosen).toBe('theirs');
    });

    it('applyMergeResolution reconstructs mermaidCode correctly', () => {
      const conflictPayload = {
        conflicts: [
          {
            label: 'mermaid',
            oursObj: { _id: 'obj1', _mermaidCode: 'graph TD' },
            propConflicts: [
              {
                prop: '_mermaidCode',
                ours: 'graph TD',
                theirs: 'graph LR',
                chosen: 'theirs' as const,
                mermaidLineConflicts: [
                  { lineNumber: 2, ours: 'graph TD\nA', theirs: 'graph LR\nB', chosen: 'theirs' as const }
                ],
                mermaidPartialLines: [
                  'title Diagram',
                  null,
                  'C'
                ]
              },
            ],
          },
        ],
        cleanObjects: [null],
        oursData: '{"objects":[]}',
        mergedCanvasProps: {},
        branchNames: {
          ours: 'main', theirs: 'feature',
          targetBranch: 'main', sourceBranch: 'feature',
          targetSHA: 'sha0', sourceSHA: 'sha1',
        },
      };

      ctx = makeCtx({ conflicts: conflictPayload });
      coord = new MergeCoordinator(ctx, refresh);
      coord.openMergeModal();
      coord.doMerge();
      coord.applyMergeResolution();

      expect(ctx.canvas.loadCanvasData).toHaveBeenCalledWith(
        expect.stringContaining('Diagram\\ngraph LR\\nB\\nC')
      );
    });

    it('tests _createPropValueElement with special types (colors, numbers, complex data)', () => {
      ctx = makeCtx();
      coord = new MergeCoordinator(ctx, refresh);

      // We can access private methods using any cast
      const fn = (coord as any)._createPropValueElement.bind(coord);

      // null / undefined
      expect(fn('stroke', null).textContent).toBe('—');

      // Colors
      const hexColor = fn('stroke', '#ff0000');
      expect(hexColor.textContent).toBe('#ff0000');
      expect(hexColor.querySelector('.color-swatch')).toBeDefined();

      const rgbColor = fn('fill', 'rgb(255,0,0)');
      expect(rgbColor.textContent).toBe('rgb(255,0,0)');

      const emptyColor = fn('fill', '');
      expect(emptyColor.textContent).toBe('transparent');

      // Numbers
      expect(fn('strokeWidth', 2.3456).textContent).toBe('2.35');

      // Complex data
      expect(fn('path', 'M 0 0').textContent).toBe('[complex data]');
      expect(fn('_groupObjects', '[]').textContent).toBe('[complex data]');

      // Mermaid code
      const longMermaid = fn('_mermaidCode', 'A'.repeat(100));
      expect(longMermaid.querySelector('code').textContent).toContain('…');

      // Text truncation
      const longText = fn('text', 'A'.repeat(50));
      expect(longText.textContent).toContain('…');
    });

    it('tests UI interactions and rebuilding UI', () => {
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
        oursData: '{"objects":[]}',
        mergedCanvasProps: {},
        branchNames: {
          ours: 'main', theirs: 'feature',
          targetBranch: 'main', sourceBranch: 'feature',
          targetSHA: 'sha0', sourceSHA: 'sha1',
        },
      };

      ctx = makeCtx({ conflicts: conflictPayload });
      coord = new MergeCoordinator(ctx, refresh);
      coord.openMergeModal();
      coord.doMerge();

      // Trigger selection of choice
      const optionEl = document.querySelector('.prop-option') as HTMLElement;
      expect(optionEl).toBeDefined();
      optionEl.click();

      // Trigger rebuild UI
      (coord as any)._rebuildConflictChoiceUI();
      expect(mockOpenModal).toHaveBeenCalledWith('conflictModal');
    });
  });
});
