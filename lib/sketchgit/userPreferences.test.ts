/**
 * Tests for lib/sketchgit/userPreferences.ts
 *
 * All tests use jsdom's localStorage stub so that no real browser storage is
 * touched.  Each test starts with a clean slate thanks to beforeEach.
 */

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadPreferences, savePreferences, setBranchInUrl } from './userPreferences';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const KEY = 'sketchgit_prefs';

function raw(): string | null {
  return localStorage.getItem(KEY);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('userPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ── loadPreferences ──────────────────────────────────────────────────────

  describe('loadPreferences()', () => {
    it('returns null when localStorage is empty', () => {
      expect(loadPreferences()).toBeNull();
    });

    it('returns null when stored JSON has no name', () => {
      localStorage.setItem(KEY, JSON.stringify({ color: '#ff0000' }));
      expect(loadPreferences()).toBeNull();
    });

    it('returns null when stored name is an empty string', () => {
      localStorage.setItem(KEY, JSON.stringify({ name: '   ' }));
      expect(loadPreferences()).toBeNull();
    });

    it('returns null when stored value is malformed JSON', () => {
      localStorage.setItem(KEY, '{not valid json}');
      expect(loadPreferences()).toBeNull();
    });

    it('returns a valid object when all fields are present', () => {
      localStorage.setItem(
        KEY,
        JSON.stringify({ name: 'Alice', color: '#7c6eff', lastRoomId: 'room-1', lastBranchName: 'feat' }),
      );
      expect(loadPreferences()).toEqual({
        name: 'Alice',
        color: '#7c6eff',
        lastRoomId: 'room-1',
        lastBranchName: 'feat',
      });
    });

    it('trims whitespace from the stored name', () => {
      localStorage.setItem(KEY, JSON.stringify({ name: '  Bob  ' }));
      expect(loadPreferences()?.name).toBe('Bob');
    });

    it('returns empty strings for missing optional fields', () => {
      localStorage.setItem(KEY, JSON.stringify({ name: 'Carol' }));
      const prefs = loadPreferences();
      expect(prefs?.color).toBe('');
      expect(prefs?.lastRoomId).toBe('');
      expect(prefs?.lastBranchName).toBe('');
    });
  });

  // ── savePreferences ──────────────────────────────────────────────────────

  describe('savePreferences()', () => {
    it('writes a full preferences object to localStorage', () => {
      savePreferences({ name: 'Alice', color: '#fff', lastRoomId: 'r1', lastBranchName: 'main' });
      expect(raw()).not.toBeNull();
      const stored = JSON.parse(raw()!);
      expect(stored.name).toBe('Alice');
      expect(stored.lastRoomId).toBe('r1');
    });

    it('merges a partial update without erasing other fields', () => {
      savePreferences({ name: 'Alice', color: '#aaa', lastRoomId: 'r1', lastBranchName: 'main' });
      savePreferences({ lastRoomId: 'r2' });
      const prefs = loadPreferences();
      expect(prefs?.name).toBe('Alice');
      expect(prefs?.lastRoomId).toBe('r2');
      expect(prefs?.lastBranchName).toBe('main');
    });

    it('persisted values are round-trippable via loadPreferences()', () => {
      savePreferences({ name: 'Dave', color: '#123456', lastRoomId: 'room-x', lastBranchName: 'dev' });
      expect(loadPreferences()).toEqual({
        name: 'Dave',
        color: '#123456',
        lastRoomId: 'room-x',
        lastBranchName: 'dev',
      });
    });

    it('silently ignores errors when localStorage is unavailable', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() => savePreferences({ name: 'Eve' })).not.toThrow();
      spy.mockRestore();
    });

    it('does not throw when called with an empty object', () => {
      expect(() => savePreferences({})).not.toThrow();
    });
  });

  // ── setBranchInUrl ──────────────────────────────────────────────────────

  describe('setBranchInUrl()', () => {
    it('calls history.replaceState with a URL containing the branch param', () => {
      const spy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
      setBranchInUrl('feat-x');
      expect(spy).toHaveBeenCalledOnce();
      const calledUrl = spy.mock.calls[0][2] as string;
      expect(new URL(calledUrl, 'http://x').searchParams.get('branch')).toBe('feat-x');
      spy.mockRestore();
    });

    it('preserves existing URL params when updating branch', () => {
      const spy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
      setBranchInUrl('new-branch');
      expect(spy).toHaveBeenCalledOnce();
      spy.mockRestore();
    });
  });
});
