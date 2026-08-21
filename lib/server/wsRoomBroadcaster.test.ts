import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  initRoomBroadcaster,
  broadcastToRoom,
  updateWsClientState,
  schedulePresenceBroadcast,
  RoomBroadcasterHandlers
} from './wsRoomBroadcaster.js';
import type { WsMessage } from '../sketchgit/types.js';

describe('wsRoomBroadcaster', () => {
  beforeEach(() => {
    // Reset the module-level registry before each test
    initRoomBroadcaster(null as any);
  });

  it('should be a no-op when not initialized', () => {
    // These should not throw even though handlers are null
    expect(() => broadcastToRoom('room1', { type: 'presence' } as unknown as WsMessage)).not.toThrow();
    expect(() => updateWsClientState('room1', 'client1', { displayName: 'Test' })).not.toThrow();
    expect(() => schedulePresenceBroadcast('room1')).not.toThrow();
  });

  describe('when initialized', () => {
    let mockHandlers: RoomBroadcasterHandlers;

    beforeEach(() => {
      mockHandlers = {
        broadcast: vi.fn(),
        updateClient: vi.fn(),
        schedulePresence: vi.fn(),
      };
      initRoomBroadcaster(mockHandlers);
    });

    it('should delegate broadcastToRoom to handlers', () => {
      const message = { type: 'presence' } as unknown as WsMessage;
      broadcastToRoom('room1', message);
      expect(mockHandlers.broadcast).toHaveBeenCalledWith('room1', message, undefined);

      broadcastToRoom('room2', message, 'client1');
      expect(mockHandlers.broadcast).toHaveBeenCalledWith('room2', message, 'client1');
    });

    it('should delegate updateWsClientState to handlers', () => {
      const updates = { displayName: 'Test User' };
      updateWsClientState('room1', 'client1', updates);
      expect(mockHandlers.updateClient).toHaveBeenCalledWith('room1', 'client1', updates);
    });

    it('should delegate schedulePresenceBroadcast to handlers', () => {
      schedulePresenceBroadcast('room1');
      expect(mockHandlers.schedulePresence).toHaveBeenCalledWith('room1');
    });
  });
});
