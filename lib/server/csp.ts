/**
 * P056 – Nonce-based Content Security Policy helper.
 *
 * Generates the CSP header value for a given per-request nonce.
 * Exported separately from proxy.ts so it can be unit-tested without
 * instantiating the Next.js middleware stack.
 */

/**
 * Build a nonce-based CSP header string.
 *
 * @param nonce  – Base64-encoded random value generated per request.
 * @param isProd – When true, adds `upgrade-insecure-requests`.
 * @returns CSP header value string (directives joined by '; ').
 */
export function buildCsp(nonce: string, isProd: boolean): string {
  return [
    "default-src 'self'",
    // P056: nonce replaces 'unsafe-inline' for script-src
    `script-src 'self' 'nonce-${nonce}'`,
    // P056: nonce-based restriction for <style> elements
    `style-src 'self' 'nonce-${nonce}'`,
    // Allow inline style="" attributes (React inline styles, fabric.js canvas)
    // while keeping script-src nonce-only.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    // WebSocket connections
    "connect-src 'self' ws: wss:",
    "frame-ancestors 'none'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join('; ');
}
