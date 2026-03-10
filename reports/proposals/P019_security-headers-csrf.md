# P019 – Security Headers & CSRF Protection

## Title
Add HTTP Security Headers and CSRF Protection to the Application

## Brief Summary
The application returns no HTTP security headers (no Content-Security-Policy, no X-Frame-Options, no Strict-Transport-Security, etc.) and the WebSocket upgrade endpoint performs no CSRF-style origin validation. Adding a security-headers middleware and a WebSocket origin check closes a class of attacks—clickjacking, cross-site WebSocket hijacking, content injection, and MIME-type sniffing—with a small, self-contained change.

## Current Situation
`next.config.mjs` contains only `reactStrictMode: true` with no `headers()` configuration. `server.mjs` accepts every WebSocket upgrade request regardless of the `Origin` header:

```js
// server.mjs – current upgrade handler
server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});
```

No `Origin` or `Referer` check is performed. Any page on any domain can open a WebSocket connection to `wss://<app>`, authenticate as the currently logged-in user (cookies are sent automatically), and read or write that user's sketch data.

There is also no `Content-Security-Policy` header, which means inline scripts (e.g., injected via an XSS vulnerability) and external scripts loaded from any origin can run without restriction.

## Problem with Current Situation
1. **Cross-Site WebSocket Hijacking (CSWSH)**: A malicious website can open a WebSocket to `wss://<app>` in a victim's browser. The browser sends session cookies automatically, so the server authenticates the connection as the victim. The attacker can then send `commit`, `draw`, or `fullsync-request` messages, reading or corrupting the victim's sketch data.
2. **Clickjacking**: Without `X-Frame-Options: DENY` (or `Content-Security-Policy: frame-ancestors 'none'`), the app can be embedded in an `<iframe>` on a malicious site. The attacker overlays UI elements to trick the user into clicking buttons they did not intend to (e.g., deleting a branch or committing empty state).
3. **MIME-type sniffing**: Without `X-Content-Type-Options: nosniff`, Internet Explorer and some Chromium builds may interpret a text file uploaded as a sketch asset as executable JavaScript.
4. **Content injection via script-src**: Without `Content-Security-Policy`, any successfully injected inline script runs with full page privileges—including access to the WebSocket connection and canvas state.
5. **Passive network eavesdropping**: Without `Strict-Transport-Security`, a browser that visits the HTTP URL for the first time is susceptible to SSL-strip attacks before HSTS kicks in.

## Goal to Achieve
1. Return the following security headers on every response:
   - `Content-Security-Policy` restricting script-src, style-src, img-src, connect-src.
   - `X-Frame-Options: DENY`.
   - `X-Content-Type-Options: nosniff`.
   - `Referrer-Policy: strict-origin-when-cross-origin`.
   - `Strict-Transport-Security` (production only, never on localhost).
   - `Permissions-Policy` disabling unused browser features (microphone, geolocation, etc.).
2. Validate the `Origin` header on every WebSocket upgrade to prevent CSWSH.
3. Maintain existing functionality (CDN Fabric.js script loads correctly; WebSocket connects from the app itself).

## What Needs to Be Done

### 1. Add security headers via `next.config.mjs`
```js
// next.config.mjs
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',          value: 'DENY' },
          { key: 'X-Content-Type-Options',   value: 'nosniff' },
          { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // CDN for Fabric.js (interim until P018 is implemented)
              "script-src 'self' https://cdnjs.cloudflare.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self'",
              // WebSocket connection to same host
              "connect-src 'self' wss:",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};
```

Note: `'unsafe-inline'` in `style-src` may be required by Tailwind's JIT CSS-in-JS output. This can be tightened by adding a nonce via middleware once the app is stable.

### 2. Add Origin validation to the WebSocket upgrade handler
```js
// server.mjs – updated upgrade handler
const ALLOWED_ORIGINS = new Set([
  process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
]);

server.on('upgrade', (req, socket, head) => {
  const origin = req.headers['origin'];
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    logger.warn({ origin }, 'Rejected WebSocket upgrade from disallowed origin');
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});
```

The `origin` header is set automatically by browsers when initiating a WebSocket connection; it cannot be spoofed from a browser context. Server-to-server connections (cURL, test clients) typically send no `Origin` header—the check above allows those through, which is acceptable for development and testing.

### 3. Add `ALLOWED_ORIGINS` to `.env.example`
```bash
# Comma-separated list of allowed WebSocket origins (defaults to NEXTAUTH_URL)
WS_ALLOWED_ORIGINS=http://localhost:3000
```

Parse it in `server.mjs` to support multiple allowed origins (e.g., staging + production).

### 4. Update CSP when P018 (npm Fabric.js) is implemented
Once Fabric.js is installed as an npm package and no longer loaded from a CDN, remove `https://cdnjs.cloudflare.com` from `script-src`. The CSP can then be tightened to `script-src 'self'`.

### 5. Add a `Strict-Transport-Security` header for production
Add the header conditionally so localhost development is not affected:
```js
...(process.env.NODE_ENV === 'production' ? [{
  key: 'Strict-Transport-Security',
  value: 'max-age=63072000; includeSubDomains; preload',
}] : []),
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `next.config.mjs` | Add `headers()` async function returning security headers |
| `server.mjs` | Add `Origin` allowlist check in WebSocket upgrade handler |
| `.env.example` | Add `WS_ALLOWED_ORIGINS` variable |

## Additional Considerations

### CSP and Fabric.js compatibility
Fabric.js 5.x dynamically creates `<style>` elements and may use `eval()` internally in some code paths. Run the application with the CSP header active and inspect the browser console for CSP violations before releasing. If `eval()` is required, add `'unsafe-eval'` temporarily and file an upstream issue with the Fabric.js project.

### Content-Security-Policy-Report-Only mode
Before enabling the CSP in blocking mode, deploy it in `Content-Security-Policy-Report-Only` mode with a `report-uri` endpoint. This collects violations without breaking users, letting you tune the policy before enforcement.

### Nonce-based CSP (advanced)
For a stricter policy that eliminates `'unsafe-inline'`, use a per-request nonce generated in Next.js Middleware and injected into both the `<script>` tag and the CSP header. This is more complex but prevents all inline script injection.

### WebSocket auth token (complementary)
The Origin check prevents cross-site requests from browsers, but does not authenticate individual users at the WebSocket level. A complementary improvement is to pass a short-lived signed token (from NextAuth) in the WebSocket URL and validate it server-side, so even same-origin requests require a valid session. This goes beyond CSRF protection into proper WebSocket authentication.
