/* eslint-disable max-lines-per-function */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleRedisPmessage } from './redisPmessage.js';

describe('redis pmessage handler', () => {
  let broadcastLocalRoom: any;
  let logger: any;

  const SERVER_INSTANCE_ID = 'test-instance-1';
  const REDIS_CHANNEL_PREFIX = 'sketchgit:room:';

  beforeEach(() => {
    broadcastLocalRoom = vi.fn();
    logger = { warn: vi.fn() };
  });

  it('logs a warning and returns if JSON parsing fails', () => {
    handleRedisPmessage(
      `${REDIS_CHANNEL_PREFIX}room1`,
      'invalid-json',
      REDIS_CHANNEL_PREFIX,
      SERVER_INSTANCE_ID,
      logger,
      broadcastLocalRoom
    );
    expect(logger.warn).toHaveBeenCalledWith(
      { channel: `${REDIS_CHANNEL_PREFIX}room1` },
      "redis: failed to parse pmessage payload"
    );
    expect(broadcastLocalRoom).not.toHaveBeenCalled();
  });

  it('skips broadcast if instanceId matches SERVER_INSTANCE_ID', () => {
    const data = JSON.stringify({
      from: 'client-1',
      instanceId: SERVER_INSTANCE_ID,
      payload: { type: 'ping' }
    });
    handleRedisPmessage(
      `${REDIS_CHANNEL_PREFIX}room1`,
      data,
      REDIS_CHANNEL_PREFIX,
      SERVER_INSTANCE_ID,
      logger,
      broadcastLocalRoom
    );
    expect(logger.warn).not.toHaveBeenCalled();
    expect(broadcastLocalRoom).not.toHaveBeenCalled();
  });

  it('broadcasts message to local room if instanceId differs', () => {
    const data = JSON.stringify({
      from: 'client-1',
      instanceId: 'test-instance-2',
      payload: { type: 'ping' }
    });
    handleRedisPmessage(
      `${REDIS_CHANNEL_PREFIX}room1`,
      data,
      REDIS_CHANNEL_PREFIX,
      SERVER_INSTANCE_ID,
      logger,
      broadcastLocalRoom
    );
    expect(logger.warn).not.toHaveBeenCalled();
    expect(broadcastLocalRoom).toHaveBeenCalledWith('room1', { type: 'ping' }, 'client-1');
  });
});
