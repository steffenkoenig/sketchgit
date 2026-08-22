import { CollaborationManager } from './realtime/collaborationManager';
import { WsClient } from './realtime/wsClient';
import { GitModel } from './git/gitModel';
import { CanvasEngine } from './canvas/canvasEngine';
import { TimelineCoordinator } from './coordinators/timelineCoordinator';
import { Commit } from './types';
import { savePreferences, setBranchInUrl } from './userPreferences';

function applyGitStateToModels(
  state: { commits: Record<string, unknown>; branches: Record<string, string>; HEAD: string; detached: string | null },
  git: GitModel,
  collab: CollaborationManager,
  startupPrefs: { lastBranchName?: string } | null,
  getCanvas: () => CanvasEngine,
  ws: WsClient
) {
  Object.assign(git.commits, state.commits);
  Object.assign(git.branches, state.branches);
  if (state.HEAD) git.HEAD = state.HEAD;
  git.detached = state.detached ?? null;
  const headSha = git.detached ?? git.branches[git.HEAD];
  const c = git.commits[headSha];
  if (c) getCanvas().loadCanvasData(c.canvas);

  const preferredBranch =
    collab.getBranchFromUrl() || (startupPrefs?.lastBranchName ?? '');
  if (
    preferredBranch &&
    state.branches[preferredBranch] !== undefined &&
    preferredBranch !== git.HEAD
  ) {
    git.checkout(preferredBranch);
    const branchSha = git.branches[preferredBranch];
    const branchCommit = git.commits[branchSha];
    if (branchCommit) getCanvas().loadCanvasData(branchCommit.canvas);
    getCanvas().clearDirty();
    setBranchInUrl(preferredBranch);
    collab.sendProfile(ws.name, ws.color, preferredBranch, branchSha ?? null);
  }
}

export function setupCollaborationManager(
  ws: WsClient,
  git: GitModel,
  startupPrefs: { lastBranchName?: string } | null,
  getCanvas: () => CanvasEngine,
  getTl: () => TimelineCoordinator
): CollaborationManager {
  let collab: CollaborationManager;

  collab = new CollaborationManager(ws, {
    getCanvasData: () => getCanvas().getCanvasData(),
    loadCanvasData: (data) => getCanvas().loadCanvasData(data),
    renderTimeline: () => getTl().refresh(),
    updateUI: () => getTl().updateUI(),
    getGitState: () => ({
      commits: git.commits as Record<string, unknown>,
      branches: git.branches,
      HEAD: git.HEAD,
      detached: git.detached,
    }),
    applyGitState: (state) => applyGitStateToModels(state, git, collab, startupPrefs, getCanvas, ws),
    receiveCommit: (sha, commit) => {
      git.commits[sha] = commit as Commit;
    },
    applyBranchUpdate: (branch, headSha) => {
      git.branches[branch] = headSha;
    },
    applyRemoteLock: (clientId, objectIds, color) => getCanvas().applyRemoteLock(clientId, objectIds, color),
    clearRemoteLock: (clientId) => getCanvas().clearRemoteLock(clientId),
    applyViewport: (vpt) => getCanvas().applyViewport(vpt),
    getViewport: () => getCanvas().getViewport(),
    onRoomJoined: (roomId) => savePreferences({ lastRoomId: roomId }),
    // P091 – VIEWER role gets a visibly read-only canvas: drawing tools are
    // dimmed and unclickable, and a persistent badge explains why. This is
    // a UX affordance only — the actual enforcement is server-side (P034
    // WS/REST checks); a VIEWER whose client somehow bypassed this couldn't
    // draw anyway, their attempt would just be silently rejected.
    onRoleChanged: (role) => {
      document.body.classList.toggle('role-viewer', role === 'VIEWER');
      let badge = document.getElementById('readOnlyBadge');
      if (role === 'VIEWER') {
        if (!badge) {
          badge = document.createElement('div');
          badge.id = 'readOnlyBadge';
          badge.setAttribute('role', 'status');
          badge.textContent = 'Read-only — you have viewer access to this room';
          document.body.appendChild(badge);
        }
      } else {
        badge?.remove();
      }
    },
  });

  return collab;
}
