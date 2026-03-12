# P072 – `security.txt`, `robots.txt`, and `/.well-known/` Routes

## Title
Add `/.well-known/security.txt`, `robots.txt`, and Related Discovery Endpoints to Establish a Responsible Disclosure Policy and Improve Crawler Behavior

## Brief Summary
The application has no `robots.txt` (search engine crawlers index all pages by default, including authenticated routes), no `security.txt` (RFC 9116 — standard way to publish a vulnerability reporting contact), and no `/.well-known/` discovery routes. These are low-effort, high-value additions: `robots.txt` prevents indexing of `/auth/`, `/dashboard/`, and API routes; `security.txt` establishes a responsible disclosure channel; and `/.well-known/` is increasingly used by browsers, password managers, and security scanners.

## Current Situation
The `public/` directory contains no static files:
```
public/   ← empty
```
The Next.js application has no `/api/health` or `/.well-known/` directory entries for these standardised discovery files. Search engines receive HTTP 200 for `/dashboard` (redirects to `/auth/signin` for unauthenticated users, but the redirect itself may still be indexed) and `/api/**` (returns JSON, should not be indexed).

### Relevant files
```
public/           ← static files served by Next.js; currently empty
app/              ← no robots.txt or security.txt
next.config.mjs   ← no redirect/rewrite rules for /.well-known/
```

## Problem with Current Situation
1. **No `robots.txt`**: Web crawlers index `/auth/signin`, `/auth/register`, and `/dashboard` by default. These pages have no search value and generate meaningless traffic. More critically, API routes (`/api/**`) may be indexed, leaking endpoint paths to public search engines.
2. **No `security.txt`**: Security researchers and automated vulnerability scanners that discover a vulnerability have no standardised channel to report it. Reports may go to dead-letter email addresses or be posted publicly without the project having a chance to remediate first.
3. **No `robots.txt` for AI crawlers**: AI training crawlers (GPTBot, Claude-Web, Google-Extended) are not restricted. While the canvas drawing data is user-generated and ephemeral, restricting these crawlers is a user expectation for an application managing private drawings.
4. **Missing `/.well-known/change-password`**: Password managers and browsers use `/.well-known/change-password` to redirect users to the password change page (WHATWG living standard). Without it, password manager integrations cannot offer direct password-change navigation.
5. **No canonical `favicon.ico`**: No favicon exists, causing a 404 for every browser tab and some security scanners.

## Goal to Achieve
1. Add `public/robots.txt` to disallow crawling of `/auth/`, `/dashboard/`, `/api/`, and restrict AI training crawlers.
2. Add `public/.well-known/security.txt` (RFC 9116) with a contact email and responsible disclosure policy.
3. Add `app/.well-known/change-password/route.ts` to redirect to the password reset page.
4. Add `public/favicon.ico` (a simple placeholder; replaces it with a proper icon in a future design iteration).
5. Document the responsible disclosure policy in `SECURITY.md`.

## What Needs to Be Done

### 1. Create `public/robots.txt`
```
User-agent: *
# Don't index auth or dashboard pages
Disallow: /auth/
Disallow: /dashboard/

# Don't index API endpoints (they return JSON, not HTML)
Disallow: /api/

# Disallow AI training crawlers
User-agent: GPTBot
Disallow: /

User-agent: Claude-Web
Disallow: /

User-agent: Google-Extended
Disallow: /

# Allow: /  (the canvas page is intentionally public)
Sitemap: https://yourdomain.com/sitemap.xml
```

> **Note**: Replace `https://yourdomain.com` with the canonical deployment URL. This can be templated via a build-time environment variable in `next.config.mjs` using the `generateBuildId` and `rewrites` APIs, or left as a literal to update at deploy time.

### 2. Create `public/.well-known/security.txt`
Per [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116):
```
Contact: mailto:security@yourdomain.com
Expires: 2027-01-01T00:00:00.000Z
Preferred-Languages: en, de
Policy: https://yourdomain.com/security-policy
Acknowledgments: https://yourdomain.com/security-acknowledgments
Canonical: https://yourdomain.com/.well-known/security.txt
```

