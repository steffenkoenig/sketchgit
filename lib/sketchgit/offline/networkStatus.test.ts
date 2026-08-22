// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isOnline, onNetworkStatusChange } from './networkStatus';

describe('networkStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isOnline', () => {
    it('reflects navigator.onLine when true', () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      expect(isOnline()).toBe(true);
    });

    it('reflects navigator.onLine when false', () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      expect(isOnline()).toBe(false);
    });
  });

  describe('onNetworkStatusChange', () => {
    it('calls the callback with true on an "online" event', () => {
      const cb = vi.fn();
      const unsubscribe = onNetworkStatusChange(cb);
      window.dispatchEvent(new Event('online'));
      expect(cb).toHaveBeenCalledWith(true);
      unsubscribe();
    });

    it('calls the callback with false on an "offline" event', () => {
      const cb = vi.fn();
      const unsubscribe = onNetworkStatusChange(cb);
      window.dispatchEvent(new Event('offline'));
      expect(cb).toHaveBeenCalledWith(false);
      unsubscribe();
    });

    it('stops receiving events after unsubscribe', () => {
      const cb = vi.fn();
      const unsubscribe = onNetworkStatusChange(cb);
      unsubscribe();
      window.dispatchEvent(new Event('online'));
      expect(cb).not.toHaveBeenCalled();
    });
  });
});
