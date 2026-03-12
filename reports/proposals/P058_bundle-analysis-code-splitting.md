# P058 – Next.js Bundle Analysis and Dynamic Code Splitting

## Title
Reduce JavaScript Bundle Size Through Automated Bundle Analysis and Dynamic Imports for Heavy Client-Side Modules

## Brief Summary
The production JavaScript bundle currently includes Fabric.js (≈350 KB minified + gzipped), all coordinator modules, and every client-side modal and UI component in a single eagerly-loaded chunk. Using `@next/bundle-analyzer` to measure actual bundle composition, combined with dynamic `import()` for the canvas engine and heavy UI components, can significantly reduce the initial parse-and-execute time—especially on mobile devices—without changing any user-visible behavior.

## Current Situation
`components/SketchGitApp.tsx` initialises the entire SketchGit application in a single `useEffect`. The `createSketchGitApp` factory (imported at the top of the file) transitively pulls in:

- `fabric` (npm package, ~350 KB gzip) at module load time
- All coordinator modules (`branchCoordinator`, `mergeCoordinator`, `collaborationCoordinator`, …)
- All modal and UI utilities (`modals.ts`, `timelineRenderer.ts`, `toast.ts`)
- `WsClient` and `CollaborationManager`

None of these modules use `next/dynamic` or `import()`. The Next.js build therefore places everything in the same initial JavaScript chunk that is served to every visitor—including unauthenticated users landing on the home page who will never use the canvas.

There is no bundle analyzer configured; the team cannot currently see how large each chunk is or which dependencies dominate.

### Relevant files
```
components/SketchGitApp.tsx         ← eager import of createSketchGitApp
lib/sketchgit/createSketchGitApp.ts ← re-export shim → app.ts
lib/sketchgit/app.ts                ← imports all coordinators + canvas engine
lib/sketchgit/canvas/canvasEngine.ts← imports fabric (~350 KB gzip)
next.config.mjs                     ← no bundleAnalyzer configured
package.json                        ← no @next/bundle-analyzer devDependency
```

## Problem with Current Situation
1. **Large initial JS payload**: Fabric.js alone adds ~350 KB to the first paint. Users on 3G connections or low-end devices experience a multi-second delay before the canvas is interactive.
2. **No visibility into bundle composition**: Without a bundle analyzer, the team cannot identify regressions introduced by new dependencies or refactors.
3. **Eagerly loaded code that is conditionally used**: The canvas engine is only needed on the main canvas page (`/`), not on `/dashboard`, `/auth/signin`, `/auth/register`, etc. Loading it on every page wastes parse time.
4. **Tree-shaking blind spots**: Fabric.js exposes many classes; without visibility into which are actually used, it is impossible to verify that unused classes (e.g., `IText` vs `Text`, `StaticCanvas`) are being eliminated by the bundler.

## Goal to Achieve
1. Add `@next/bundle-analyzer` as a development dependency and integrate it with `next.config.mjs` so `ANALYZE=true npm run build` generates an interactive bundle visualization.
2. Convert `SketchGitApp` to load the SketchGit engine via a dynamic `import()` inside its `useEffect`, so the Fabric.js chunk is only downloaded when the canvas component mounts.
3. Wrap the heavy coordinator-and-canvas factory in a `next/dynamic` boundary so it is excluded from the server-side render and the initial HTML payload.
4. Verify that the changes reduce the initial JS chunk size by at least 30% (target: all non-canvas pages below 150 KB initial JS).
5. Add a CI step that fails if any single chunk exceeds a defined size budget (e.g., 500 KB).

## What Needs to Be Done

### 1. Install `@next/bundle-analyzer`
```bash
npm install --save-dev @next/bundle-analyzer
```

### 2. Update `next.config.mjs`
```js
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default withBundleAnalyzer(nextConfig);
```
Add an `analyze` script to `package.json`:
```json
"analyze": "ANALYZE=true npm run build"
```

