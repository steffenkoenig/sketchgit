# P070 – HTTP `Cache-Control` Headers for Commit-Addressed API Responses

## Title
Add `Cache-Control: public, immutable` Headers to SHA-Addressed Responses to Enable CDN and Browser Caching of Commit History and Canvas Exports

## Brief Summary
API responses for specific commit SHAs (the export endpoint `GET /api/rooms/[roomId]/export?sha=<sha>` and the commit history list) are effectively immutable—a commit with SHA `abc123` will always contain the same canvas data. Despite this, all API responses currently include no `Cache-Control` header, causing every client to refetch the same data on every navigation. Adding `Cache-Control: public, immutable, max-age=31536000` for SHA-specific responses and `Cache-Control: private, no-store` for mutable responses (latest HEAD, auth endpoints) eliminates redundant network round-trips and enables CDN edge caching.

## Current Situation
All API route handlers in `app/api/` return `NextResponse.json()` or `new NextResponse()` without any `Cache-Control` header. Next.js adds `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` to all API routes by default (treating them as non-cacheable private responses).

### Cacheable responses that are never cached
| Endpoint | Cacheability | Current header | Should be |
|----------|-------------|----------------|-----------|
| `GET /api/rooms/[roomId]/export?sha=abc123` | Immutable (SHA-addressed) | `private, no-cache` | `public, immutable, max-age=31536000` |
| `GET /api/rooms/[roomId]/export` (no sha) | Stale quickly (HEAD) | `private, no-cache` | `private, max-age=0, must-revalidate` |
| `GET /api/rooms/[roomId]/commits?cursor=abc123` | Immutable (cursor is a SHA) | `private, no-cache` | `public, immutable, max-age=31536000` |
| `GET /api/rooms/[roomId]/commits` (no cursor) | Stale quickly | `private, no-cache` | `private, max-age=60, stale-while-revalidate=30` |
| `GET /api/docs/openapi.json` (P062) | Stable (changes only on deploy) | not applicable | `public, max-age=3600, stale-while-revalidate=300` |

### High-frequency use case
Canvas export downloads are a common workflow: a designer shares a `?sha=abc123` link. Every recipient refetches the same 50–200 KB PNG from the server. With CDN caching, the second and subsequent downloads are served from the edge, reducing server CPU and egress cost significantly.

## Problem with Current Situation
1. **Redundant server load for immutable content**: Canvas exports for specific SHAs never change but are regenerated on every request, running Fabric.js's headless renderer on each hit.
2. **No CDN caching**: Without `Cache-Control: public`, CDN layers (Cloudflare, CloudFront, Fastly) do not cache the response, even if the same URL is hit thousands of times.
3. **No browser caching**: Browsers do not cache API responses without explicit `Cache-Control` headers. Re-opening the same export URL triggers a full server round-trip.
4. **Inconsistent UX for shared links**: A team member sharing `?sha=abc123` export link with 20 colleagues generates 20 identical server-side Fabric.js renders.
5. **Missing ETag for conditional requests**: Without `ETag` headers, conditional GET requests (`If-None-Match`) cannot work, so even clients that have a cached version must re-download the full response.

## Goal to Achieve
1. Add `Cache-Control: public, immutable, max-age=31536000` to responses for specific SHA-addressed content (export and commit pages).
2. Add `Cache-Control: private, max-age=0, must-revalidate` for mutable latest-HEAD responses.
3. Add `ETag` headers (SHA value as the ETag) for exports and commit pages to enable conditional GET (`If-None-Match: "abc123"`).
4. Add `Cache-Control: public, max-age=3600, stale-while-revalidate=300` for the OpenAPI spec (P062) — changes only on deploy.
5. Create a shared `lib/api/cacheHeaders.ts` helper so caching policies are centralised and easy to update.

## What Needs to Be Done

### 1. Create `lib/api/cacheHeaders.ts`
```typescript
/**
 * Cache-Control header helpers for API routes.
 *
 * Three tiers:
 * - `immutable(sha)`:  SHA-addressed content that never changes.
 * - `mutable()`:       Latest-HEAD content; revalidate on every visit.
 * - `shortLived(secs)`: Slowly-changing public content (OpenAPI spec, etc.).
 */

/** 1 year in seconds */
const ONE_YEAR = 31_536_000;

/**
 * Returns Cache-Control + ETag headers for a response that is immutably
 * addressed by a commit SHA. Safe for public CDN caching.
 *
 * @param sha – the commit SHA used to address this content
 */
export function immutableHeaders(sha: string): HeadersInit {
  return {
    'Cache-Control': `public, immutable, max-age=${ONE_YEAR}`,
    'ETag': `"${sha}"`,
  };
}

/**
 * Returns Cache-Control headers for a response that may change at any time
 * (latest HEAD of a room, authenticated user data, etc.).
 * Browsers and CDNs must not cache this beyond the current request.
 */
export function mutableHeaders(): HeadersInit {
  return {
    'Cache-Control': 'private, no-cache, no-store, must-revalidate',
  };
}

/**
 * Returns Cache-Control headers for slowly-changing public content that
 * can be served stale for a short period while revalidating in the background.
 *
 * @param maxAgeSec – fresh lifetime in seconds (default: 3600)
 * @param swrSec    – stale-while-revalidate window in seconds (default: 300)
 */
export function shortLivedHeaders(maxAgeSec = 3600, swrSec = 300): HeadersInit {
  return {
    'Cache-Control': `public, max-age=${maxAgeSec}, stale-while-revalidate=${swrSec}`,
  };
}
```

