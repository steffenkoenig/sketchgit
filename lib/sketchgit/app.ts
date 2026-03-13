/**
 * app.ts – thin wiring layer for SketchGit (P017).
 *
 * This file creates the subsystem instances and the feature-focused
 * coordinator objects, wires them together, and returns the same public API
 * that `createSketchGitApp()` has always exposed to the React component.
 *
 * Previous version: 706 lines mixing instances, UI state, and workflow logic.
 * After P017:       ~130 lines – only wiring, no business logic.
 *
 * Workflow logic now lives in dedicated coordinators:
 *   - coordinators/timelineCoordinator.ts   (timeline rendering + UI sync)
 *   - coordinators/commitCoordinator.ts     (popup + commit modal)
 *   - coordinators/branchCoordinator.ts     (branch list + create)
 *   - coordinators/mergeCoordinator.ts      (merge modal + conflict resolution)
 *   - coordinators/collaborationCoordinator.ts (identity + room setup)
 */

import { GitModel } from './git/gitModel';
import { CanvasEngine } from './canvas/canvasEngine';
import { WsClient } from './realtime/wsClient';
import { CollaborationManager } from './realtime/collaborationManager';
import { showToast } from './ui/toast';
import { closeModal } from './ui/modals';

import { AppContext } from './coordinators/appContext';
import { TimelineCoordinator } from './coordinators/timelineCoordinator';
import { CommitCoordinator } from './coordinators/commitCoordinator';
import { BranchCoordinator } from './coordinators/branchCoordinator';
import { MergeCoordinator } from './coordinators/mergeCoordinator';
import { CollaborationCoordinator } from './coordinators/collaborationCoordinator';
import { Commit } from './types';
import { loadPreferences, savePreferences, setBranchInUrl } from './userPreferences';

// ─── Factory (same public API as before) ──────────────────────────────────────

