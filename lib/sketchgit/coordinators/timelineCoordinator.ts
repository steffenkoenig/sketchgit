/**
 * TimelineCoordinator – renders the commit-graph timeline and syncs the
 * branch/HEAD display in the toolbar.
 *
 * P024 – The coordinator now wires a debounced scroll listener to the
 * `#tlscroll` container so that `renderTimeline` is called with the current
 * scroll position, enabling viewport-based virtualization in the renderer.
 *
 * This coordinator is read-only with respect to git state: it never writes
 * to branches or commits.  It is the first coordinator to be extracted
 * because it has no outgoing dependencies on other coordinators.
 */

import { AppContext } from './appContext';
import { renderTimeline } from '../ui/timelineRenderer';
import { showToast } from '../ui/toast';

export class TimelineCoordinator {
  /**
   * Called when the user clicks a commit node in the timeline.
   * Set by `createSketchGitApp` after CommitCoordinator is constructed
   * (the two coordinators are mutually referenced via lazy closure).
   */
  onCommitClick: ((sha: string, screenX: number, screenY: number) => void) | null = null;

  /** Cleanup function returned by the scroll-listener setup. */
  private _destroyScrollListener: (() => void) | null = null;

  /** Pending requestAnimationFrame id from the scroll handler (may need cancellation). */
  private _scrollRafId: ReturnType<typeof requestAnimationFrame> | null = null;

  constructor(private readonly ctx: AppContext) {}

  /**
   * Attach a debounced scroll listener to #tlscroll so the timeline
   * re-renders with the current scroll position, enabling virtualization.
   * Call this once after the DOM is ready (called from init()).
   */
  initScrollListener(): void {
    const el = document.getElementById('tlscroll');
    if (!el) return;

    let rafId: ReturnType<typeof requestAnimationFrame> | null = null;
    const onScroll = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        this._scrollRafId = null;
        this.render();
      });
      this._scrollRafId = rafId;
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    this._destroyScrollListener = () => {
      el.removeEventListener('scroll', onScroll);
      // Cancel any pending RAF so it cannot fire against torn-down subsystems.
      if (this._scrollRafId !== null) {
        cancelAnimationFrame(this._scrollRafId);
        this._scrollRafId = null;
      }
    };
  }

  /** Remove the scroll event listener (called on destroy). */
  destroyScrollListener(): void {
    this._destroyScrollListener?.();
    this._destroyScrollListener = null;
  }

  /** Re-render the SVG timeline from current git state. */
  render(): void {
    const { git, canvas } = this.ctx;

    // Pass scroll position for virtualization when the container exists
    const tlscroll = document.getElementById('tlscroll');
    const scrollLeft = tlscroll?.scrollLeft;
    const viewportWidth = tlscroll?.clientWidth;

    renderTimeline(
      git,
      (sha, x, y) => this.onCommitClick?.(sha, x, y),
      (name) => {
        git.checkout(name);
        const c = git.commits[git.branches[name]];
        if (c) canvas.loadCanvasData(c.canvas);
        canvas.clearDirty();
        this.updateUI();
        this.render();
        showToast(`Switched to '${name}'`);
      },
      scrollLeft,
      viewportWidth,
    );
  }

  /** Update the branch name, HEAD SHA, and branch-dot colour in the toolbar. */
  updateUI(): void {
    const { git } = this.ctx;
    const nameEl = document.getElementById('currentBranchName');
    if (nameEl) {
      nameEl.textContent = git.detached
        ? '🔍 ' + git.detached.slice(0, 6)
        : git.HEAD;
    }
    const shaEl = document.getElementById('headSHA');
    if (shaEl) shaEl.textContent = (git.currentSHA() ?? '').slice(0, 7);
    const dotEl = document.getElementById('currentBranchDot');
    if (dotEl) dotEl.style.background = git.branchColor(git.HEAD);
  }

  /** Combined helper used by all other coordinators after state changes. */
  refresh(): void {
    this.render();
    this.updateUI();
  }
}
