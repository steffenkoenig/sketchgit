// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { openModal, closeModal } from './modals';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupModal(id: string, innerHtml = '') {
  document.body.innerHTML = `
    <button id="trigger">Open</button>
    <div id="${id}" class="overlay">
      ${innerHtml || '<button id="modal-btn">OK</button>'}
    </div>
  `;
}

function fireKeydown(el: EventTarget, key: string, shiftKey = false) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
}

// ─── openModal ────────────────────────────────────────────────────────────────

describe('openModal', () => {
  beforeEach(() => setupModal('test-modal'));

  it('adds the "open" class to the element', () => {
    openModal('test-modal');
    expect(document.getElementById('test-modal')?.classList.contains('open')).toBe(true);
  });

  it('does nothing when the element does not exist', () => {
    expect(() => openModal('nonexistent')).not.toThrow();
  });

  it('moves focus to the first focusable child inside the modal', () => {
    openModal('test-modal');
    expect(document.activeElement).toBe(document.getElementById('modal-btn'));
  });

  it('opens multiple different modals without error', () => {
    document.body.innerHTML = `
      <div id="m1"><button id="b1">OK</button></div>
      <div id="m2"><button id="b2">OK</button></div>
    `;
    expect(() => { openModal('m1'); openModal('m2'); }).not.toThrow();
  });
});

// ─── closeModal ───────────────────────────────────────────────────────────────

describe('closeModal', () => {
  beforeEach(() => {
    setupModal('test-modal');
    document.getElementById('test-modal')!.classList.add('open');
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

  it('restores focus to the previously focused element', () => {
    const trigger = document.getElementById('trigger') as HTMLButtonElement;
    trigger.focus();
    openModal('test-modal');
    closeModal('test-modal');
    expect(document.activeElement).toBe(trigger);
  });
});

// ─── Focus trap ───────────────────────────────────────────────────────────────

describe('focus trap', () => {
  it('prevents Tab from moving focus outside the modal', () => {
    setupModal('ft-modal', '<button id="b1">A</button><button id="b2">B</button>');
    openModal('ft-modal');

    const modal = document.getElementById('ft-modal')!;
    const b2 = document.getElementById('b2') as HTMLButtonElement;
    b2.focus(); // focus last button

    fireKeydown(modal, 'Tab');
    // Tab on last element should cycle to first
    expect(document.activeElement).toBe(document.getElementById('b1'));
  });

  it('prevents Shift+Tab from moving focus before the first element', () => {
    setupModal('ft-modal2', '<button id="c1">A</button><button id="c2">B</button>');
    openModal('ft-modal2');

    const modal = document.getElementById('ft-modal2')!;
    const c1 = document.getElementById('c1') as HTMLButtonElement;
    c1.focus(); // focus first button

    fireKeydown(modal, 'Tab', true /* shiftKey */);
    // Shift+Tab on first element should cycle to last
    expect(document.activeElement).toBe(document.getElementById('c2'));
  });
});

// ─── Escape key ───────────────────────────────────────────────────────────────

describe('Escape key', () => {
  it('closes the modal when Escape is pressed inside it', () => {
    setupModal('esc-modal', '<button id="eb">OK</button>');
    openModal('esc-modal');

    const modal = document.getElementById('esc-modal')!;
    fireKeydown(modal, 'Escape');

    expect(modal.classList.contains('open')).toBe(false);
  });
});