export function createSketchGitApp() {

  // ── Subsystem instances ────────────────────────────────────────────────────

  // Load preferences once at startup so callbacks can use the cached value
  // without hitting localStorage on every fullsync.
  const startupPrefs = loadPreferences();

  const git = new GitModel((msg) => showToast(msg, true));
  const ws = new WsClient();

  // CollaborationManager callbacks reference `canvas` and coordinator methods;
  // we wire them after coordinators are created using late-bound closures so
  // that the circular reference (collab ↔ canvas, collab ↔ timeline) is safe.
  const collab = new CollaborationManager(ws, {
    getCanvasData: () => canvas.getCanvasData(),
    loadCanvasData: (data) => canvas.loadCanvasData(data),
    renderTimeline: () => tl.refresh(),
    updateUI: () => tl.updateUI(),
    getGitState: () => ({
      commits: git.commits as Record<string, unknown>,
      branches: git.branches,
      HEAD: git.HEAD,
      detached: git.detached,
    }),
    applyGitState: (state) => {
      Object.assign(git.commits, state.commits);
      Object.assign(git.branches, state.branches);
      if (state.HEAD) git.HEAD = state.HEAD;
      git.detached = state.detached ?? null;
      const headSha = git.detached ?? git.branches[git.HEAD];
      const c = git.commits[headSha];
      if (c) canvas.loadCanvasData(c.canvas);

      // Restore the preferred branch for returning visitors:
      //  1. Honour an explicit ?branch= URL param (shareable links).
      //  2. Fall back to the localStorage-persisted last branch.
      // Only switch when the target branch actually exists in the received
      // state so we never land in an inconsistent git state.
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
        if (branchCommit) canvas.loadCanvasData(branchCommit.canvas);
        canvas.clearDirty();
        // Keep the address bar in sync with the restored branch.
        setBranchInUrl(preferredBranch);
        // Announce the restored branch to peers/server.
        collab.sendProfile(ws.name, ws.color, preferredBranch, branchSha ?? null);
      }
    },
    receiveCommit: (sha, commit) => {
      git.commits[sha] = commit as Commit;
    },
    applyBranchUpdate: (branch, headSha) => {
      // P053 – apply a rolled-back branch pointer from a peer
      git.branches[branch] = headSha;
    },
    // P067 – delegate lock rendering to the canvas engine
    applyRemoteLock: (clientId, objectIds, color) => canvas.applyRemoteLock(clientId, objectIds, color),
    clearRemoteLock: (clientId) => canvas.clearRemoteLock(clientId),
    // P080 – delegate viewport to the canvas engine
    applyViewport: (vpt) => canvas.applyViewport(vpt),
    getViewport: () => canvas.getViewport(),
    // Persist the last-visited room so returning visitors are redirected there.
    onRoomJoined: (roomId) => savePreferences({ lastRoomId: roomId }),
  });

  const canvas = new CanvasEngine(
    (immediate) => collab.broadcastDraw(immediate),
    (e) => collab.broadcastCursor(e),
    // P067 – broadcast lock/unlock when user selects/deselects objects
    (objectIds) => collab.broadcastLock(objectIds),
    () => collab.broadcastUnlock(),
  );

  const ctx: AppContext = { git, canvas, collab, ws };

  // ── Coordinators ───────────────────────────────────────────────────────────

  // TimelineCoordinator is constructed first; CommitCoordinator is constructed
  // after so that we can supply the commit-click callback via late binding.
  const tl = new TimelineCoordinator(ctx);
  const refresh = () => tl.refresh();

  const branch = new BranchCoordinator(ctx, refresh);

  // CommitCoordinator's cpBranchFrom delegates to BranchCoordinator via callback.
  const commit = new CommitCoordinator(ctx, refresh, (fromSha) => branch.openBranchCreate(fromSha));

  // Now that CommitCoordinator exists, wire the timeline commit-click handler.
  tl.onCommitClick = (sha, x, y) => commit.openCommitPopup(sha, x, y);

  // Wire the canvas "first dirty" callback: when the user starts drawing while
  // in detached HEAD state, automatically open the branch-create modal so that
  // they can name a new branch before committing.
  canvas.onFirstDirty = () => {
    if (git.detached) {
      branch.openBranchCreate(git.detached);
    }
  };

  const merge = new MergeCoordinator(ctx, refresh);
  const collaboration = new CollaborationCoordinator(ctx, refresh);

  // ── Outside-click handler – close panel/popup on backdrop click ────────────
  // Store the bound reference so it can be removed in destroy().

  const outsideClickHandler = (e: MouseEvent) => {
    const panel = document.getElementById('collab-panel');
    const target = e.target as EventTarget;
    if (
      panel?.classList.contains('open') &&
      !(target instanceof Node && panel.contains(target)) &&
      !(target instanceof Element && target.closest('#topbar'))
    ) {
      collab.toggleCollabPanel();
    }
    const popup = document.getElementById('commit-popup');
    if (popup?.classList.contains('open') && !(target instanceof Node && popup.contains(target))) {
      commit.closeCommitPopup();
    }
  };

  document.addEventListener('click', outsideClickHandler);

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  collaboration.init();
  // P024: Wire the scroll listener so the timeline virtualizes on scroll.
  tl.initScrollListener();

  // ── Timeline scroll controls ───────────────────────────────────────────────

  function tlScrollLeft(): void {
    const el = document.getElementById('tlscroll');
    if (el) el.scrollLeft -= 200;
  }
  function tlScrollRight(): void {
    const el = document.getElementById('tlscroll');
    if (el) el.scrollLeft += 200;
  }

  // ─── Public API (same shape as before – React component requires no changes) ─

  return {
    // Canvas tools
    setTool: (t: string) => canvas.setTool(t),
    updateStrokeColor: (v: string) => canvas.updateStrokeColor(v),
    updateFillColor: (v: string) => canvas.updateFillColor(v),
    toggleFill: () => canvas.toggleFill(),
    setStrokeWidth: (w: number) => canvas.setStrokeWidth(w),
    zoomIn: () => canvas.zoomIn(),
    zoomOut: () => canvas.zoomOut(),
    resetZoom: () => canvas.resetZoom(),

    // Collaboration panel
    toggleCollabPanel: () => collaboration.toggleCollabPanel(),
    copyPeerId: () => collaboration.copyPeerId(),
    connectToPeer: () => collaboration.connectToPeer(),
    // P080 – Presenter mode toggle
    togglePresenting: () => collaboration.togglePresenting(),

    // Commit popup
    closeCommitPopup: () => commit.closeCommitPopup(),
    cpCheckout: () => commit.cpCheckout(),
    cpBranchFrom: () => commit.cpBranchFrom(),
    cpRollback: () => commit.cpRollback(),
    cpShareCommit: () => commit.cpShareCommit(),

    // Commit modal
    openCommitModal: () => commit.openCommitModal(),
    doCommit: () => commit.doCommit(),

    // P055 – Accessible confirm modal
    acceptConfirm: () => commit.acceptConfirm(),
    cancelConfirm: () => commit.cancelConfirm(),

    // Branch modals
    openBranchCreate: () => branch.openBranchCreate(),
    openBranchModal: () => branch.openBranchModal(),
    doCreateBranch: () => branch.doCreateBranch(),

    // Merge modal + conflict resolution
    openMergeModal: () => merge.openMergeModal(),
    doMerge: () => merge.doMerge(),
    resolveAllOurs: () => merge.resolveAllOurs(),
    resolveAllTheirs: () => merge.resolveAllTheirs(),
    applyMergeResolution: () => merge.applyMergeResolution(),

    // Identity modal
    setName: () => collaboration.setName(),

    // Misc modals / utilities
    closeModal,
    tlScrollLeft,
    tlScrollRight,

    // Share modal (opens via DOM event; React shell listens and updates state)
    openShareModal: () => {
      document.dispatchEvent(
        new CustomEvent('sketchgit:openShareModal', { detail: {} }),
      );
    },

    // P020: Resource cleanup on React component unmount.
    destroy(): void {
      document.removeEventListener('click', outsideClickHandler); // remove backdrop handler
      tl.destroyScrollListener(); // P024: remove scroll virtualization listener
      ws.disconnect();
      collab.destroy();
      canvas.destroy();
    },
  };
}
