/**
 * toast – a simple, stateless toast notification helper.
 */

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Display a brief toast message at the bottom of the screen.
 * @param msg    - Text to display.
 * @param isErr  - When true, uses the error border colour.
 */
export function showToast(msg: string, isErr = false): void {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.borderColor = isErr ? 'var(--a2)' : 'var(--bdr2)';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}
