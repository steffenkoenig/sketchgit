/**
 * TimelineCoordinator – renders the commit-graph timeline and syncs the
 * branch/HEAD display in the toolbar.
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

  constructor(private readonly ctx: AppContext) {}

  /** Re-render the SVG timeline from current git state. */
  render(): void {
    const { git, canvas } = this.ctx;
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
