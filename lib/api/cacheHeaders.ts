/**
 * Cache-Control header helpers for API routes.
 *
 * P070 – Centralised caching policies so they are easy to update.
 *
 * Three tiers:
 * - `immutableHeaders(sha)` – SHA-addressed content that never changes.
 * - `mutableHeaders()`      – Latest-HEAD content; must not be cached.
 * - `shortLivedHeaders()`   – Slowly-changing public content.
 */

/** One year in seconds */
const ONE_YEAR = 31_536_000;

/**
 * Returns `Cache-Control: public, immutable` + `ETag` headers for content
 * immutably addressed by a commit SHA.  Safe for CDN caching.
 *
 * @param sha – the commit SHA used to address this content
 */
export function immutableHeaders(sha: string): Record<string, string> {
  return {
    "Cache-Control": `public, immutable, max-age=${ONE_YEAR}`,
    ETag: `"${sha}"`,
  };
}

/**
 * Returns `Cache-Control: private, no-store` headers for responses that may
 * change at any time (latest HEAD, auth endpoints, etc.).
 * Browsers and CDNs must not cache beyond the current request.
 */
export function mutableHeaders(): Record<string, string> {
  return {
    "Cache-Control": "private, no-cache, no-store, must-revalidate",
  };
}

/**
 * Returns `Cache-Control: public, max-age, stale-while-revalidate` headers
 * for slowly-changing public content (OpenAPI spec, etc.).
 *
 * @param maxAgeSec – fresh lifetime in seconds (default: 3600 = 1 hour)
 * @param swrSec    – stale-while-revalidate window in seconds (default: 300 = 5 min)
 */
export function shortLivedHeaders(
  maxAgeSec = 3600,
  swrSec = 300,
): Record<string, string> {
  return {
    "Cache-Control": `public, max-age=${maxAgeSec}, stale-while-revalidate=${swrSec}`,
  };
}
