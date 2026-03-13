import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger, setLogLevel, getLogLevel, onError } from './logger';

describe('logger', () => {
  beforeEach(() => {
    setLogLevel('warn');
    vi.clearAllMocks();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('warn is suppressed when activeLevel is "error"', () => {
    setLogLevel('error');
    logger.warn('should be suppressed');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('warn is output when activeLevel is "warn"', () => {
    setLogLevel('warn');
    logger.warn('this should appear');
    expect(console.warn).toHaveBeenCalledWith('[sketchgit:warn]', 'this should appear');
  });

  it('error calls the registered errorHook', () => {
    const hook = vi.fn();
    onError(hook);
    logger.error({ roomId: 'r1' }, 'something went wrong');
    expect(hook).toHaveBeenCalledWith({ roomId: 'r1' }, 'something went wrong');
    // clean up
    onError(null!);
  });

  it('setLogLevel("silent") suppresses all output', () => {
    setLogLevel('silent');
    logger.debug('nope');
    logger.info('nope');
    logger.warn('nope');
    logger.error('nope');
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('debug is output when activeLevel is "debug"', () => {
    setLogLevel('debug');
    logger.debug({ count: 5 }, 'debug message');
    expect(console.debug).toHaveBeenCalledWith('[sketchgit:debug]', 'debug message', { count: 5 });
  });

  it('structured fields are passed to the underlying console call', () => {
    setLogLevel('warn');
    logger.warn({ roomId: 'r2', retries: 3 }, 'retry warning');
    expect(console.warn).toHaveBeenCalledWith(
      '[sketchgit:warn]',
      'retry warning',
      { roomId: 'r2', retries: 3 },
    );
  });

  it('getLogLevel returns the current level', () => {
    setLogLevel('info');
    expect(getLogLevel()).toBe('info');
    setLogLevel('warn');
  });

  it('info is suppressed when activeLevel is "error"', () => {
    setLogLevel('error');
    logger.info('info msg');
    expect(console.info).not.toHaveBeenCalled();
  });
});
