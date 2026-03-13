// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const tlCallbacks = {
    onCommitClick: (_sha: string, _x: number, _y: number) => {},
    onBranchClick: (_name: string) => {},
  };
  const mockGit = {
    init: vi.fn().mockReturnValue('sha0'),
    commit: vi.fn().mockReturnValue('sha1'),
    createBranch: vi.fn().mockReturnValue(true),
    checkout: vi.fn().mockReturnValue('sha0'),
    checkoutCommit: vi.fn().mockReturnValue('sha0'),
    merge: vi.fn().mockReturnValue({ type: 'ok', sha: 'sha2' }),
    currentSHA: vi.fn().mockReturnValue('sha0'),
    branchColor: vi.fn().mockReturnValue('#7c6eff'),
    branches: { main: 'sha0' } as Record<string, string>,
    commits: { sha0: { sha: 'sha0', message: 'init', canvas: '{}', branch: 'main', parents: [], ts: 1000, isMerge: false } } as Record<string, unknown>,
    HEAD: 'main',
    detached: null as string | null,
  };
  const mockCanvas = {
    init: vi.fn(), destroy: vi.fn(), markDirty: vi.fn(), clearDirty: vi.fn(), isDirty: false,
    getCanvasData: vi.fn().mockReturnValue('{"version":"5","objects":[]}'),
    loadCanvasData: vi.fn(), setTool: vi.fn(), updateStrokeColor: vi.fn(),
    updateFillColor: vi.fn(), toggleFill: vi.fn(), setStrokeWidth: vi.fn(),
    zoomIn: vi.fn(), zoomOut: vi.fn(), resetZoom: vi.fn(),
    currentTool: 'rect', strokeColor: '#000', fillColor: '#fff', strokeWidth: 1, fillEnabled: false, canvas: {},
  };
  const mockWs = {
    connect: vi.fn(), disconnect: vi.fn(), send: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true), name: 'User', color: '#7c6eff',
    onMessage: null, onStatusChange: null,
  };
  const mockCollab = {
    getRoomFromUrl: vi.fn().mockReturnValue('default'),
    roomInviteLink: vi.fn().mockReturnValue('http://localhost/?room=default'),
    toggleCollabPanel: vi.fn(), broadcastDraw: vi.fn(), broadcastCursor: vi.fn(),
    destroy: vi.fn(), connectToPeerUI: vi.fn(), copyPeerId: vi.fn(), updateCollabUI: vi.fn(),
    getPresenceClients: vi.fn().mockReturnValue([]),
    getMyClientId: vi.fn().mockReturnValue(''),
    togglePresenting: vi.fn(),
    sendCommit: vi.fn(), sendBranchUpdate: vi.fn(), sendProfile: vi.fn(),
    wsClientId: null, currentRoomId: 'default',
  };
  return { mockGit, mockCanvas, mockWs, mockCollab, tlCallbacks };
});

vi.mock('./git/gitModel', () => ({ GitModel: vi.fn(function() { return mocks.mockGit; }) }));
vi.mock('./canvas/canvasEngine', () => ({ CanvasEngine: vi.fn(function() { return mocks.mockCanvas; }) }));
vi.mock('./realtime/wsClient', () => ({ WsClient: vi.fn(function() { return mocks.mockWs; }) }));
vi.mock('./realtime/collaborationManager', () => ({ CollaborationManager: vi.fn(function() { return mocks.mockCollab; }) }));
vi.mock('./ui/timelineRenderer', () => ({
  renderTimeline: vi.fn((git, onCC, onBC) => { mocks.tlCallbacks.onCommitClick = onCC; mocks.tlCallbacks.onBranchClick = onBC; }),
}));
vi.mock('./ui/toast', () => ({ showToast: vi.fn() }));
vi.mock('./ui/modals', () => ({ openModal: vi.fn(), closeModal: vi.fn() }));
vi.mock('./userPreferences', () => ({ loadPreferences: vi.fn().mockReturnValue(null), savePreferences: vi.fn(), setBranchInUrl: vi.fn() }));

import { createSketchGitApp } from './app';

function setupDom() {
  document.body.innerHTML = `
    <div id="currentBranchName"></div><div id="headSHA"></div><div id="currentBranchDot"></div>
    <div id="tlscroll" style="overflow:auto;width:400px"></div><svg id="tlsvg"></svg>
    <div id="collab-panel"></div><div id="commit-popup"></div>
    <div id="cp-head-badge"></div><div id="cp-sha"></div><div id="cp-msg"></div><div id="cp-meta"></div>
    <input id="commitMsg" value=""/><input id="remotePeerInput" value=""/>
    <input id="nameInput" value="Alice"/><div id="myPeerId"></div>
    <input id="newBranchName" value="feature"/><div id="branchFromInfo"></div><div id="branchListEl"></div>
    <select id="mergeSourceSelect"></select><div id="mergeTargetName"></div>
    <div id="conflictList"></div><div id="conflictStats"></div><div id="conflictSummary"></div><div id="topbar"></div>`;
}

