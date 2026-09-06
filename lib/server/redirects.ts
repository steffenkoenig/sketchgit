/**
 * Safely parse a raw URL path and return a path that is guaranteed to be
 * on the same origin as the provided baseUrl. This prevents Open Redirect
 * vulnerabilities in endpoints that pass URLs to redirect responses.
 */
export function getSafeCallbackUrl(rawPath: string, baseUrl: string): string {
  try {
    const parsed = new URL(rawPath, baseUrl);

    // Validate the origin matches the baseUrl
    if (parsed.origin !== new URL(baseUrl).origin) {
      return "/";
    }

    const safePath = parsed.pathname + parsed.search;

    // Ensure it starts with / but not // or /\ to prevent scheme-relative bypasses
    if (safePath.startsWith("/") && !safePath.startsWith("//") && !safePath.startsWith("/\\")) {
      return safePath;
    }
  } catch {
    // Ignore invalid URLs
  }
  return "/";
}
