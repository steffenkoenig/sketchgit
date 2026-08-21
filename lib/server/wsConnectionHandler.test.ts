import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWsConnectionHandler, handleWsMessage, type ConnectionHandlerDeps, type ClientState } from './wsConnectionHandler.js';
import type { WsMessage } from '../sketchgit/types.js';
import * as roomRepo from '../db/roomRepository.js';

vi.mock('../db/roomRepository.js', () => ({
  checkRoomAccess: vi.fn(),
  addRoomMember: vi.fn(),
  resolveRoomId: vi.fn((id) => Promise.resolve(id)),
  appendRoomEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./cookieHelpers.js', () => ({
  parseCookies: vi.fn().mockReturnValue({}),
}));

vi.mock('./shareLinkTokens.js', () => ({
  verifyScopeCookie: vi.fn(),
  mapPermissionToRole: vi.fn(),
}));

function createMockDeps(): ConnectionHandlerDeps {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      fatal: vi.fn(),
      trace: vi.fn(),
    } as any,
    prisma: {} as any,
    env: { MAX_CLIENTS_PER_ROOM: 5, MAX_WS_PAYLOAD_BYTES: 1000 } as any,
    rooms: new Map(),
    roomCache: { get: vi.fn(), set: vi.fn() },
    roomCleanupTimers: new Map(),
    connectionsPerIp: new Map(),
    safeRoomId: vi.fn((id) => id ?? 'safe-room'),
    safeName: vi.fn((name) => name ?? 'safe-name'),
    safeColor: vi.fn((color) => color ?? 'safe-color'),
    getRoom: vi.fn().mockReturnValue(new Map()),
    dbEnsureRoom: vi.fn().mockResolvedValue(undefined),
    sendTo: vi.fn(),
    schedulePushPresence: vi.fn(),
    dbLoadSnapshot: vi.fn().mockResolvedValue(null),
    ROOM_CLEANUP_DELAY_MS: 1000,
    broadcastRoom: vi.fn(),
  };
}

describe('wsConnectionHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createWsConnectionHandler', () => {
    it('should close connection if access is denied', async () => {
      vi.mocked(roomRepo.checkRoomAccess).mockResolvedValueOnce({ allowed: false, reason: 'PRIVATE_ROOM' });
      const deps = createMockDeps();
      const handler = createWsConnectionHandler(deps);

      const ws = { close: vi.fn(), on: vi.fn() } as unknown as ClientState;
      const reqUrl = new URL('ws://localhost?room=test');

      // Wait for the async iife to run
      handler(ws, reqUrl);

      // We need to wait for promises to resolve
      await new Promise(process.nextTick);

      expect(deps.sendTo).toHaveBeenCalledWith(ws, expect.objectContaining({
        type: 'error',
        code: 'ACCESS_DENIED'
      }));
      expect(ws.close).toHaveBeenCalledWith(1008, 'Access denied');
    });

    it('should close connection if room is at capacity', async () => {
      vi.mocked(roomRepo.checkRoomAccess).mockResolvedValueOnce({ allowed: true, role: 'EDITOR' });
      const deps = createMockDeps();

      const mockRoom = new Map();
      mockRoom.set('c1', {});
      mockRoom.set('c2', {});
      mockRoom.set('c3', {});
      mockRoom.set('c4', {});
      mockRoom.set('c5', {}); // 5 clients, max is 5

      deps.rooms.set('test-room', mockRoom);

      const handler = createWsConnectionHandler(deps);
      const ws = { close: vi.fn(), on: vi.fn() } as unknown as ClientState;
      const reqUrl = new URL('ws://localhost?room=test-room');

      handler(ws, reqUrl);
      await new Promise(process.nextTick);

      expect(deps.sendTo).toHaveBeenCalledWith(ws, expect.objectContaining({
        type: 'error',
        code: 'ROOM_FULL'
      }));
      expect(ws.close).toHaveBeenCalledWith(1008, 'Room at capacity');
    });

    it('should finalize connection if access allowed and capacity ok', async () => {
      vi.mocked(roomRepo.checkRoomAccess).mockResolvedValueOnce({ allowed: true, role: 'EDITOR' });
      const deps = createMockDeps();
      const handler = createWsConnectionHandler(deps);
      const ws = { close: vi.fn(), on: vi.fn() } as unknown as ClientState;
      const reqUrl = new URL('ws://localhost?room=test-room');

      handler(ws, reqUrl);
      await new Promise(process.nextTick);
      await new Promise(process.nextTick); // extra tick for appendRoomEvent catch etc

      expect(deps.sendTo).toHaveBeenCalledWith(ws, expect.objectContaining({
        type: 'welcome',
        roomId: 'test-room'
      }));
      expect(deps.schedulePushPresence).toHaveBeenCalledWith('test-room');
    });
  });

  describe('handleWsMessage', () => {
    it('should ignore ping and pong messages', async () => {
      const logger = { warn: vi.fn() } as any;
      const sendTo = vi.fn();
      const broadcastRoom = vi.fn();
      const client = { shareScope: null } as ClientState;

      await handleWsMessage(client, { type: 'ping' } as WsMessage, 'room1', 'client1', logger, sendTo, broadcastRoom);
      await handleWsMessage(client, { type: 'pong' } as WsMessage, 'room1', 'client1', logger, sendTo, broadcastRoom);

      expect(logger.warn).not.toHaveBeenCalled();
      expect(sendTo).not.toHaveBeenCalled();
      expect(broadcastRoom).not.toHaveBeenCalled();
    });

    it('should forbid non-fullsync requests if shareScope is COMMIT', async () => {
      const logger = { warn: vi.fn() } as any;
      const sendTo = vi.fn();
      const broadcastRoom = vi.fn();
      const client = { shareScope: 'COMMIT' } as ClientState;

      await handleWsMessage(client, { type: 'some-other-type' } as unknown as WsMessage, 'room1', 'client1', logger, sendTo, broadcastRoom);

      expect(sendTo).toHaveBeenCalledWith(client, expect.objectContaining({
        type: 'error',
        code: 'SHARE_LINK_FORBIDDEN'
      }));
    });

    it('should handle fullsync-request and fullsync by broadcasting', async () => {
      const logger = { warn: vi.fn() } as any;
      const sendTo = vi.fn();
      const broadcastRoom = vi.fn();
      const client = { clientId: 'client1', displayName: 'User', displayColor: 'red', shareScope: null } as ClientState;

      const msg = { type: 'fullsync-request' } as WsMessage;
      await handleWsMessage(client, msg, 'room1', 'client1', logger, sendTo, broadcastRoom);

      expect(broadcastRoom).toHaveBeenCalledWith('room1', expect.objectContaining({
        type: 'fullsync-request',
        senderId: 'client1',
        roomId: 'room1'
      }), 'client1');
    });

    it('should warn on legacy messages', async () => {
      const logger = { warn: vi.fn() } as any;
      const sendTo = vi.fn();
      const broadcastRoom = vi.fn();
      const client = { shareScope: null } as ClientState;

      await handleWsMessage(client, { type: 'legacy-event' } as unknown as WsMessage, 'room1', 'client1', logger, sendTo, broadcastRoom);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'legacy-event' }),
        'ws: ignoring legacy inbound message (use REST API)'
      );
    });
  });
});
