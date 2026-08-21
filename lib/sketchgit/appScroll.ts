export function tlScrollLeft(): void {
  const el = document.getElementById('tlscroll');
  if (el) el.scrollLeft -= 200;
}
export function tlScrollRight(): void {
  const el = document.getElementById('tlscroll');
  if (el) el.scrollLeft += 200;
}
