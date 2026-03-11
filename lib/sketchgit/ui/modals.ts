/**
 * modals – lightweight helpers to open and close overlay modals.
 *
 * P025 (Accessibility):
 *  - openModal() now:
 *    - Moves focus into the modal.
 *    - Installs a keydown handler that:
 *        • Traps focus within the modal (Tab / Shift+Tab cycle within focusable elements).
 *        • Closes the modal on Escape key.
 *    - Remembers the element that was focused before opening so focus can be
 *      restored to it when the modal closes.
 *  - closeModal() removes the focus-trap handler and restores focus.
 */

/** Selectors for elements that can receive keyboard focus. */
const FOCUSABLE_SELECTORS =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), ' +
  'select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Per-modal state kept while a modal is open.
 * Stored in a WeakMap so it is automatically garbage-collected when the
 * element is removed from the DOM.
 */
interface ModalState {
  focusTrapHandler: (e: KeyboardEvent) => void;
  previouslyFocused: HTMLElement | null;
}

const openModalState = new WeakMap<HTMLElement, ModalState>();

/** Add the `open` class to make an overlay modal visible. */
export function openModal(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;

  // If the same modal is already open, clean up the existing focus-trap handler
  // before installing a new one.  This prevents handler accumulation on
  // programmatic re-opens or rapid double-clicks.
  const existing = openModalState.get(el);
  if (existing) {
    el.removeEventListener('keydown', existing.focusTrapHandler);
    openModalState.delete(el);
  }

  el.classList.add('open');

  // Remember where focus was before the modal opened
  const previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  // Move focus into the modal – first focusable child or the container itself
  const firstFocusable = el.querySelector<HTMLElement>(FOCUSABLE_SELECTORS);
  if (firstFocusable) {
    firstFocusable.focus();
  } else {
    // Make the container itself focusable as a last resort
    el.setAttribute('tabindex', '-1');
    el.focus();
  }

  // Focus-trap + Escape handler
  const focusTrapHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal(id);
      return;
    }

    if (e.key !== 'Tab') return;

    const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
      (elem) => !elem.closest('[style*="display: none"]') && !elem.closest('[hidden]'),
    );

    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }

    const first = focusable[0];
    const last  = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first || document.activeElement === el) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  el.addEventListener('keydown', focusTrapHandler);
  openModalState.set(el, { focusTrapHandler, previouslyFocused });
}

/** Remove the `open` class to hide an overlay modal. */
export function closeModal(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('open');

  // Remove the focus-trap handler and restore focus
  const state = openModalState.get(el);
  if (state) {
    el.removeEventListener('keydown', state.focusTrapHandler);
    state.previouslyFocused?.focus();
    openModalState.delete(el);
  }
}
