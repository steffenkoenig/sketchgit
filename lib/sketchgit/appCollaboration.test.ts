// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupCollaborationManager } from './appCollaboration';
import { CollaborationManager } from './realtime/collaborationManager';
import { WsClient } from './realtime/wsClient';
import { GitModel } from './git/gitModel';
import { CanvasEngine } from './canvas/canvasEngine';
import { TimelineCoordinator } from './coordinators/timelineCoordinator';
import { savePreferences, setBranchInUrl } from './userPreferences';
import { getQueuedActions } from './offline/offlineDb';
import { isOnline, onNetworkStatusChange } from './offline/networkStatus';

vi.mock('./realtime/collaborationManager', () => {
  type MockCollaborationManager = {
    ws: unknown;
    options: unknown;
    currentRoomId: string;
    getBranchFromUrl: ReturnType<typeof vi.fn>;
    sendProfile: ReturnType<typeof vi.fn>;
    broadcastDraw: ReturnType<typeof vi.fn>;
  };
  const CollaborationManager = vi.fn(function (this: MockCollaborationManager, ws: unknown, options: unknown) {
    this.ws = ws;
    this.options = options;
    this.currentRoomId = 'test-room';
    this.getBranchFromUrl = vi.fn().mockReturnValue('');
    this.sendProfile = vi.fn();
    this.broadcastDraw = vi.fn();
  });
  return { CollaborationManager };
});

vi.mock('./userPreferences', () => ({
  savePreferences: vi.fn(),
  setBranchInUrl: vi.fn(),
}));

vi.mock('./offline/offlineDb', () => ({
  getQueuedActions: vi.fn().mockResolvedValue([]),
}));

vi.mock('./offline/networkStatus', () => ({
  isOnline: vi.fn().mockReturnValue(true),
  onNetworkStatusChange: vi.fn(),
}));