function resetState() {
  mocks.mockGit.HEAD = 'main'; mocks.mockGit.detached = null;
  mocks.mockGit.branches = { main: 'sha0' };
  mocks.mockGit.commits = { sha0: { sha: 'sha0', message: 'init', canvas: '{}', branch: 'main', parents: [], ts: 1000, isMerge: false } };
  mocks.mockCanvas.isDirty = false;
  mocks.mockGit.currentSHA.mockReturnValue('sha0');
  mocks.mockGit.commit.mockReturnValue('sha1');
  mocks.mockGit.merge.mockReturnValue({ type: 'ok', sha: 'sha2' });
  mocks.mockCollab.getRoomFromUrl.mockReturnValue('default');
  Object.values(mocks.mockGit).forEach(v => typeof v === 'function' && (v as ReturnType<typeof vi.fn>).mockClear?.());
  Object.values(mocks.mockCanvas).forEach(v => typeof v === 'function' && (v as ReturnType<typeof vi.fn>).mockClear?.());
  Object.values(mocks.mockWs).forEach(v => typeof v === 'function' && (v as ReturnType<typeof vi.fn>).mockClear?.());
  Object.values(mocks.mockCollab).forEach(v => typeof v === 'function' && (v as ReturnType<typeof vi.fn>).mockClear?.());
  mocks.mockGit.currentSHA.mockReturnValue('sha0');
  mocks.mockGit.commit.mockReturnValue('sha1');
  mocks.mockGit.merge.mockReturnValue({ type: 'ok', sha: 'sha2' });
  mocks.mockCollab.getRoomFromUrl.mockReturnValue('default');
  mocks.mockCollab.roomInviteLink.mockReturnValue('http://localhost/?room=default');
  mocks.mockCanvas.getCanvasData.mockReturnValue('{"version":"5","objects":[]}');
}

