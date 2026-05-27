import { describe, it, expect, vi } from 'vitest';
import { getGlobalPresence, REDIS_PRESENCE_PREFIX } from './presence';

describe('presence module', () => {
  it('getGlobalPresence handles redis errors gracefully', async () => {
    const mockLogger = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    } as any;

    const mockHgetall = vi.fn().mockRejectedValue(new Error('Redis connection lost'));
    const mockRedisPub = {
      hgetall: mockHgetall,
    } as any;

    const localClients = [{ clientId: 'c1', name: 'user1', color: 'red', userId: null, branch: 'main', headSha: null }];

    const result = await getGlobalPresence('room1', localClients, mockRedisPub, true, mockLogger);

    expect(mockHgetall).toHaveBeenCalledWith(`${REDIS_PRESENCE_PREFIX}room1`);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: 'room1', err: expect.any(Error) }),
      "redis: getGlobalPresence failed, falling back to local"
    );
    expect(result).toBe(localClients);
  });

  it('returns localClients if redis is not ready', async () => {
    const mockLogger = { warn: vi.fn() } as any;
    const mockRedisPub = { hgetall: vi.fn() } as any;
    const localClients = [{ clientId: 'c1', name: 'user1', color: 'red', userId: null, branch: 'main', headSha: null }];

    const result = await getGlobalPresence('room1', localClients, mockRedisPub, false, mockLogger);

    expect(mockRedisPub.hgetall).not.toHaveBeenCalled();
    expect(result).toBe(localClients);
  });

  it('returns localClients if redisPub is null', async () => {
    const mockLogger = { warn: vi.fn() } as any;
    const localClients = [{ clientId: 'c1', name: 'user1', color: 'red', userId: null, branch: 'main', headSha: null }];

    const result = await getGlobalPresence('room1', localClients, null, true, mockLogger);

    expect(result).toBe(localClients);
  });

  it('merges clients from redis successfully', async () => {
    const mockLogger = { warn: vi.fn() } as any;

    // Create duplicate clients and distinct clients across fields
    const server1Clients = [
      { clientId: 'c1', name: 'user1', color: 'red', userId: null, branch: 'main', headSha: null },
      { clientId: 'c2', name: 'user2', color: 'blue', userId: null, branch: 'feature', headSha: 'abc' }
    ];

    // c1 is a duplicate, c3 is new
    const server2Clients = [
      { clientId: 'c1', name: 'user1', color: 'red', userId: null, branch: 'main', headSha: null },
      { clientId: 'c3', name: 'user3', color: 'green', userId: null } // missing branch/headSha to test defaults
    ];

    const mockHgetall = vi.fn().mockResolvedValue({
      'server1': JSON.stringify(server1Clients),
      'server2': JSON.stringify(server2Clients)
    });

    const mockRedisPub = {
      hgetall: mockHgetall,
    } as any;

    const localClients = [{ clientId: 'c1', name: 'user1', color: 'red', userId: null, branch: 'main', headSha: null }];

    const result = await getGlobalPresence('room1', localClients, mockRedisPub, true, mockLogger);

    expect(mockHgetall).toHaveBeenCalledWith(`${REDIS_PRESENCE_PREFIX}room1`);
    expect(result).toHaveLength(3); // c1, c2, c3
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ clientId: 'c1' }),
      expect.objectContaining({ clientId: 'c2', branch: 'feature', headSha: 'abc' }),
      expect.objectContaining({ clientId: 'c3', branch: 'main', headSha: null }) // defaults applied
    ]));
  });

  it('returns local clients if redis returns null', async () => {
    const mockLogger = { warn: vi.fn() } as any;
    const mockHgetall = vi.fn().mockResolvedValue(null);
    const mockRedisPub = { hgetall: mockHgetall } as any;
    const localClients = [{ clientId: 'c1', name: 'user1', color: 'red', userId: null, branch: 'main', headSha: null }];

    const result = await getGlobalPresence('room1', localClients, mockRedisPub, true, mockLogger);

    expect(result).toBe(localClients);
  });

  it('handles errors when parsing JSON values', async () => {
    const mockLogger = { warn: vi.fn() } as any;
    const mockHgetall = vi.fn().mockResolvedValue({
      'server1': 'invalid-json'
    });
    const mockRedisPub = { hgetall: mockHgetall } as any;
    const localClients = [{ clientId: 'c1', name: 'user1', color: 'red', userId: null, branch: 'main', headSha: null }];

    const result = await getGlobalPresence('room1', localClients, mockRedisPub, true, mockLogger);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: 'room1', err: expect.any(Error) }),
      "redis: getGlobalPresence failed, falling back to local"
    );
    expect(result).toBe(localClients);
  });
});