The `Expires` field is required by RFC 9116 (prevents stale security.txt from being trusted). Set to 1 year in the future and update annually.

### 3. Create `app/.well-known/change-password/route.ts`
```typescript
import { NextResponse } from 'next/server';

/**
 * /.well-known/change-password
 *
 * WHATWG Well-Known URL for password changes.
 * Password managers and browsers use this to offer direct navigation to
 * the password change / reset page.
 * https://wicg.github.io/change-password-url/
 */
export function GET() {
  return NextResponse.redirect('/auth/forgot-password', { status: 302 });
}
```

### 4. Create `SECURITY.md`
```markdown
# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | ✅        |

## Reporting a Vulnerability

Please **do not** create a public GitHub issue for security vulnerabilities.

Instead, email **security@yourdomain.com** with:
- A description of the vulnerability.
- Steps to reproduce.
- Your assessment of the impact.

We will respond within **72 hours** and aim to release a fix within **14 days** for critical issues.

## Responsible Disclosure

We follow a 90-day coordinated disclosure policy. We will:
1. Acknowledge receipt of your report within 72 hours.
2. Provide a status update within 7 days.
3. Credit you in the release notes (if you consent).

Thank you for helping keep SketchGit secure.
```

### 5. Add a `Sitemap-Location` response header to the home page (optional)
```typescript
// app/page.tsx or next.config.mjs headers()
{ key: 'X-Robots-Tag', value: 'index, follow' }
```

### 6. Update `next.config.mjs` to add `X-Robots-Tag: noindex` for API routes (optional)
```typescript
async headers() {
  return [
    {
      source: '/api/(.*)',
      headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
    },
    // … existing headers …
  ];
}
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `public/robots.txt` | New file: crawler disallow rules |
| `public/.well-known/security.txt` | New file: RFC 9116 security contact |
| `app/.well-known/change-password/route.ts` | New file: WHATWG password redirect |
| `SECURITY.md` | New file: responsible disclosure policy |
| `next.config.mjs` | Optional: `X-Robots-Tag` header for API routes |

## Additional Considerations

### `robots.txt` and authenticated pages
Next.js middleware (proxy.ts) redirects unauthenticated users from `/dashboard` to `/auth/signin`. However, crawlers that follow redirects will index `/auth/signin` instead. The `Disallow: /auth/` rule prevents crawlers from reaching `/auth/signin` in the first place.

### AI training crawlers
The list of AI training crawlers changes frequently. The `robots.txt` above covers the major known crawlers (GPTBot = OpenAI, Claude-Web = Anthropic, Google-Extended = Google). A comprehensive list is maintained at [ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt); consider periodically updating from that source.

### `security.txt` rotation
The `Expires` field in `security.txt` requires annual updates. Add a calendar reminder or a CI step that fails if `security.txt` expires within 30 days:
```yaml
# .github/workflows/ci.yml
- name: Check security.txt expiry
  run: |
    EXPIRES=$(grep 'Expires:' public/.well-known/security.txt | cut -d' ' -f2)
    node -e "
      const expires = new Date('$EXPIRES');
      const daysLeft = (expires - Date.now()) / 86400000;
      if (daysLeft < 30) { console.error('security.txt expires in ' + daysLeft + ' days'); process.exit(1); }
    "
```

### Privacy implications
`robots.txt` is a public file. It reveals the URL structure of the application to anyone who reads it. The paths listed (`/auth/`, `/api/`) are standard and do not reveal sensitive application details beyond what a security researcher would discover by normal exploration.

## Testing Requirements
- `GET /robots.txt` returns a 200 response with `text/plain` content type.
- The response body contains `Disallow: /api/`.
- `GET /.well-known/security.txt` returns a 200 response containing a `Contact:` field.
- `GET /.well-known/change-password` redirects (302) to `/auth/forgot-password`.
- `SECURITY.md` exists and is valid Markdown.

## Dependency Map
- Builds on: P040 ✅ (password reset flow — `/.well-known/change-password` redirects there)
- Complements: P019 ✅ (security headers — robots.txt and X-Robots-Tag complement the security posture), P063 (Copilot instructions — security.txt contact info documented)
- Independent of: Redis, database, WebSocket, Next.js build pipeline
