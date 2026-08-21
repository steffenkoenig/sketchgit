# P018 – Replace CDN-Loaded Fabric.js with npm Dependency

## Title
Replace CDN-Loaded Fabric.js with a Bundled npm Dependency

## Brief Summary
Fabric.js is currently loaded at runtime from a public CDN (`cdn.jsdelivr.net`) via a `<script>` tag injected into the page. This approach makes the application dependent on an external service for core functionality, prevents static analysis and type checking of Fabric.js usage, and relies on the CDN being reachable at the exact moment a user loads the app. Installing Fabric.js as an npm package and bundling it with the application eliminates the CDN dependency and unlocks full TypeScript support.

## Current Situation
In `components/SketchGitApp.tsx`, Fabric.js is loaded dynamically at component mount time:
```typescript
useEffect(() => {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/fabric@5.3.1/dist/fabric.min.js';
  script.onload = () => {
    // Only here can the canvas engine be initialized
    const app = createSketchGitApp(...);
    app.init();
  };
  document.head.appendChild(script);
}, []);
```

The canvas engine (`lib/sketchgit/canvas/canvasEngine.ts`) accesses Fabric.js through the global `window.fabric` object:
```typescript
// canvasEngine.ts
const canvas = new (window as any).fabric.Canvas('canvas-el');
```

The version is hard-coded in the CDN URL string (`fabric@5.3.1`). There is no lock file entry for Fabric.js, no integrity hash (`integrity` attribute) on the script tag, and no fallback if the CDN is unreachable.

## Problem with Current Situation
1. **External dependency at runtime**: If `cdn.jsdelivr.net` is down, rate-limiting requests, or the specific version is removed, the application fails to initialize—even if the rest of the page loads correctly.
2. **No Subresource Integrity (SRI)**: The CDN-loaded script has no `integrity` attribute. A compromised CDN could serve malicious JavaScript that runs with full access to the canvas, user data, and WebSocket connection.
3. **No TypeScript types**: Accessing Fabric.js via `window.fabric` requires `(window as any).fabric`, which defeats TypeScript strict mode (P005). All Fabric.js API calls are unchecked at compile time.
4. **Delayed initialization**: The application cannot start until the CDN script has downloaded and executed. On slow connections, this adds a full network round-trip to first interactive time.
5. **No tree-shaking**: The entire Fabric.js bundle is loaded regardless of which tools are actually used. An npm package would allow bundlers to eliminate unused code.
6. **Invisible to `npm audit`**: Fabric.js has no entry in `package.json` or any lock file, so it does not appear in security audits. Vulnerabilities in the CDN-loaded version go undetected.
7. **Version drift risk**: The CDN URL pins a specific version, but there is no automated alert (e.g., Dependabot) to upgrade it when security patches are released.

## Goal to Achieve
1. Install Fabric.js as an npm package and import it normally in TypeScript.
2. Remove all `(window as any).fabric` casts and replace them with typed imports.
3. Eliminate the CDN `<script>` tag injection from the React component.
4. Enable TypeScript to type-check all Fabric.js API calls at compile time.
5. Allow `npm audit` and Dependabot to track Fabric.js for security vulnerabilities.

## What Needs to Be Done

### 1. Install Fabric.js and its TypeScript types
```bash
npm install fabric@5.3.1
npm install --save-dev @types/fabric
```
Fabric.js 5.x ships type definitions via `@types/fabric`. Fabric.js 6.x ships its own bundled types.

### 2. Import Fabric.js in the canvas engine
Replace the global access pattern with a standard import:
```typescript
// lib/sketchgit/canvas/canvasEngine.ts
import { fabric } from 'fabric'; // Named import for Fabric.js 5.x

export class CanvasEngine {
  private canvas: fabric.Canvas;

  init(canvasElementId: string): void {
    this.canvas = new fabric.Canvas(canvasElementId);
  }
}
```
All `(window as any).fabric.*` calls throughout `canvasEngine.ts` become typed `fabric.*` calls.

### 3. Remove the CDN script injection from SketchGitApp.tsx
The `useEffect` that creates and appends the script element, and the `onload` callback pattern, are removed entirely:
```typescript
// components/SketchGitApp.tsx – before
useEffect(() => {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/fabric@5.3.1/dist/fabric.min.js';
  script.onload = () => initApp();
  document.head.appendChild(script);
}, []);

// After – direct initialization at mount
useEffect(() => {
  const app = createSketchGitApp(...);
  app.init();
  return () => app.destroy();
}, []);
```

### 4. Handle SSR / Next.js server-side rendering
Fabric.js requires a DOM environment. In Next.js App Router, canvas components must be client-only. Mark `SketchGitApp.tsx` as a client component (it already uses `'use client'`) and use `next/dynamic` with `ssr: false` if Fabric.js still causes SSR issues:
```typescript
// app/page.tsx or app/dashboard/page.tsx
import dynamic from 'next/dynamic';

const SketchGitApp = dynamic(
  () => import('@/components/SketchGitApp'),
  { ssr: false, loading: () => <p>Loading canvas…</p> }
);
```

### 5. Configure Next.js to handle Fabric.js module format
Fabric.js 5.x uses CommonJS. Add a `next.config.mjs` entry to ensure it is transpiled correctly:
```javascript
// next.config.mjs
const nextConfig = {
  transpilePackages: ['fabric'],
};
```

### 6. Verify bundle size impact
Run `next build` with the `ANALYZE=true` environment variable (requires `@next/bundle-analyzer`) to confirm that Fabric.js is included in the correct chunk. Fabric.js 5.3.1 minified is ~330 KB (pre-gzip). With gzip/Brotli on the server, this is approximately 100 KB transferred—comparable to the CDN bundle size.

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `package.json` | Add `fabric` and `@types/fabric` |
| `components/SketchGitApp.tsx` | Remove CDN script injection; simplify `useEffect` |
| `lib/sketchgit/canvas/canvasEngine.ts` | Replace `(window as any).fabric` with typed `import { fabric } from 'fabric'` |
| `next.config.mjs` | Add `transpilePackages: ['fabric']` if needed |
| `lib/sketchgit/types.ts` | Replace `any`-typed Fabric.js references with proper Fabric.js types |

## Additional Considerations

### Fabric.js v6 migration
Fabric.js 6.x introduced breaking changes (renamed imports, new event model). If upgrading from 5.x to 6.x, consult the Fabric.js migration guide. The proposal targets v5.3.1 (current CDN version) to keep the change minimal. A separate upgrade to v6 can follow.

### Bundle size optimization
If the Fabric.js bundle size is a concern, investigate whether a custom Fabric.js build can be created that excludes unused modules (e.g., image filters, gradients, patterns). The Fabric.js repository provides a build script for custom bundles.

### Offline / PWA capability
With Fabric.js bundled, the application can function entirely offline (after initial load) without any CDN dependency. This is a prerequisite for a future Progressive Web App (PWA) enhancement.

### Testing
With Fabric.js as a proper npm dependency, unit tests can mock it directly:
```typescript
vi.mock('fabric', () => ({
  fabric: {
    Canvas: vi.fn().mockImplementation(() => ({
      add: vi.fn(), remove: vi.fn(), toJSON: vi.fn(() => ({ objects: [] })),
    })),
  },
}));
```
Previously, testing canvas engine code required a full DOM environment because `window.fabric` had to be populated manually.
