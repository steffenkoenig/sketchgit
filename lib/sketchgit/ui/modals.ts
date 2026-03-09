/**
 * modals – lightweight helpers to open and close overlay modals.
 */

/** Add the `open` class to make an overlay modal visible. */
export function openModal(id: string): void {
  document.getElementById(id)?.classList.add('open');
}

/** Remove the `open` class to hide an overlay modal. */
export function closeModal(id: string): void {
  document.getElementById(id)?.classList.remove('open');
}