### 3. Dynamic import for the SketchGit engine
In `components/SketchGitApp.tsx`, replace the top-level static import with a dynamic one inside `useEffect`:
```tsx
// Before:
import { createSketchGitApp } from '../lib/sketchgit/createSketchGitApp';

// After (dynamic import – Fabric.js chunk is only loaded when component mounts):
useEffect(() => {
  if (appRef.current) return;
  let cancelled = false;
  import('../lib/sketchgit/createSketchGitApp').then(({ createSketchGitApp }) => {
    if (cancelled) return;
    const app = createSketchGitApp();
    appRef.current = app;
  });
  return () => {
    cancelled = true;
    appRef.current?.destroy();
    appRef.current = null;
  };
}, []);
```

### 4. Wrap `SketchGitApp` with `next/dynamic` in the page component
In `app/page.tsx`, replace the direct import with:
```tsx
import dynamic from 'next/dynamic';
const SketchGitApp = dynamic(() => import('@/components/SketchGitApp'), {
  ssr: false,
  loading: () => <div className="flex h-screen items-center justify-center text-slate-400">Loading canvas…</div>,
});
```
`ssr: false` prevents Next.js from attempting to render Fabric.js (which requires `window` and `document`) on the server.

### 5. Verify Fabric.js tree-shaking
Audit `canvasEngine.ts` to ensure only the Fabric.js classes that are actually instantiated are imported. Replace namespace imports (`import * as fabric from 'fabric'`) with named imports for each used class:
```ts
import { Canvas, Path, Polyline, Rect, Ellipse, Line, IText, Polygon, Group, FabricObject, Point } from 'fabric';
```
This pattern is already partially in place; confirm that no wildcard re-import exists in any indirect module.

### 6. Add a bundle size CI check
In `.github/workflows/ci.yml`, add a step after the Next.js build that fails if any JS file in `.next/static/chunks/` exceeds 500 KB:
```yaml
- name: Check bundle sizes
  run: |
    node -e "
      const fs = require('fs');
      const path = require('path');
      const dir = '.next/static/chunks';
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
      let fail = false;
      for (const f of files) {
        const size = fs.statSync(path.join(dir, f)).size;
        if (size > 500 * 1024) {
          console.error(\`LARGE CHUNK: \${f} (\${(size/1024).toFixed(1)} KB)\`);
          fail = true;
        }
      }
      process.exit(fail ? 1 : 0);
    "
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `package.json` | Add `@next/bundle-analyzer` devDependency; add `analyze` script |
| `next.config.mjs` | Wrap config with `bundleAnalyzer()` |
| `components/SketchGitApp.tsx` | Replace static import with dynamic `import()` in `useEffect` |
| `app/page.tsx` | Wrap `SketchGitApp` with `next/dynamic` (`ssr: false`) |
| `.github/workflows/ci.yml` | Add bundle size check step |

## Additional Considerations

### Incremental loading UX
When the canvas chunk is loaded dynamically, users on slow connections will briefly see the loading placeholder before the canvas appears. The existing `loading` option in `next/dynamic` handles this; the placeholder should match the dark theme already used in the application.

### Source maps in production
Bundle analysis is most useful with source maps enabled. Add `productionBrowserSourceMaps: true` to `next.config.mjs` in development builds only (not production, as source maps increase deploy size).

### Impact on SSR / SEO
The canvas page has no meaningful SSR content (it is an interactive application), so `ssr: false` has no SEO impact. The auth and dashboard pages are not affected by this change.

### Relationship to Fabric.js versioning
P018 already replaced the CDN-loaded Fabric.js with the `fabric` npm package. This proposal builds on that by ensuring the npm package is code-split from the initial bundle, not merely that it is bundled at all.

## Testing Requirements
- `npm run analyze` must complete without error and produce `.next/analyze/*.html` files.
- `npm run build` must succeed with the dynamic import in place.
- The canvas page must load and be interactive in the browser after the dynamic import.
- Non-canvas pages (`/dashboard`, `/auth/signin`) must not download the Fabric.js chunk.
- The CI bundle-size check must fail for a synthetic 600 KB JS file and pass for the actual build output.

## Dependency Map
- Builds on: P018 ✅ (Fabric.js as npm package makes tree-shaking possible)
- Complements: P021 ✅ (React performance), P022 ✅ (canvas rendering performance)
- Independent of: Redis, database, auth
