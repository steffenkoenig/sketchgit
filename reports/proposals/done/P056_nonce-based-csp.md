# P056 – Nonce-based Content Security Policy to Replace `'unsafe-inline'`

## Title
Replace `'unsafe-inline'` in `script-src` and `style-src` with Per-request Nonces, Eliminating XSS Script-injection Risk

## Brief Summary
`next.config.mjs` sets a global `Content-Security-Policy` header that includes `"script-src 'self' 'unsafe-inline'"`. The `'unsafe-inline'` directive allows any inline `<script>` tag to execute, which completely defeats the XSS mitigation purpose of CSP for scripts. The comment in `next.config.mjs` explicitly acknowledges this limitation and defers the fix to a nonce-based implementation. With Next.js App Router, nonces are injected via the Next.js middleware (`proxy.ts`) and propagated to `<script>` elements via the `nonce` prop on Next.js's `<Script>` component and the `<Head>`. This proposal implements the deferred nonce-based CSP.

## Current Situation
```javascript
// next.config.mjs
"script-src 'self' 'unsafe-inline'",
// Next.js injects inline scripts for hydration/bootstrapping;
// 'unsafe-inline' is required unless a nonce-based CSP is
// implemented end-to-end (middleware + _document nonce prop).
"style-src 'self' 'unsafe-inline'",
// Tailwind JIT injects inline styles at runtime.
```

`'unsafe-inline'` in `script-src` means:
- Any XSS vector that injects `<script>alert(1)</script>` into the page will execute.
- Third-party JavaScript injected via a browser extension, a compromised dependency, or a misconfigured CDN will execute without restriction.
- The CSP `script-src` directive provides **zero protection** against reflected or stored XSS.

The `'unsafe-inline'` in `style-src` is a lower-priority concern (CSS injection cannot execute JavaScript), but it allows CSS-based data exfiltration attacks (e.g., CSS attribute selectors that load background images to exfiltrate token values) and should also be replaced with nonces or hashes.

## Problem with Current Situation
1. **CSP script-src is entirely bypassed**: The `X-Frame-Options: DENY`, `Referrer-Policy`, and `Permissions-Policy` headers (all implemented in P019) provide real protection. But the CSP `script-src` with `'unsafe-inline'` provides no XSS script-execution mitigation because any inline `<script>` is permitted.
2. **False sense of security**: The CSP header is present and appears comprehensive, but its main purpose (restricting script execution origins) is undermined by `'unsafe-inline'`.
3. **P019 acknowledged this**: The CSP section in `next.config.mjs` explicitly includes a TODO comment referencing a nonce-based implementation. The infrastructure work (proxy.ts, App Router) is already in place.
4. **OWASP and NIST guidance**: Both organizations recommend nonce-based CSP over `'unsafe-inline'` for any application handling user data. SketchGit handles authentication (passwords via bcrypt), canvas content (user artwork), and commit history. An XSS attack could exfiltrate session cookies or submit fraudulent commits.

## Goal to Achieve
1. Generate a cryptographically random nonce on every request in `proxy.ts`.
2. Set the CSP header with `'nonce-{nonce}'` instead of `'unsafe-inline'` for `script-src` and `style-src`.
3. Pass the nonce to Next.js via `requestHeaders` so Next.js's built-in nonce injection works for hydration scripts.
4. Add the `nonce` attribute to any inline `<script>` or `<style>` tags in `app/layout.tsx`.
5. Configure Next.js to propagate the nonce to all auto-injected scripts.

## What Needs to Be Done

### 1. Generate a nonce in `proxy.ts` and inject it into request headers
```typescript
// proxy.ts – in the auth() handler
// proxy.ts runs in the Node.js runtime (not the Edge runtime), so use
// the Node.js crypto module for nonce generation.
import { randomBytes } from 'node:crypto';

export default auth((req) => {
  const pathname = req.nextUrl.pathname;

  // Generate a fresh nonce for every request (Node.js crypto, not Web Crypto API)
  const nonce = randomBytes(16).toString('base64');

  // … existing rate limit and dashboard redirect logic …

  // Attach the nonce to the response headers so the Next.js server can read it
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Set the CSP header with the per-request nonce
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,   // ← nonce replaces 'unsafe-inline'
      `style-src 'self' 'nonce-${nonce}'`,     // ← nonce replaces 'unsafe-inline'
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' ws: wss:",
      "frame-ancestors 'none'",
    ].join('; '),
  );

  return response;
});
```

Note: The static CSP headers in `next.config.mjs` should be removed so that only the middleware-set per-request CSP header is sent (not both, which would result in the more restrictive one winning).