### 2. Update `GET /api/rooms/[roomId]/export`
```typescript
import { immutableHeaders, mutableHeaders } from '@/lib/api/cacheHeaders';

// When `sha` is explicitly provided in the query:
if (reqSha) {
  // Content is immutable for this SHA — safe to cache for a year.
  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${filename}.png"`,
      ...immutableHeaders(reqSha),
    },
  });
} else {
  // HEAD export — may change after any commit, must not be cached.
  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${filename}.png"`,
      ...mutableHeaders(),
    },
  });
}
```

### 3. Update `GET /api/rooms/[roomId]/commits`
```typescript
import { immutableHeaders, mutableHeaders } from '@/lib/api/cacheHeaders';

// When a cursor (SHA) is provided, the page of commits at that cursor is immutable.
if (cursor) {
  return NextResponse.json({ commits: page, nextCursor }, {
    headers: immutableHeaders(cursor),
  });
} else {
  // First page (latest commits) — may change when new commits are pushed.
  return NextResponse.json({ commits: page, nextCursor }, {
    headers: mutableHeaders(),
  });
}
```

### 4. Handle `If-None-Match` conditional GET
For `ETag`-bearing responses, check the incoming `If-None-Match` header and return `304 Not Modified` if the ETag matches:
```typescript
const ifNoneMatch = req.headers.get('if-none-match');
if (reqSha && ifNoneMatch === `"${reqSha}"`) {
  return new NextResponse(null, { status: 304 });
}
```

### 5. Update `GET /api/docs/openapi.json` (P062)
When implemented, the OpenAPI spec should use `shortLivedHeaders()`:
```typescript
return NextResponse.json(buildOpenApiSpec(), {
  headers: shortLivedHeaders(3600, 300),
});
```

### 6. Add `Vary: Accept-Encoding` for compressed responses
When P059 WebSocket compression is enabled, HTTP responses from Next.js are separately gzip-compressed by the server. Adding `Vary: Accept-Encoding` ensures CDNs store separate copies for compressed and uncompressed clients:
```typescript
// Include this in all public cacheable responses:
'Vary': 'Accept-Encoding',
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `lib/api/cacheHeaders.ts` | New file: cache header helpers |
| `app/api/rooms/[roomId]/export/route.ts` | Add `Cache-Control` and `ETag` headers |
| `app/api/rooms/[roomId]/commits/route.ts` | Add `Cache-Control` headers |
| `app/api/docs/openapi.json/route.ts` (P062) | Add `Cache-Control` headers when implemented |

## Additional Considerations

### Security: caching authenticated responses
The `immutableHeaders()` function uses `Cache-Control: public`, which allows CDNs and shared caches to serve the response to any requester. This is appropriate **only for export and commit content that has already passed an access control check** (the export route verifies membership before generating the response). If a room is later made private after being public, the cached export responses remain publicly cached until they expire (1 year). This is acceptable for export content (the committed drawing is a copy of what was public at the time of caching).

For private rooms where the access control check runs before the cache header is applied, use `private, immutable` instead of `public, immutable`:
```typescript
export function immutablePrivateHeaders(sha: string): HeadersInit {
  return {
    'Cache-Control': `private, immutable, max-age=${ONE_YEAR}`,
    'ETag': `"${sha}"`,
  };
}
```

### CDN invalidation on room deletion
When a room is deleted (P032 pruning job or P041 GDPR deletion), cached export responses for that room remain in CDN caches until they expire. This is a trade-off: for a year-long cache, old exports remain accessible after the room is deleted. If this is unacceptable, use a shorter `max-age` (e.g., 1 week) or implement CDN cache invalidation via the provider's API on room deletion.

### `Cache-Control: immutable`
The `immutable` directive (supported by all major browsers since 2017) tells the browser to never revalidate a cached response during the `max-age` window, even on manual page refresh. This provides the strongest caching guarantee and eliminates conditional GET requests entirely.

## Testing Requirements
- `GET /api/rooms/[roomId]/export?sha=abc123` returns `Cache-Control: public, immutable, max-age=31536000` and `ETag: "abc123"`.
- `GET /api/rooms/[roomId]/export` (no sha) returns `Cache-Control: private, no-cache, no-store, must-revalidate`.
- `GET /api/rooms/[roomId]/export?sha=abc123` with `If-None-Match: "abc123"` returns `304 Not Modified`.
- `GET /api/rooms/[roomId]/commits?cursor=abc123` returns `Cache-Control: public, immutable, max-age=31536000`.
- `GET /api/rooms/[roomId]/commits` (no cursor) returns `Cache-Control: private, no-cache, ...`.
- `immutableHeaders('abc')` returns the expected header object (unit test).
- Auth endpoints (`/api/auth/**`) are not affected by this change.

## Dependency Map
- Builds on: P029 ✅ (paginated commits — cursor = SHA enables immutable caching), P039 ✅ (canvas export endpoint)
- Complements: P062 (OpenAPI docs — spec uses `shortLivedHeaders()`), P026 ✅ (Docker deployment behind a CDN)
- Independent of: Redis, WebSocket, auth
