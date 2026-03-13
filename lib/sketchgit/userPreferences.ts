/**
 * userPreferences – lightweight localStorage adapter for anonymous-user
 * recognition (browser-only; safe to tree-shake in tests via mocking).
 *
 * Stores the display name, avatar colour, last room ID, and last branch
 * name so returning visitors are recognised without having to re-enter
 * their details and are dropped back into the drawing they last worked on.
 *
 * All read/write operations are wrapped in try/catch so that callers never
 * need to worry about environments where localStorage is unavailable (e.g.
 * private-browsing mode, storage-quota exceeded, or SSR).
 */

export interface UserPreferences {
  /** Display name shown to peers. */
  name: string;
  /** Avatar colour (hex string). */
  color: string;
  /** Room ID the user last worked in. */
  lastRoomId: string;
  /** Branch name the user last worked on. */
  lastBranchName: string;
}

const STORAGE_KEY = 'sketchgit_prefs';

/**
 * Load persisted preferences.
 * Returns `null` when nothing is stored or the stored value is invalid.
 * A stored object without a non-empty `name` is treated as invalid so
 * that the name modal is still shown on the very first visit.
 */
export function loadPreferences(): UserPreferences | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    if (typeof parsed.name !== 'string' || !parsed.name.trim()) return null;
    return {
      name: parsed.name.trim(),
      color: typeof parsed.color === 'string' ? parsed.color : '',
      lastRoomId: typeof parsed.lastRoomId === 'string' ? parsed.lastRoomId : '',
      lastBranchName: typeof parsed.lastBranchName === 'string' ? parsed.lastBranchName : '',
    };
  } catch {
    return null;
  }
}

/**
 * Update the `?branch=` URL parameter without triggering a navigation.
 * Safe to call in non-browser environments (no-ops when `window` is absent).
 */
export function setBranchInUrl(branchName: string): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('branch', branchName);
  window.history.replaceState({}, '', url.toString());
}

/**
 * Persist a partial update to the stored preferences.
 * Merges the supplied fields with any already-saved values so that
 * updating one field does not erase the others.
 */
export function savePreferences(update: Partial<UserPreferences>): void {
  try {
    const existing = loadPreferences() ?? ({} as Partial<UserPreferences>);
    const merged: Partial<UserPreferences> = { ...existing, ...update };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Silently ignore – localStorage may be unavailable (private mode,
    // quota exceeded, or non-browser environment).
  }
}
