// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPublicAPI } from './appAPI.js';

describe('createPublicAPI', () => {
  let canvas: any;
  let collaboration: any;
  let commit: any;
  let branch: any;
  let merge: any;
  let collab: any;
  let ws: any;
  let tl: any;
  let outsideClickHandler: any;
  let tlScrollLeft: any;
  let tlScrollRight: any;

  beforeEach(() => {
    canvas = {
      setTool: vi.fn(),
      updateStrokeColor: vi.fn(),
      updateFillColor: vi.fn(),
      toggleFill: vi.fn(),
      setStrokeWidth: vi.fn(),
      setStrokeDash: vi.fn(),
      setBorderRadius: vi.fn(),
      setOpacity: vi.fn(),
      setSloppiness: vi.fn(),
      setFillPattern: vi.fn(),
      bringToFront: vi.fn(),
      bringForward: vi.fn(),
      sendBackward: vi.fn(),
      sendToBack: vi.fn(),
      setObjectLink: vi.fn(),
      updateMermaidCode: vi.fn(),
      setArrowHeads: vi.fn(),
      setArrowHeadStart: vi.fn(),
      setArrowHeadEnd: vi.fn(),
      setArrowType: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      resetZoom: vi.fn(),
      deleteSelection: vi.fn(),
      groupSelection: vi.fn(),
      ungroupSelection: vi.fn(),
      alignLeft: vi.fn(),
      alignCenterH: vi.fn(),
      alignRight: vi.fn(),
      alignTop: vi.fn(),
      alignCenterV: vi.fn(),
      alignBottom: vi.fn(),
      getCanvasData: vi.fn(),
      instantiateTemplate: vi.fn(),
      getMinimapData: vi.fn(),
      panToWorldPoint: vi.fn(),
      panByScreenDelta: vi.fn(),
      getSelectionData: vi.fn(),
      destroy: vi.fn(),
    };
    collaboration = {
      toggleCollabPanel: vi.fn(),
      copyPeerId: vi.fn(),
      connectToPeer: vi.fn(),
      togglePresenting: vi.fn(),
      setName: vi.fn(),
    };
    commit = {
      closeCommitPopup: vi.fn(),
      cpCheckout: vi.fn(),
      cpBranchFrom: vi.fn(),
      cpRollback: vi.fn(),
      cpShareCommit: vi.fn(),
      openCommitModal: vi.fn(),
      doCommit: vi.fn(),
      acceptConfirm: vi.fn(),
      cancelConfirm: vi.fn(),
    };
    branch = {
      openBranchCreate: vi.fn(),
      openBranchModal: vi.fn(),
      doCreateBranch: vi.fn(),
    };
    merge = {
      openMergeModal: vi.fn(),
      doMerge: vi.fn(),
      resolveAllOurs: vi.fn(),
      resolveAllTheirs: vi.fn(),
      applyMergeResolution: vi.fn(),
    };
    collab = {
      destroy: vi.fn(),
    };
    ws = {
      disconnect: vi.fn(),
      retryConnect: vi.fn(),
    };
    tl = {
      destroyScrollListener: vi.fn(),
    };
    outsideClickHandler = vi.fn();
    tlScrollLeft = vi.fn();
    tlScrollRight = vi.fn();
  });

  const callCreateAPI = () => {
    return createPublicAPI(
      canvas,
      collaboration,
      commit,
      branch,
      merge,
      collab,
      ws,
      tl,
      outsideClickHandler,
      tlScrollLeft,
      tlScrollRight
    );
  };

  it('should delegate all canvas API methods correctly', () => {
    const api = callCreateAPI();

    api.setTool('pen');
    expect(canvas.setTool).toHaveBeenCalledWith('pen');

    api.updateStrokeColor('#ff0000');
    expect(canvas.updateStrokeColor).toHaveBeenCalledWith('#ff0000');

    api.updateFillColor('#00ff00');
    expect(canvas.updateFillColor).toHaveBeenCalledWith('#00ff00');

    api.toggleFill();
    expect(canvas.toggleFill).toHaveBeenCalled();

    api.setStrokeWidth(5);
    expect(canvas.setStrokeWidth).toHaveBeenCalledWith(5);

    api.setStrokeDash('dashed');
    expect(canvas.setStrokeDash).toHaveBeenCalledWith('dashed');

    api.setBorderRadius('rounded');
    expect(canvas.setBorderRadius).toHaveBeenCalledWith('rounded');

    api.setOpacity(0.5);
    expect(canvas.setOpacity).toHaveBeenCalledWith(0.5);

    api.setSloppiness('architect');
    expect(canvas.setSloppiness).toHaveBeenCalledWith('architect');

    api.setFillPattern('striped');
    expect(canvas.setFillPattern).toHaveBeenCalledWith('striped');

    api.bringToFront();
    expect(canvas.bringToFront).toHaveBeenCalled();

    api.bringForward();
    expect(canvas.bringForward).toHaveBeenCalled();

    api.sendBackward();
    expect(canvas.sendBackward).toHaveBeenCalled();

    api.sendToBack();
    expect(canvas.sendToBack).toHaveBeenCalled();

    api.setObjectLink('https://example.com');
    expect(canvas.setObjectLink).toHaveBeenCalledWith('https://example.com');

    api.updateMermaidCode('graph TD; A-->B;');
    expect(canvas.updateMermaidCode).toHaveBeenCalledWith('graph TD; A-->B;');

    api.setArrowHeads('open', 'triangle');
    expect(canvas.setArrowHeads).toHaveBeenCalledWith('open', 'triangle');

    api.setArrowHeadStart('none');
    expect(canvas.setArrowHeadStart).toHaveBeenCalledWith('none');

    api.setArrowHeadEnd('triangle-outline');
    expect(canvas.setArrowHeadEnd).toHaveBeenCalledWith('triangle-outline');

    api.setArrowType('curved');
    expect(canvas.setArrowType).toHaveBeenCalledWith('curved');

    api.zoomIn();
    expect(canvas.zoomIn).toHaveBeenCalled();

    api.zoomOut();
    expect(canvas.zoomOut).toHaveBeenCalled();

    api.resetZoom();
    expect(canvas.resetZoom).toHaveBeenCalled();

    api.deleteSelection();
    expect(canvas.deleteSelection).toHaveBeenCalled();

    api.groupSelection();
    expect(canvas.groupSelection).toHaveBeenCalled();

    api.ungroupSelection();
    expect(canvas.ungroupSelection).toHaveBeenCalled();

    api.alignLeft();
    expect(canvas.alignLeft).toHaveBeenCalled();

    api.alignCenterH();
    expect(canvas.alignCenterH).toHaveBeenCalled();

    api.alignRight();
    expect(canvas.alignRight).toHaveBeenCalled();

    api.alignTop();
    expect(canvas.alignTop).toHaveBeenCalled();

    api.alignCenterV();
    expect(canvas.alignCenterV).toHaveBeenCalled();

    api.alignBottom();
    expect(canvas.alignBottom).toHaveBeenCalled();

    canvas.getCanvasData.mockReturnValue('{"objects": []}');
    expect(api.getCanvasJson()).toBe('{"objects": []}');

    const templateData = { objects: [] };
    api.insertTemplate(templateData);
    expect(canvas.instantiateTemplate).toHaveBeenCalledWith(templateData);

    canvas.getMinimapData.mockReturnValue('minimap-data');
    expect(api.getMinimapData()).toBe('minimap-data');

    api.panToWorldPoint(100, 200);
    expect(canvas.panToWorldPoint).toHaveBeenCalledWith(100, 200);

    api.panByScreenDelta(10, 20);
    expect(canvas.panByScreenDelta).toHaveBeenCalledWith(10, 20);
  });

  it('should delegate all coordinator API methods correctly', () => {
    const api = callCreateAPI();

    api.toggleCollabPanel();
    expect(collaboration.toggleCollabPanel).toHaveBeenCalled();

    api.copyPeerId();
    expect(collaboration.copyPeerId).toHaveBeenCalled();

    api.connectToPeer();
    expect(collaboration.connectToPeer).toHaveBeenCalled();

    api.togglePresenting();
    expect(collaboration.togglePresenting).toHaveBeenCalled();

    api.closeCommitPopup();
    expect(commit.closeCommitPopup).toHaveBeenCalled();

    api.cpCheckout();
    expect(commit.cpCheckout).toHaveBeenCalled();

    api.cpBranchFrom();
    expect(commit.cpBranchFrom).toHaveBeenCalled();

    api.cpRollback();
    expect(commit.cpRollback).toHaveBeenCalled();

    api.cpShareCommit();
    expect(commit.cpShareCommit).toHaveBeenCalled();

    api.openCommitModal();
    expect(commit.openCommitModal).toHaveBeenCalled();

    api.doCommit();
    expect(commit.doCommit).toHaveBeenCalled();

    api.acceptConfirm();
    expect(commit.acceptConfirm).toHaveBeenCalled();

    api.cancelConfirm();
    expect(commit.cancelConfirm).toHaveBeenCalled();

    api.openBranchCreate();
    expect(branch.openBranchCreate).toHaveBeenCalled();

    api.openBranchModal();
    expect(branch.openBranchModal).toHaveBeenCalled();

    api.doCreateBranch();
    expect(branch.doCreateBranch).toHaveBeenCalled();

    api.openMergeModal();
    expect(merge.openMergeModal).toHaveBeenCalled();

    api.doMerge();
    expect(merge.doMerge).toHaveBeenCalled();

    api.resolveAllOurs();
    expect(merge.resolveAllOurs).toHaveBeenCalled();

    api.resolveAllTheirs();
    expect(merge.resolveAllTheirs).toHaveBeenCalled();

    api.applyMergeResolution();
    expect(merge.applyMergeResolution).toHaveBeenCalled();

    api.setName();
    expect(collaboration.setName).toHaveBeenCalled();
  });

  it('should delegate appAPI methods correctly', () => {
    const api = callCreateAPI();

    expect(api.tlScrollLeft).toBe(tlScrollLeft);
    expect(api.tlScrollRight).toBe(tlScrollRight);
  });

  it('destroy should call all necessary teardown functions', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

    const api = callCreateAPI();

    api.destroy();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('click', outsideClickHandler);
    expect(tl.destroyScrollListener).toHaveBeenCalled();
    expect(ws.disconnect).toHaveBeenCalled();
    expect(collab.destroy).toHaveBeenCalled();
    expect(canvas.destroy).toHaveBeenCalled();

    removeEventListenerSpy.mockRestore();
  });

  it('should dispatch custom events for modal opens', () => {
    const dispatchEventSpy = vi.spyOn(document, 'dispatchEvent');

    const api = callCreateAPI();

    api.openShareModal();
    expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
    expect((dispatchEventSpy.mock.calls[0][0] as CustomEvent).type).toBe('sketchgit:openShareModal');

    api.openMembersModal();
    expect(dispatchEventSpy).toHaveBeenCalledTimes(2);
    expect((dispatchEventSpy.mock.calls[1][0] as CustomEvent).type).toBe('sketchgit:openMembersModal');

    api.retryRoomConnection();
    expect(ws.retryConnect).toHaveBeenCalled();

    api.openRoomSettingsModal();
    expect(dispatchEventSpy).toHaveBeenCalledTimes(3);
    expect((dispatchEventSpy.mock.calls[2][0] as CustomEvent).type).toBe('sketchgit:openRoomSettingsModal');

    api.openShapeLibraryModal();
    expect(dispatchEventSpy).toHaveBeenCalledTimes(4);
    expect((dispatchEventSpy.mock.calls[3][0] as CustomEvent).type).toBe('sketchgit:openShapeLibraryModal');

    dispatchEventSpy.mockRestore();
  });

  it('saveSelectionAsTemplate should do nothing if no selection', () => {
    const dispatchEventSpy = vi.spyOn(document, 'dispatchEvent');
    canvas.getSelectionData.mockReturnValue(null);

    const api = callCreateAPI();

    api.saveSelectionAsTemplate();
    expect(dispatchEventSpy).not.toHaveBeenCalled();

    dispatchEventSpy.mockRestore();
  });

  it('saveSelectionAsTemplate should dispatch openShapeLibraryModal with pendingSave if there is selection', () => {
    const dispatchEventSpy = vi.spyOn(document, 'dispatchEvent');
    const dummySelection = { objects: [{ type: 'rect' }] };
    canvas.getSelectionData.mockReturnValue(dummySelection);

    const api = callCreateAPI();

    api.saveSelectionAsTemplate();

    expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
    const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('sketchgit:openShapeLibraryModal');
    expect(event.detail.pendingSave).toBe(dummySelection);

    dispatchEventSpy.mockRestore();
  });
});
