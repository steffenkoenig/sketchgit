import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  initRoomBroadcaster,
  broadcastToRoom,
  updateWsClientState,
  schedulePresenceBroadcast,
  updateClientRole,
  RoomBroadcasterHandlers,
  WsClientStateUpdate
} from './wsRoomBroadcaster.js';
import type { WsMessage } from '../sketchgit/types.js';

describe('wsRoomBroadcaster', () => {
  let mockHandlers: RoomBroadcasterHandlers;

  beforeEach(() => {
    // Reset the module state before each test
    // @ts-expect-error Resetting module state for testing
    initRoomBroadcaster(null);

    mockHandlers = {
      broadcast: vi.fn(),
      updateClient: vi.fn(),
      schedulePresence: vi.fn(),
      updateClientRole: vi.fn(),
    };
  });

  describe('when uninitialized', () => {
    it('does not throw when calling broadcastToRoom', () => {
      expect(() => {
        broadcastToRoom('room1', { type: 'presence' });
      }).not.toThrow();
    });

    it('does not throw when calling updateWsClientState', () => {
      expect(() => {
        updateWsClientState('room1', 'client1', { displayName: 'test' });
      }).not.toThrow();
    });

    it('does not throw when calling schedulePresenceBroadcast', () => {
      expect(() => {
        schedulePresenceBroadcast('room1');
      }).not.toThrow();
    });

    it('does not throw when calling updateClientRole', () => {
      expect(() => {
        updateClientRole('room1', 'user1', 'VIEWER');
      }).not.toThrow();
    });
  });

  describe('when initialized', () => {
    beforeEach(() => {
      initRoomBroadcaster(mockHandlers);
    });

    it('delegates broadcastToRoom to the broadcast handler', () => {
      const msg: WsMessage = { type: 'presence' };
      broadcastToRoom('room1', msg, 'client2');

      expect(mockHandlers.broadcast).toHaveBeenCalledWith('room1', msg, 'client2');
    });

    it('delegates broadcastToRoom to the broadcast handler without excludeClientId', () => {
      const msg: WsMessage = { type: 'presence' };
      broadcastToRoom('room1', msg);

      expect(mockHandlers.broadcast).toHaveBeenCalledWith('room1', msg, undefined);
    });

    it('delegates updateWsClientState to the updateClient handler', () => {
      const updates: WsClientStateUpdate = { displayName: 'Test User', currentBranch: 'main' };
      updateWsClientState('room1', 'client1', updates);

      expect(mockHandlers.updateClient).toHaveBeenCalledWith('room1', 'client1', updates);
    });

    it('delegates schedulePresenceBroadcast to the schedulePresence handler', () => {
      schedulePresenceBroadcast('room1');

      expect(mockHandlers.schedulePresence).toHaveBeenCalledWith('room1');
    });

    it('delegates updateClientRole to the updateClientRole handler', () => {
      updateClientRole('room1', 'user1', 'VIEWER');

      expect(mockHandlers.updateClientRole).toHaveBeenCalledWith('room1', 'user1', 'VIEWER');
    });
  });
});