### 2. Read the nonce in `app/layout.tsx` and pass it to Next.js
```typescript
// app/layout.tsx
import { headers } from 'next/headers';

export default async function RootLayout({ children }: RootLayoutProps) {
  const nonce = (await headers()).get('x-nonce') ?? '';

  return (
    <html lang="en">
      <head>
        {/* P056: Nonce on any inline scripts/styles that the layout itself injects */}
      </head>
      <body>
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
```

### 3. Pass nonce to `Providers` and `SessionProvider`
```typescript
// components/providers.tsx
export function Providers({ children, nonce }: { children: ReactNode; nonce: string }) {
  return <SessionProvider basePath="/api/auth">{children}</SessionProvider>;
}
```

### 4. Configure Next.js to propagate the nonce to auto-injected scripts
In `next.config.mjs`, add:
```javascript
const nextConfig = {
  // … existing config …
  experimental: {
    // P056: Enables Next.js to read the 'x-nonce' header and add nonce attributes
    // to all auto-injected inline scripts (hydration, chunk loading, etc.)
    strictNextHead: true,
  },
};
```

Next.js App Router automatically reads the nonce from the request context (set via `requestHeaders` in middleware) and applies it to all internal inline `<script>` elements when `strictNextHead: true` is set.

### 5. Remove static CSP headers from `next.config.mjs`
Remove the `async headers()` function from `next.config.mjs`, or replace it with a version that excludes the `Content-Security-Policy` header (since it is now set per-request in `proxy.ts`). The other headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, etc.) can remain in `next.config.mjs`.

### 6. Handling Tailwind and inline styles
Tailwind CSS v4 (used in this project) with the PostCSS plugin generates CSS that is bundled as a separate `.css` file rather than injected as inline `<style>` tags. The `style-src 'nonce-{nonce}'` directive is still needed for any `style` attributes on React components (which Next.js hydrates), but in practice Tailwind v4 does not require `'unsafe-inline'` in `style-src` when using the PostCSS build pipeline.

**Exception**: If `canvas.backgroundColor` or other Fabric.js operations set inline styles directly on DOM elements, these are already controlled by JavaScript (covered by `script-src`), not by `style-src`.

### 7. Tests
- Unit (proxy.ts): nonce is a valid Base64 string, 22 chars, different on each call.
- Unit (proxy.ts): CSP header in response contains `'nonce-<value>'` where `<value>` matches `x-nonce` header.
- Integration: Next.js HTML response has `nonce` attribute on hydration `<script>` elements.
- Security test: a `<script>` without the nonce attribute is blocked by the browser (CSP violation in browser devtools).

## Components Affected
| Component | Change |
|-----------|--------|
| `proxy.ts` | Generate nonce, set `x-nonce` request header, set per-request CSP response header |
| `next.config.mjs` | Remove CSP from static `async headers()` (keep other security headers) |
| `app/layout.tsx` | Read `x-nonce` from request headers; pass to providers |
| `components/providers.tsx` | Accept optional `nonce` prop |

## Data & Database Model
No changes. The nonce is generated per-request and not stored.

## Caveats and Limitations
1. **Next.js static exports**: `output: 'standalone'` is already set. Static export (`output: 'export'`) would not work with per-request nonces (there is no request to generate them from). The standalone server mode is compatible.
2. **CSP violations during development**: `reactStrictMode: true` causes some extra renders. In development, `'unsafe-eval'` may also be needed for source maps. Consider adding `"script-src 'self' 'nonce-${nonce}'" + (dev ? " 'unsafe-eval'" : "")`.
3. **Third-party `<Script>` tags**: Any `<Script strategy="beforeInteractive">` in child components must also receive the `nonce` prop. A global nonce context (React Context) can propagate the nonce to all `<Script>` uses without prop-drilling.
4. **Browser compatibility**: Nonce-based CSP is supported by all modern browsers (Chrome, Firefox, Safari, Edge). IE11 (not supported by Next.js App Router) is the only notable exception.

## Testing Requirements
- Nonce generated per-request: two responses have different nonces.
- `Content-Security-Policy` response header contains `nonce-` prefix, not `'unsafe-inline'`.
- `x-nonce` request header is set in `requestHeaders`.
- Next.js hydration scripts have `nonce` attribute matching the response CSP.
- `X-Frame-Options` and other non-CSP headers remain present (no regression from removing static CSP).

## Dependency Map
- Depends on: P019 ✅ (CSP framework exists and acknowledged nonce as future work), P013 ✅ (server TypeScript + proxy.ts in place)
- Complements: P046 (Redis rate limiter — both strengthen the proxy.ts security layer)
- Severity: **High** — `'unsafe-inline'` in script-src neutralizes the entire CSP XSS protection