describe('setupCollaborationManager', () => {
  let mockWs: any;
  let mockGit: any;
  let mockCanvas: any;
  let mockTl: any;
  let mockStartupPrefs: any;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();

    mockWs = { name: 'TestUser', color: '#000' };
    mockGit = {
      commits: {},
      branches: { main: 'sha1' },
      HEAD: 'main',
      detached: null,
      checkout: vi.fn(),
    };
    mockCanvas = {
      getCanvasData: vi.fn().mockReturnValue('canvas_data'),
      loadCanvasData: vi.fn(),
      clearDirty: vi.fn(),
      applyRemoteLock: vi.fn(),
      clearRemoteLock: vi.fn(),
      applyViewport: vi.fn(),
      getViewport: vi.fn(),
    };
    mockTl = {
      refresh: vi.fn(),
      updateUI: vi.fn(),
    };
    mockStartupPrefs = { lastBranchName: undefined };
  });

  it('instantiates CollaborationManager with proper callbacks', () => {
    const collab = setupCollaborationManager(
      mockWs as WsClient,
      mockGit as GitModel,
      mockStartupPrefs,
      () => mockCanvas as CanvasEngine,
      () => mockTl as TimelineCoordinator
    );

    expect(CollaborationManager).toHaveBeenCalled();
    expect(onNetworkStatusChange).toHaveBeenCalled();

    const injectedOptions = (collab as any).options;

    expect(injectedOptions.getCanvasData()).toBe('canvas_data');
    expect(mockCanvas.getCanvasData).toHaveBeenCalled();

    injectedOptions.loadCanvasData('data2');
    expect(mockCanvas.loadCanvasData).toHaveBeenCalledWith('data2');

    injectedOptions.renderTimeline();
    expect(mockTl.refresh).toHaveBeenCalled();

    injectedOptions.updateUI();
    expect(mockTl.updateUI).toHaveBeenCalled();

    expect(injectedOptions.getGitState()).toEqual({
      commits: {},
      branches: { main: 'sha1' },
      HEAD: 'main',
      detached: null,
    });
  });

  describe('applyGitState', () => {
    it('applies state and loads canvas data if commit exists', () => {
      const collab = setupCollaborationManager(
        mockWs as WsClient,
        mockGit as GitModel,
        mockStartupPrefs,
        () => mockCanvas as CanvasEngine,
        () => mockTl as TimelineCoordinator
      );
      const injectedOptions = (collab as any).options;

      const newState = {
        commits: { sha2: { canvas: 'new_canvas' } },
        branches: { dev: 'sha2' },
        HEAD: 'dev',
        detached: null,
      };

      injectedOptions.applyGitState(newState);

      expect(mockGit.commits).toEqual({ sha2: { canvas: 'new_canvas' } });
      expect(mockGit.branches).toEqual({ main: 'sha1', dev: 'sha2' });
      expect(mockGit.HEAD).toBe('dev');
      expect(mockCanvas.loadCanvasData).toHaveBeenCalledWith('new_canvas');
    });

    it('checks out preferred branch if different from HEAD', () => {
        const collab = setupCollaborationManager(
            mockWs as WsClient,
            mockGit as GitModel,
            { lastBranchName: 'dev' },
            () => mockCanvas as CanvasEngine,
            () => mockTl as TimelineCoordinator
        );
        const injectedOptions = (collab as any).options;

        const newState = {
            commits: { sha2: { canvas: 'new_canvas' } },
            branches: { dev: 'sha2', main: 'sha1' },
            HEAD: 'main',
            detached: null,
        };

        injectedOptions.applyGitState(newState);

        expect(mockGit.checkout).toHaveBeenCalledWith('dev');
        expect(mockCanvas.loadCanvasData).toHaveBeenCalledWith('new_canvas');
        expect(mockCanvas.clearDirty).toHaveBeenCalled();
        expect(setBranchInUrl).toHaveBeenCalledWith('dev');
        expect((collab as any).sendProfile).toHaveBeenCalledWith('TestUser', '#000', 'dev', 'sha2');
    });
  });

  describe('Git model callbacks', () => {
      it('receiveCommit updates git commits', () => {
          const collab = setupCollaborationManager(mockWs, mockGit, null, () => mockCanvas, () => mockTl);
          const injectedOptions = (collab as any).options;

          injectedOptions.receiveCommit('sha3', { message: 'test' });
          expect(mockGit.commits['sha3']).toEqual({ message: 'test' });
      });

      it('applyBranchUpdate updates git branches', () => {
          const collab = setupCollaborationManager(mockWs, mockGit, null, () => mockCanvas, () => mockTl);
          const injectedOptions = (collab as any).options;

          injectedOptions.applyBranchUpdate('feature', 'sha4');
          expect(mockGit.branches['feature']).toBe('sha4');
      });
  });

  describe('Canvas callbacks', () => {
      it('applyRemoteLock, clearRemoteLock, applyViewport, getViewport map to canvas methods', () => {
          const collab = setupCollaborationManager(mockWs, mockGit, null, () => mockCanvas, () => mockTl);
          const injectedOptions = (collab as any).options;

          injectedOptions.applyRemoteLock('client1', ['obj1'], '#f00');
          expect(mockCanvas.applyRemoteLock).toHaveBeenCalledWith('client1', ['obj1'], '#f00');

          injectedOptions.clearRemoteLock('client1');
          expect(mockCanvas.clearRemoteLock).toHaveBeenCalledWith('client1');

          injectedOptions.applyViewport({ zoom: 2 });
          expect(mockCanvas.applyViewport).toHaveBeenCalledWith({ zoom: 2 });

          injectedOptions.getViewport();
          expect(mockCanvas.getViewport).toHaveBeenCalled();
      });
  });

  describe('onRoomJoined', () => {
      it('saves preferences with lastRoomId', () => {
          const collab = setupCollaborationManager(mockWs, mockGit, null, () => mockCanvas, () => mockTl);
          const injectedOptions = (collab as any).options;

          injectedOptions.onRoomJoined('room123');
          expect(savePreferences).toHaveBeenCalledWith({ lastRoomId: 'room123' });
      });
  });

  describe('onRoleChanged', () => {
      it('adds role-viewer class and badge when role is VIEWER', () => {
          const collab = setupCollaborationManager(mockWs, mockGit, null, () => mockCanvas, () => mockTl);
          const injectedOptions = (collab as any).options;

          injectedOptions.onRoleChanged('VIEWER');
          expect(document.body.classList.contains('role-viewer')).toBe(true);
          const badge = document.getElementById('readOnlyBadge');
          expect(badge).toBeTruthy();
          expect(badge?.textContent).toBe('Read-only — you have viewer access to this room');
      });

      it('removes role-viewer class and badge when role is not VIEWER', () => {
          const collab = setupCollaborationManager(mockWs, mockGit, null, () => mockCanvas, () => mockTl);
          const injectedOptions = (collab as any).options;

          // First set to viewer
          injectedOptions.onRoleChanged('VIEWER');
          expect(document.getElementById('readOnlyBadge')).toBeTruthy();

          // Then change to EDITOR
          injectedOptions.onRoleChanged('EDITOR');
          expect(document.body.classList.contains('role-viewer')).toBe(false);
          expect(document.getElementById('readOnlyBadge')).toBeNull();
      });
  });

  describe('onOfflineQueueChanged', () => {
      it('calls updateOfflineBadge and creates badge when offline', async () => {
          vi.mocked(isOnline).mockReturnValue(false);

          const collab = setupCollaborationManager(mockWs, mockGit, null, () => mockCanvas, () => mockTl);
          const injectedOptions = (collab as any).options;

          injectedOptions.onOfflineQueueChanged();

          // Yield to let the async updateOfflineBadge complete
          await new Promise(resolve => setImmediate(resolve));

          const badge = document.getElementById('offlineBadge');
          expect(badge).toBeTruthy();
          expect(badge?.textContent).toContain('Offline');
          expect(badge?.className).toContain('offline-badge offline');
      });

      it('calls updateOfflineBadge and creates badge when online but queued items exist', async () => {
          vi.mocked(isOnline).mockReturnValue(true);
          vi.mocked(getQueuedActions).mockResolvedValue(['action1', 'action2'] as any);

          const collab = setupCollaborationManager(mockWs, mockGit, null, () => mockCanvas, () => mockTl);
          const injectedOptions = (collab as any).options;

          injectedOptions.onOfflineQueueChanged();

          await new Promise(resolve => setImmediate(resolve));

          const badge = document.getElementById('offlineBadge');
          expect(badge).toBeTruthy();
          expect(badge?.textContent).toContain('Syncing 2 offline changes');
          expect(badge?.className).toContain('offline-badge syncing');
      });

      it('removes badge when online and no queued items', async () => {
          vi.mocked(isOnline).mockReturnValue(true);
          vi.mocked(getQueuedActions).mockResolvedValue([]);

          const collab = setupCollaborationManager(mockWs, mockGit, null, () => mockCanvas, () => mockTl);
          const injectedOptions = (collab as any).options;

          // Create badge first
          const badgeEl = document.createElement('div');
          badgeEl.id = 'offlineBadge';
          document.body.appendChild(badgeEl);

          injectedOptions.onOfflineQueueChanged();

          await new Promise(resolve => setImmediate(resolve));

          const badge = document.getElementById('offlineBadge');
          expect(badge).toBeNull();
      });
  });

  describe('onAccessDenied', () => {
      it('dispatches sketchgit:roomPasswordRequired event when reason is PASSWORD_REQUIRED', () => {
          const collab = setupCollaborationManager(mockWs, mockGit, null, () => mockCanvas, () => mockTl);
          const injectedOptions = (collab as any).options;

          const dispatchSpy = vi.spyOn(document, 'dispatchEvent');

          injectedOptions.onAccessDenied('PASSWORD_REQUIRED', 'room123');

          expect(dispatchSpy).toHaveBeenCalled();
          const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
          expect(event.type).toBe('sketchgit:roomPasswordRequired');
          expect(event.detail.roomId).toBe('room123');
      });

      it('does nothing when reason is not PASSWORD_REQUIRED', () => {
          const collab = setupCollaborationManager(mockWs, mockGit, null, () => mockCanvas, () => mockTl);
          const injectedOptions = (collab as any).options;

          const dispatchSpy = vi.spyOn(document, 'dispatchEvent');

          injectedOptions.onAccessDenied('PRIVATE_ROOM', 'room123');

          expect(dispatchSpy).not.toHaveBeenCalled();
      });
  });
});
