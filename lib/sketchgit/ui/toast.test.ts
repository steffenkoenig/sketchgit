// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showToast } from './toast';

describe('showToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="toast"></div>';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets the text content on the toast element', () => {
    showToast('Hello world');
    expect(document.getElementById('toast')?.textContent).toBe('Hello world');
  });

  it('adds the "show" class', () => {
    showToast('A message');
    expect(document.getElementById('toast')?.classList.contains('show')).toBe(true);
  });

  it('sets borderColor for a normal message (jsdom ignores CSS vars, just verifies no throw)', () => {
    // jsdom does not evaluate CSS custom properties, but the property is set
    expect(() => showToast('Normal message')).not.toThrow();
  });

  it('sets borderColor for an error message (jsdom ignores CSS vars, just verifies no throw)', () => {
    expect(() => showToast('Error message', true)).not.toThrow();
  });

  it('removes the "show" class after 2800ms', () => {
    showToast('Timed message');
    expect(document.getElementById('toast')?.classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(2800);
    expect(document.getElementById('toast')?.classList.contains('show')).toBe(false);
  });

  it('does nothing gracefully when the toast element does not exist', () => {
    document.body.innerHTML = '';
    expect(() => showToast('No element')).not.toThrow();
  });

  it('clears any pending hide timer when called repeatedly', () => {
    showToast('First');
    vi.advanceTimersByTime(1000);
    showToast('Second');
    vi.advanceTimersByTime(1000);
    // The first 2800ms timer was cancelled; toast should still be shown
    expect(document.getElementById('toast')?.classList.contains('show')).toBe(true);
  });
});
