/**
 * Tests for TimelineCoordinator.
 *
 * Verifies that render() and updateUI() correctly interact with the
 * mocked DOM and mocked subsystems.
 */

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TimelineCoordinator } from './timelineCoordinator';
import type { AppContext } from './appContext';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../ui/timelineRenderer', () => ({
  renderTimeline: vi.fn(),
}));
vi.mock('../ui/toast', () => ({ showToast: vi.fn() }));

import { renderTimeline } from '../ui/timelineRenderer';

const mockRenderTimeline = renderTimeline as ReturnType<typeof vi.fn>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(): AppContext {
  return {
    git: {
      HEAD: 'main',
      detached: null as string | null,
      currentSHA: vi.fn().mockReturnValue('sha0'),
      branchColor: vi.fn().mockReturnValue('#7c6eff'),
      branches: { main: 'sha0' },
      commits: { sha0: { canvas: '{}' } },
      checkout: vi.fn(),
    } as unknown as AppContext['git'],
    canvas: {
      loadCanvasData: vi.fn(),
      clearDirty: vi.fn(),
    } as unknown as AppContext['canvas'],
    collab: {} as AppContext['collab'],
    ws: {} as AppContext['ws'],
  };
}

function setupDom() {
  document.body.innerHTML = `
    <div id="currentBranchName"></div>
    <div id="headSHA"></div>
    <div id="currentBranchDot" style=""></div>
  `;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TimelineCoordinator', () => {
  let ctx: AppContext;
  let tl: TimelineCoordinator;

  beforeEach(() => {
    setupDom();
    vi.clearAllMocks();
    ctx = makeCtx();
    tl = new TimelineCoordinator(ctx);
  });

  describe('render()', () => {
    it('calls renderTimeline with the git model', () => {
      tl.render();
      expect(mockRenderTimeline).toHaveBeenCalledWith(
        ctx.git,
        expect.any(Function),
        expect.any(Function),
      );
    });

    it('passes onCommitClick through to renderTimeline when set', () => {
      const onCommitClick = vi.fn();
      tl.onCommitClick = onCommitClick;
      tl.render();

      // Simulate a commit-node click via the callback supplied to renderTimeline
      const commitClickArg = mockRenderTimeline.mock.calls[0][1] as (sha: string, x: number, y: number) => void;
      commitClickArg('sha0', 100, 200);
      expect(onCommitClick).toHaveBeenCalledWith('sha0', 100, 200);
    });

    it('does not throw when onCommitClick is null', () => {
      tl.onCommitClick = null;
      tl.render();
      const commitClickArg = mockRenderTimeline.mock.calls[0][1] as (sha: string, x: number, y: number) => void;
      expect(() => commitClickArg('sha0', 0, 0)).not.toThrow();
    });
  });

  describe('updateUI()', () => {
    it('shows the branch name when not in detached HEAD', () => {
      ctx.git.HEAD = 'main';
      ctx.git.detached = null;
      tl.updateUI();
      expect(document.getElementById('currentBranchName')?.textContent).toBe('main');
    });

    it('shows a truncated detached SHA when in detached HEAD', () => {
      ctx.git.detached = 'abc123def456';
      tl.updateUI();
      expect(document.getElementById('currentBranchName')?.textContent).toBe('🔍 abc123');
    });

    it('shows the first 7 characters of the current commit SHA', () => {
      (ctx.git.currentSHA as ReturnType<typeof vi.fn>).mockReturnValue('deadbeef1234');
      tl.updateUI();
      expect(document.getElementById('headSHA')?.textContent).toBe('deadbee');
    });

    it('sets the branch dot background to the branch colour', () => {
      (ctx.git.branchColor as ReturnType<typeof vi.fn>).mockReturnValue('#ff6600');
      tl.updateUI();
      // jsdom normalises hex colours to rgb(); check the style was set non-empty
      const dotStyle = (document.getElementById('currentBranchDot') as HTMLElement).style.background;
      expect(dotStyle).toBeTruthy();
    });
  });

  describe('refresh()', () => {
    it('calls both render() and updateUI()', () => {
      const renderSpy = vi.spyOn(tl, 'render');
      const updateUISpy = vi.spyOn(tl, 'updateUI');
      tl.refresh();
      expect(renderSpy).toHaveBeenCalledOnce();
      expect(updateUISpy).toHaveBeenCalledOnce();
    });
  });
});
