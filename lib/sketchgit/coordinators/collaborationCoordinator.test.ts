/**
 * Tests for CollaborationCoordinator.
 *
 * Verifies identity management (setName, broadcast), room setup, and
 * delegation to the CollaborationManager.
 */

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CollaborationCoordinator } from './collaborationCoordinator';
import type { AppContext } from './appContext';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../ui/modals', () => ({ openModal: vi.fn(), closeModal: vi.fn() }));
vi.mock('../userPreferences', () => ({
  loadPreferences: vi.fn().mockReturnValue(null),
  savePreferences: vi.fn(),
  setBranchInUrl: vi.fn(),
}));

import { openModal, closeModal } from '../ui/modals';
import { loadPreferences, savePreferences } from '../userPreferences';

const mockOpenModal = openModal as ReturnType<typeof vi.fn>;
const mockLoadPreferences = loadPreferences as ReturnType<typeof vi.fn>;
const mockSavePreferences = savePreferences as ReturnType<typeof vi.fn>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(): AppContext {
  return {
    git: {
      init: vi.fn().mockReturnValue('sha0'),
    } as unknown as AppContext['git'],
    canvas: {
      init: vi.fn(),
    } as unknown as AppContext['canvas'],
    ws: {
      connect: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
      send: vi.fn(),
    } as unknown as AppContext['ws'],
    collab: {
      getRoomFromUrl: vi.fn().mockReturnValue('room-123'),
      roomInviteLink: vi.fn().mockReturnValue('http://localhost/?room=room-123'),
      connectToPeerUI: vi.fn(),
      copyPeerId: vi.fn(),
      toggleCollabPanel: vi.fn(),
      sendProfile: vi.fn(),
    } as unknown as AppContext['collab'],
  };
}