describe('createSketchGitApp', () => {
  beforeEach(() => { setupDom(); resetState(); });

  it('init calls canvas.init, git.init, ws.connect', () => {
    createSketchGitApp();
    expect(mocks.mockCanvas.init).toHaveBeenCalled();
    expect(mocks.mockGit.init).toHaveBeenCalled();
    expect(mocks.mockWs.connect).toHaveBeenCalledWith('default', expect.any(String), expect.any(String));
  });

  it('destroy() tears down all subsystems', () => {
    const app = createSketchGitApp();
    app.destroy();
    expect(mocks.mockWs.disconnect).toHaveBeenCalled();
    expect(mocks.mockCollab.destroy).toHaveBeenCalled();
    expect(mocks.mockCanvas.destroy).toHaveBeenCalled();
  });

  it('canvas method delegates: setTool, zoomIn, zoomOut, resetZoom, toggleFill, setStrokeWidth', () => {
    const app = createSketchGitApp();
    app.setTool('rect'); expect(mocks.mockCanvas.setTool).toHaveBeenCalledWith('rect');
    app.updateStrokeColor('#f00'); expect(mocks.mockCanvas.updateStrokeColor).toHaveBeenCalled();
    app.updateFillColor('#00f'); expect(mocks.mockCanvas.updateFillColor).toHaveBeenCalled();
    app.toggleFill(); expect(mocks.mockCanvas.toggleFill).toHaveBeenCalled();
    app.setStrokeWidth(3); expect(mocks.mockCanvas.setStrokeWidth).toHaveBeenCalledWith(3);
    app.zoomIn(); expect(mocks.mockCanvas.zoomIn).toHaveBeenCalled();
    app.zoomOut(); expect(mocks.mockCanvas.zoomOut).toHaveBeenCalled();
    app.resetZoom(); expect(mocks.mockCanvas.resetZoom).toHaveBeenCalled();
  });

  it('collab delegates: toggleCollabPanel, copyPeerId, connectToPeer', () => {
    const app = createSketchGitApp();
    app.toggleCollabPanel(); expect(mocks.mockCollab.toggleCollabPanel).toHaveBeenCalled();
    app.copyPeerId(); expect(mocks.mockCollab.copyPeerId).toHaveBeenCalled();
    app.connectToPeer(); expect(mocks.mockCollab.connectToPeerUI).toHaveBeenCalled();
  });

  it('closeCommitPopup removes open class', () => {
    const app = createSketchGitApp();
    document.getElementById('commit-popup')!.classList.add('open');
    app.closeCommitPopup();
    expect(document.getElementById('commit-popup')!.classList.contains('open')).toBe(false);
  });

  it('openCommitPopup via timeline callback', () => {
    createSketchGitApp();
    mocks.tlCallbacks.onCommitClick('sha0', 200, 200);
    expect(document.getElementById('commit-popup')!.classList.contains('open')).toBe(true);
  });

  it('cpCheckout shows toast when already at HEAD', async () => {
    const { showToast } = await import('./ui/toast');
    const app = createSketchGitApp();
    mocks.tlCallbacks.onCommitClick('sha0', 100, 100);
    app.cpCheckout();
    expect(showToast).toHaveBeenCalledWith('Already at this commit');
  });

  it('cpCheckout checks out a different commit', () => {
    mocks.mockGit.commits = {
      sha0: { sha: 'sha0', message: 'init', canvas: '{}', branch: 'main', parents: [], ts: 1000, isMerge: false },
      sha1: { sha: 'sha1', message: 'c2', canvas: '{}', branch: 'main', parents: ['sha0'], ts: 2000, isMerge: false },
    };
    const app = createSketchGitApp();
    mocks.tlCallbacks.onCommitClick('sha1', 100, 100);
    app.cpCheckout();
    expect(mocks.mockGit.checkoutCommit).toHaveBeenCalledWith('sha1');
  });

  it('cpBranchFrom opens branch create modal', async () => {
    const { openModal } = await import('./ui/modals');
    const app = createSketchGitApp();
    mocks.tlCallbacks.onCommitClick('sha0', 100, 100);
    app.cpBranchFrom();
    expect(openModal).toHaveBeenCalledWith('branchCreateModal');
  });

  it('cpRollback shows toast when detached', async () => {
    const { showToast } = await import('./ui/toast');
    mocks.mockGit.detached = 'sha0';
    const app = createSketchGitApp();
    mocks.tlCallbacks.onCommitClick('sha0', 100, 100);
    app.cpRollback();
    expect(showToast).toHaveBeenCalledWith('⚠ Not on a branch', true);
  });

  it('cpRollback rolls back after confirm', async () => {
    const { openModal } = await import('./ui/modals');
    // Add the confirmModal elements to the DOM
    document.body.innerHTML += `
      <div id="confirmModal"></div>
      <p id="confirmModalMessage"></p>
      <button id="confirmModalOkBtn">Confirm</button>
    `;
    const app = createSketchGitApp();
    mocks.tlCallbacks.onCommitClick('sha0', 100, 100);
    app.cpRollback();
    // The confirm modal should be opened (not window.confirm)
    expect(openModal).toHaveBeenCalledWith('confirmModal');
    // Simulate user clicking Confirm
    app.acceptConfirm();
    expect(mocks.mockCanvas.loadCanvasData).toHaveBeenCalled();
  });

  it('openCommitModal shows toast when not dirty', async () => {
    const { showToast } = await import('./ui/toast');
    const app = createSketchGitApp();
    app.openCommitModal();
    expect(showToast).toHaveBeenCalledWith('Nothing new to commit');
  });

  it('openCommitModal opens modal when dirty', async () => {
    const { openModal } = await import('./ui/modals');
    mocks.mockCanvas.isDirty = true;
    const app = createSketchGitApp();
    app.openCommitModal();
    expect(openModal).toHaveBeenCalledWith('commitModal');
  });

  it('doCommit commits, sends commit via REST', () => {
    (document.getElementById('commitMsg') as HTMLInputElement).value = 'My commit';
    mocks.mockGit.commits.sha1 = { sha: 'sha1', message: 'My commit', canvas: '{}', branch: 'main', parents: ['sha0'], ts: 2000, isMerge: false };
    const app = createSketchGitApp();
    app.doCommit();
    expect(mocks.mockGit.commit).toHaveBeenCalledWith(expect.any(String), 'My commit');
    expect(mocks.mockCollab.sendCommit).toHaveBeenCalledWith('sha1', expect.anything());
  });

  it('doCommit uses default message when input is empty', () => {
    (document.getElementById('commitMsg') as HTMLInputElement).value = '';
    mocks.mockGit.commits.sha1 = { sha: 'sha1', message: 'Snapshot at 00:00', canvas: '{}', branch: 'main', parents: ['sha0'], ts: 2000, isMerge: false };
    const app = createSketchGitApp();
    app.doCommit();
    expect(mocks.mockGit.commit).toHaveBeenCalledWith(expect.any(String), expect.stringMatching(/^Snapshot at /));
  });

  it('doCommit does nothing when commit returns null', () => {
    mocks.mockGit.commit.mockReturnValue(null);
    const app = createSketchGitApp();
    app.doCommit();
    expect(mocks.mockCollab.sendCommit).not.toHaveBeenCalled();
  });

  it('openBranchModal opens modal and populates list', async () => {
    const { openModal } = await import('./ui/modals');
    mocks.mockGit.branches = { main: 'sha0', dev: 'sha0' };
    const app = createSketchGitApp();
    app.openBranchModal();
    expect(openModal).toHaveBeenCalledWith('branchModal');
  });

  it('openBranchCreate opens modal', async () => {
    const { openModal } = await import('./ui/modals');
    const app = createSketchGitApp();
    app.openBranchCreate();
    expect(openModal).toHaveBeenCalledWith('branchCreateModal');
  });

  it('doCreateBranch creates branch and shows toast', async () => {
    const { showToast } = await import('./ui/toast');
    (document.getElementById('newBranchName') as HTMLInputElement).value = 'feature';
    mocks.mockGit.createBranch.mockReturnValue(true);
    const app = createSketchGitApp();
    app.doCreateBranch();
    expect(mocks.mockGit.createBranch).toHaveBeenCalledWith('feature', null);
    expect(showToast).toHaveBeenCalled();
  });

  it('openMergeModal opens modal', async () => {
    const { openModal } = await import('./ui/modals');
    mocks.mockGit.branches = { main: 'sha0', dev: 'sha0' };
    const app = createSketchGitApp();
    app.openMergeModal();
    expect(openModal).toHaveBeenCalledWith('mergeModal');
  });

  it('doMerge handles ok result', async () => {
    const { showToast } = await import('./ui/toast');
    const sel = document.getElementById('mergeSourceSelect') as HTMLSelectElement;
    const opt = document.createElement('option'); opt.value = 'dev'; sel.appendChild(opt); sel.value = 'dev';
    mocks.mockGit.merge.mockReturnValue({ type: 'ok', sha: 'sha2' });
    const app = createSketchGitApp();
    app.doMerge();
    expect(showToast).toHaveBeenCalled();
  });

  it('doMerge handles up-to-date result', async () => {
    const { showToast } = await import('./ui/toast');
    const sel = document.getElementById('mergeSourceSelect') as HTMLSelectElement;
    const opt = document.createElement('option'); opt.value = 'dev'; sel.appendChild(opt); sel.value = 'dev';
    mocks.mockGit.merge.mockReturnValue({ type: 'up-to-date' });
    const app = createSketchGitApp();
    app.doMerge();
    expect(showToast).toHaveBeenCalled();
  });

  it('doMerge handles no-source result', async () => {
    const { showToast } = await import('./ui/toast');
    const sel = document.getElementById('mergeSourceSelect') as HTMLSelectElement;
    const opt = document.createElement('option'); opt.value = 'dev'; sel.appendChild(opt); sel.value = 'dev';
    mocks.mockGit.merge.mockReturnValue({ type: 'no-source' });
    const app = createSketchGitApp();
    app.doMerge();
    expect(showToast).toHaveBeenCalledWith(expect.any(String), true);
  });

  it('resolveAllOurs, resolveAllTheirs, applyMergeResolution do not throw', () => {
    const app = createSketchGitApp();
    expect(() => app.resolveAllOurs()).not.toThrow();
    expect(() => app.resolveAllTheirs()).not.toThrow();
    expect(() => app.applyMergeResolution()).not.toThrow();
  });

  it('setName updates connection via REST', async () => {
    const { closeModal } = await import('./ui/modals');
    (document.getElementById('nameInput') as HTMLInputElement).value = 'Bob';
    mocks.mockCollab.getRoomFromUrl.mockReturnValue('room1');
    const app = createSketchGitApp();
    app.setName();
    expect(closeModal).toHaveBeenCalledWith('nameModal');
    expect(mocks.mockCollab.sendProfile).toHaveBeenCalledWith('Bob', expect.any(String));
  });

  it('tlScrollLeft and tlScrollRight do not throw', () => {
    const app = createSketchGitApp();
    expect(() => app.tlScrollLeft()).not.toThrow();
    expect(() => app.tlScrollRight()).not.toThrow();
  });

  it('clicking outside collab panel closes it', () => {
    createSketchGitApp();
    document.getElementById('collab-panel')!.classList.add('open');
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(mocks.mockCollab.toggleCollabPanel).toHaveBeenCalled();
  });

  it('branch click in timeline checks out branch', () => {
    mocks.mockGit.commits = { sha0: { sha:'sha0', message:'init', canvas:'{}', branch:'main', parents:[], ts:1000, isMerge:false } };
    mocks.mockGit.branches = { main: 'sha0', dev: 'sha0' };
    createSketchGitApp();
    mocks.tlCallbacks.onBranchClick('dev');
    expect(mocks.mockGit.checkout).toHaveBeenCalledWith('dev');
  });
});
