import { CanvasEngine } from './canvas/canvasEngine';
import { BranchCoordinator } from './coordinators/branchCoordinator';
import { CollaborationCoordinator } from './coordinators/collaborationCoordinator';
import { CommitCoordinator } from './coordinators/commitCoordinator';
import { MergeCoordinator } from './coordinators/mergeCoordinator';
import { TimelineCoordinator } from './coordinators/timelineCoordinator';
import { CollaborationManager } from './realtime/collaborationManager';
import { WsClient } from './realtime/wsClient';
import { closeModal } from './ui/modals';

function getCanvasAPI(canvas: CanvasEngine) {
  return {
    setTool: (t: string) => canvas.setTool(t),
    updateStrokeColor: (v: string) => canvas.updateStrokeColor(v),
    updateFillColor: (v: string) => canvas.updateFillColor(v),
    toggleFill: () => canvas.toggleFill(),
    setStrokeWidth: (w: number) => canvas.setStrokeWidth(w),
    setStrokeDash: (type: string) => canvas.setStrokeDash(type as 'solid' | 'dashed' | 'dotted'),
    setBorderRadius: (type: string) => canvas.setBorderRadius(type as 'sharp' | 'rounded'),
    setOpacity: (value: number) => canvas.setOpacity(value),
    setSloppiness: (type: string) => canvas.setSloppiness(type as 'architect' | 'artist' | 'cartoonist' | 'doodle'),
    setFillPattern: (type: string) => canvas.setFillPattern(type as 'filled' | 'striped' | 'crossed'),
    bringToFront: () => canvas.bringToFront(),
    bringForward: () => canvas.bringForward(),
    sendBackward: () => canvas.sendBackward(),
    sendToBack: () => canvas.sendToBack(),
    setObjectLink: (url: string) => canvas.setObjectLink(url),
    updateMermaidCode: (code: string) => canvas.updateMermaidCode(code),
    setArrowHeads: (start: string, end: string) => canvas.setArrowHeads(
      start as 'none' | 'open' | 'triangle' | 'triangle-outline',
      end as 'none' | 'open' | 'triangle' | 'triangle-outline',
    ),
    setArrowHeadStart: (start: string) => canvas.setArrowHeadStart(
      start as 'none' | 'open' | 'triangle' | 'triangle-outline',
    ),
    setArrowHeadEnd: (end: string) => canvas.setArrowHeadEnd(
      end as 'none' | 'open' | 'triangle' | 'triangle-outline',
    ),
    setArrowType: (type: string) => canvas.setArrowType(type as 'sharp' | 'curved' | 'elbow'),
    zoomIn: () => canvas.zoomIn(),
    zoomOut: () => canvas.zoomOut(),
    resetZoom: () => canvas.resetZoom(),
    deleteSelection: () => canvas.deleteSelection(),
    groupSelection: () => canvas.groupSelection(),
    ungroupSelection: () => canvas.ungroupSelection(),
    alignLeft: () => canvas.alignLeft(),
    alignCenterH: () => canvas.alignCenterH(),
    alignRight: () => canvas.alignRight(),
    alignTop: () => canvas.alignTop(),
    alignCenterV: () => canvas.alignCenterV(),
    alignBottom: () => canvas.alignBottom(),
    getCanvasJson: (): string => canvas.getCanvasData(),
    // P095 – template instantiation is async (util.enlivenObjects), so this
    // is a fire-and-forget dispatch like the rest of the call() API.
    insertTemplate: (canvasJson: unknown) => {
      void canvas.instantiateTemplate(canvasJson as { objects: unknown[] });
    },
    // P096 – minimap navigation. getMinimapData() has a return value, so
    // MinimapPanel reads it through the dedicated stable getter in
    // SketchGitApp.tsx (same pattern getCanvasJson uses) rather than call().
    getMinimapData: () => canvas.getMinimapData(),
    panToWorldPoint: (x: number, y: number) => canvas.panToWorldPoint(x, y),
    panByScreenDelta: (dx: number, dy: number) => canvas.panByScreenDelta(dx, dy),
  };
}