function setupDom() {
  document.body.innerHTML = `
    <div id="myPeerId"></div>
    <input id="remotePeerInput" value=""/>
    <input id="nameInput" value="Alice"/>
    <div id="nameModal" class="open"></div>
  `;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CollaborationCoordinator', () => {
  let ctx: AppContext;
  let refresh: () => void;
  let coord: CollaborationCoordinator;

  beforeEach(() => {
    setupDom();
    vi.clearAllMocks();
    ctx = makeCtx();
    refresh = vi.fn();
    coord = new CollaborationCoordinator(ctx, refresh);
  });

  // ─── init ─────────────────────────────────────────────────────────────────

  describe('init()', () => {
    it('initialises canvas and git', () => {
      coord.init();
      expect(ctx.canvas.init).toHaveBeenCalledOnce();
      expect(ctx.git.init).toHaveBeenCalledOnce();
    });

    it('connects WebSocket to the room derived from the URL', () => {
      coord.init();
      expect(ctx.ws.connect).toHaveBeenCalledWith('room-123', coord.myName, coord.myColor);
    });

    it('sets the remotePeerInput value to the initial room id', () => {
      coord.init();
      expect((document.getElementById('remotePeerInput') as HTMLInputElement).value).toBe('room-123');
    });

    it('opens the name modal', () => {
      coord.init();
      expect(mockOpenModal).toHaveBeenCalledWith('nameModal');
    });

    it('calls refresh after initialising', () => {
      coord.init();
      expect(refresh).toHaveBeenCalledOnce();
    });
  });

  // ─── setName ──────────────────────────────────────────────────────────────

  describe('setName()', () => {
    it('updates myName from the nameInput element', () => {
      (document.getElementById('nameInput') as HTMLInputElement).value = 'Bob';
      coord.setName();
      expect(coord.myName).toBe('Bob');
    });

    it('broadcasts the new name/colour via REST when connected', () => {
      (document.getElementById('nameInput') as HTMLInputElement).value = 'Carol';
      coord.setName();
      expect(ctx.collab.sendProfile).toHaveBeenCalledWith('Carol', expect.any(String));
    });

    it('does NOT broadcast when WebSocket is disconnected', () => {
      (ctx.ws.isConnected as ReturnType<typeof vi.fn>).mockReturnValue(false);
      (document.getElementById('nameInput') as HTMLInputElement).value = 'Dave';
      coord.setName();
      expect(ctx.collab.sendProfile).not.toHaveBeenCalled();
    });

    it('closes the modal and keeps the default name when the input is empty', () => {
      (document.getElementById('nameInput') as HTMLInputElement).value = '';
      coord.setName();
      expect(coord.myName).toBe('User'); // unchanged
      expect(ctx.collab.sendProfile).not.toHaveBeenCalled();
      expect(closeModal).toHaveBeenCalledWith('nameModal');
    });

    it('closes the name modal', () => {
      coord.setName();
      // closeModal is mocked (vi.mock above); confirm it was called with 'nameModal'
      expect(closeModal).toHaveBeenCalledWith('nameModal');
    });
  });

  // ─── Collaboration panel delegation ───────────────────────────────────────

  describe('connectToPeer()', () => {
    it('delegates to CollaborationManager with current identity', () => {
      coord.myName = 'Eve';
      coord.myColor = '#123456';
      coord.connectToPeer();
      expect(ctx.collab.connectToPeerUI).toHaveBeenCalledWith('Eve', '#123456');
    });
  });

  describe('copyPeerId()', () => {
    it('delegates to CollaborationManager', () => {
      coord.copyPeerId();
      expect(ctx.collab.copyPeerId).toHaveBeenCalledOnce();
    });
  });

  describe('toggleCollabPanel()', () => {
    it('delegates to CollaborationManager', () => {
      coord.toggleCollabPanel();
      expect(ctx.collab.toggleCollabPanel).toHaveBeenCalledOnce();
    });
  });

  // ─── Returning-visitor recognition (localStorage preferences) ─────────────

  describe('init() with saved preferences', () => {
    it('restores saved name into myName without opening the modal', () => {
      mockLoadPreferences.mockReturnValue({ name: 'Returning User', color: '', lastRoomId: '', lastBranchName: '' });
      coord.init();
      expect(coord.myName).toBe('Returning User');
      expect(mockOpenModal).not.toHaveBeenCalledWith('nameModal');
    });

    it('restores saved color into myColor', () => {
      mockLoadPreferences.mockReturnValue({ name: 'Tina', color: '#abcdef', lastRoomId: '', lastBranchName: '' });
      coord.init();
      expect(coord.myColor).toBe('#abcdef');
    });

    it('pre-fills the nameInput element with the saved name', () => {
      mockLoadPreferences.mockReturnValue({ name: 'Frank', color: '', lastRoomId: '', lastBranchName: '' });
      coord.init();
      const input = document.getElementById('nameInput') as HTMLInputElement;
      expect(input.value).toBe('Frank');
    });

    it('passes the saved lastRoomId as fallback to getRoomFromUrl', () => {
      mockLoadPreferences.mockReturnValue({ name: 'Grace', color: '', lastRoomId: 'my-room', lastBranchName: '' });
      coord.init();
      expect(ctx.collab.getRoomFromUrl).toHaveBeenCalledWith('my-room');
    });

    it('opens the modal when no preferences are stored (first visit)', () => {
      mockLoadPreferences.mockReturnValue(null);
      coord.init();
      expect(mockOpenModal).toHaveBeenCalledWith('nameModal');
    });

    it('connects WebSocket with the restored name', () => {
      mockLoadPreferences.mockReturnValue({ name: 'Hank', color: '#ff0000', lastRoomId: '', lastBranchName: '' });
      coord.init();
      expect(ctx.ws.connect).toHaveBeenCalledWith(expect.any(String), 'Hank', '#ff0000');
    });
  });

  describe('setName() persistence', () => {
    it('calls savePreferences with the new name and current color', () => {
      (document.getElementById('nameInput') as HTMLInputElement).value = 'Ivy';
      coord.myColor = '#123456';
      coord.setName();
      expect(mockSavePreferences).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ivy', color: '#123456' }));
    });

    it('does NOT call savePreferences when the input is empty', () => {
      (document.getElementById('nameInput') as HTMLInputElement).value = '';
      coord.setName();
      expect(mockSavePreferences).not.toHaveBeenCalled();
    });
  });
});
