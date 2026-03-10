// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { openModal, closeModal } from './modals';

describe('openModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="test-modal"></div>';
  });

  it('adds the "open" class to the element', () => {
    openModal('test-modal');
    expect(document.getElementById('test-modal')?.classList.contains('open')).toBe(true);
  });

  it('does nothing when the element does not exist', () => {
    expect(() => openModal('nonexistent')).not.toThrow();
  });
});

describe('closeModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="test-modal" class="open"></div>';
  });

  it('removes the "open" class from the element', () => {
    closeModal('test-modal');
    expect(document.getElementById('test-modal')?.classList.contains('open')).toBe(false);
  });

  it('does nothing when the element does not exist', () => {
    expect(() => closeModal('nonexistent')).not.toThrow();
  });

  it('is idempotent when class not present', () => {
    document.body.innerHTML = '<div id="test-modal"></div>';
    closeModal('test-modal');
    expect(document.getElementById('test-modal')?.classList.contains('open')).toBe(false);
  });
});
