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

import { openModal, closeModal } from '../ui/modals';

const mockOpenModal = openModal as ReturnType<typeof vi.fn>;

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

    it('broadcasts the new name/colour when connected', () => {
      (document.getElementById('nameInput') as HTMLInputElement).value = 'Carol';
      coord.setName();
      expect(ctx.ws.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'profile', name: 'Carol' }),
      );
    });

    it('does NOT broadcast when WebSocket is disconnected', () => {
      (ctx.ws.isConnected as ReturnType<typeof vi.fn>).mockReturnValue(false);
      (document.getElementById('nameInput') as HTMLInputElement).value = 'Dave';
      coord.setName();
      expect(ctx.ws.send).not.toHaveBeenCalled();
    });

    it('closes the modal and keeps the default name when the input is empty', () => {
      (document.getElementById('nameInput') as HTMLInputElement).value = '';
      coord.setName();
      expect(coord.myName).toBe('User'); // unchanged
      expect(ctx.ws.send).not.toHaveBeenCalled();
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
});