function getCoordAPI(
  collaboration: CollaborationCoordinator,
  commit: CommitCoordinator,
  branch: BranchCoordinator,
  merge: MergeCoordinator
) {
  return {
    toggleCollabPanel: () => collaboration.toggleCollabPanel(),
    copyPeerId: () => collaboration.copyPeerId(),
    connectToPeer: () => collaboration.connectToPeer(),
    togglePresenting: () => collaboration.togglePresenting(),
    closeCommitPopup: () => commit.closeCommitPopup(),
    cpCheckout: () => commit.cpCheckout(),
    cpBranchFrom: () => commit.cpBranchFrom(),
    cpRollback: () => commit.cpRollback(),
    cpShareCommit: () => commit.cpShareCommit(),
    openCommitModal: () => commit.openCommitModal(),
    doCommit: () => commit.doCommit(),
    acceptConfirm: () => commit.acceptConfirm(),
    cancelConfirm: () => commit.cancelConfirm(),
    openBranchCreate: () => branch.openBranchCreate(),
    openBranchModal: () => branch.openBranchModal(),
    doCreateBranch: () => branch.doCreateBranch(),
    openMergeModal: () => merge.openMergeModal(),
    doMerge: () => merge.doMerge(),
    resolveAllOurs: () => merge.resolveAllOurs(),
    resolveAllTheirs: () => merge.resolveAllTheirs(),
    applyMergeResolution: () => merge.applyMergeResolution(),
    setName: () => collaboration.setName(),
  };
}

export function createPublicAPI(
  canvas: CanvasEngine,
  collaboration: CollaborationCoordinator,
  commit: CommitCoordinator,
  branch: BranchCoordinator,
  merge: MergeCoordinator,
  collab: CollaborationManager,
  ws: WsClient,
  tl: TimelineCoordinator,
  outsideClickHandler: (e: MouseEvent) => void,
  tlScrollLeft: () => void,
  tlScrollRight: () => void
) {
  const appAPI = {
    closeModal,
    tlScrollLeft,
    tlScrollRight,
    openShareModal: () => {
      document.dispatchEvent(
        new CustomEvent('sketchgit:openShareModal', { detail: {} }),
      );
    },
    // P091 – opens the room member/role management modal (owner only; the
    // modal itself fetches the member list, so a non-owner just sees the
    // resulting 403 rather than needing a client-side role check here).
    openMembersModal: () => {
      document.dispatchEvent(
        new CustomEvent('sketchgit:openMembersModal', { detail: {} }),
      );
    },
    // P093 – re-attempts the WS connection after the room-password modal
    // reports a successful unlock.
    retryRoomConnection: () => ws.retryConnect(),
    // P093 – opens the room settings modal (password protection). Owner-only
    // in practice, same pattern as openMembersModal: the underlying PATCH
    // /api/rooms/[roomId] endpoint returns 403 for non-owners.
    openRoomSettingsModal: () => {
      document.dispatchEvent(
        new CustomEvent('sketchgit:openRoomSettingsModal', { detail: {} }),
      );
    },
    // P095 – opens the shape library in browse mode (no pending save).
    openShapeLibraryModal: () => {
      document.dispatchEvent(
        new CustomEvent('sketchgit:openShapeLibraryModal', { detail: {} }),
      );
    },
    // P095 – called from the context menu's "Save as Template" item; grabs
    // the current selection and opens the shape library pre-armed to save
    // it (the modal shows the name-and-save form when pendingSave is set).
    saveSelectionAsTemplate: () => {
      const selection = canvas.getSelectionData();
      if (!selection) return;
      document.dispatchEvent(
        new CustomEvent('sketchgit:openShapeLibraryModal', { detail: { pendingSave: selection } }),
      );
    },
    destroy(): void {
      document.removeEventListener('click', outsideClickHandler);
      tl.destroyScrollListener();
      ws.disconnect();
      collab.destroy();
      canvas.destroy();
    },
  };

  return {
    ...getCanvasAPI(canvas),
    ...getCoordAPI(collaboration, commit, branch, merge),
    ...appAPI,
  };
}
