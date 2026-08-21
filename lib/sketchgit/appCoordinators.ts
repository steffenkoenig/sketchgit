import { AppContext } from './coordinators/appContext';
import { TimelineCoordinator } from './coordinators/timelineCoordinator';
import { BranchCoordinator } from './coordinators/branchCoordinator';
import { CommitCoordinator } from './coordinators/commitCoordinator';
import { MergeCoordinator } from './coordinators/mergeCoordinator';
import { CollaborationCoordinator } from './coordinators/collaborationCoordinator';

export function setupCoordinators(ctx: AppContext) {
  const tl = new TimelineCoordinator(ctx);
  const refresh = () => tl.refresh();

  const branch = new BranchCoordinator(ctx, refresh);
  const commit = new CommitCoordinator(ctx, refresh, (fromSha) => branch.openBranchCreate(fromSha));

  tl.onCommitClick = (sha, x, y) => commit.openCommitPopup(sha, x, y);

  ctx.canvas.onFirstDirty = () => {
    if (ctx.git.detached) {
      branch.openBranchCreate(ctx.git.detached);
    }
  };

  const merge = new MergeCoordinator(ctx, refresh);
  const collaboration = new CollaborationCoordinator(ctx, refresh);

  const outsideClickHandler = (e: MouseEvent) => {
    const panel = document.getElementById('collab-panel');
    const target = e.target as EventTarget;
    if (
      panel?.classList.contains('open') &&
      !(target instanceof Node && panel.contains(target)) &&
      !(target instanceof Element && target.closest('#topbar'))
    ) {
      ctx.collab.toggleCollabPanel();
    }
    const popup = document.getElementById('commit-popup');
    if (popup?.classList.contains('open') && !(target instanceof Node && popup.contains(target))) {
      commit.closeCommitPopup();
    }
  };

  document.addEventListener('click', outsideClickHandler);

  return { tl, branch, commit, merge, collaboration, outsideClickHandler };
}
