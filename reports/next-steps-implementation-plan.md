# Next Steps Implementation Plan

This document outlines the implementation plans for the highest priority next steps for the SketchGit application. These include fixing critical bugs, addressing legal compliance gaps, and implementing a quick win process improvement.

## 1. Fix Arrow Snap Crash (BUG-020 & BUG-021)

### Problem Description
- **BUG-020 (Critical):** `reSnapOnModified` lacks a re-entrancy guard. When an arrow group is dragged and dropped near a shape, the `object:modified` event fires. At the end of snap processing, calling `setActiveObject` triggers Fabric.js to emit a second `object:modified` event before the internal transform state clears, causing a synchronous infinite loop that crashes the browser tab.
- **BUG-021 (Low):** The `requestAnimationFrame` scheduled by the preceding `object:moving` event is never cancelled when `reSnapOnModified` removes the original arrow group, leaving a stale callback pointing to a deleted object.

### Proposed Solution
Add a private boolean flag `_reSnapping` to `CanvasEngine` to act as a re-entrancy guard. Additionally, properly clean up the pending `requestAnimationFrame` immediately upon entering the rebuild path of `reSnapOnModified`.

### Code Changes
**File:** `lib/sketchgit/canvas/canvasEngine.ts`

1. **Add the Re-entrancy Flag:**
   ```typescript
   // Add property to CanvasEngine class
   private _reSnapping = false;
   ```

2. **Implement Guard in the Event Handler:**
   ```typescript
   // Update the object:modified listener (around L174-L181)
   this.canvas.on('object:modified', (e) => {
     if (this._reSnapping) return;
     this._reSnapping = true;
     try {
       // ... existing code: pushHistory, markDirty
       if (e.target) {
         this.reSnapOnModified(e.target);
       }
       // ... existing code: onBroadcastDraw
     } finally {
       this._reSnapping = false;
     }
   });
   ```

3. **Cancel Stale rAF in `reSnapOnModified`:**
   ```typescript
   // Update reSnapOnModified (around L1960)
   private reSnapOnModified(target: fabric.Object) {
     if (target._isArrow) {
       // Cancel pending attachment rAF before rebuilding
       if (this._attachmentRafId !== null) {
         cancelAnimationFrame(this._attachmentRafId);
         this._attachmentRafId = null;
         this._attachmentRafTarget = null;
       }
       // ... continue with existing arrow snap logic
     }
     // ...
   }
   ```

### Verification
1. Open a room, draw a rectangle, and draw an arrow.
2. Select the arrow, drag one endpoint near the rectangle border, and release.
3. **Assert:** A single snapped arrow remains. The browser tab does not crash.
4. Review console logs for any errors regarding `updateAttachedLines`.

---

## 2. Eliminate Google Fonts CDN (GAP-016)

### Problem Description
The application currently imports Google Fonts via a CDN URL in `app/globals.css`. This practice transmits user IP addresses to Google's US servers without prior consent, violating the DSGVO (GDPR) and TTDSG. A German court (LG München I) has explicitly ruled against this setup.

### Proposed Solution
Remove the `@import` statement from the global CSS and utilize Next.js's built-in `next/font/google`. This tool automatically downloads the fonts at build time and serves them locally, completely preventing runtime IP leaks to Google.

### Code Changes
1. **Update Global CSS:**
   **File:** `app/globals.css`
   - Remove line 1: `@import url('https://fonts.googleapis.com/css2?...');`

2. **Implement `next/font/google`:**
   **File:** `app/layout.tsx`
   ```tsx
   import { Space_Grotesk, Fira_Code } from 'next/font/google';

   const spaceGrotesk = Space_Grotesk({
     subsets: ['latin'],
     weight: ['400', '500', '600', '700'],
     variable: '--font-space-grotesk',
     display: 'swap',
   });

   const firaCode = Fira_Code({
     subsets: ['latin'],
     weight: ['300', '400', '500', '600'],
     variable: '--font-fira-code',
     display: 'swap',
   });

   // Apply the variables to the HTML tag
   export default async function RootLayout({ children }: { children: React.ReactNode }) {
     // ...
     return (
       <html lang={locale} className={`${spaceGrotesk.variable} ${firaCode.variable}`}>
         {/* ... */}
       </html>
     );
   }
   ```

3. **Update Tailwind Configuration (if necessary):**
   **File:** `tailwind.config.ts`
   Ensure font families map to the CSS variables defined by Next.js:
   ```typescript
   theme: {
     extend: {
       fontFamily: {
         sans: ['var(--font-space-grotesk)', 'sans-serif'],
         mono: ['var(--font-fira-code)', 'monospace'],
       },
     }
   }
   ```

4. **Update Content Security Policy:**
   **File:** `proxy.ts`
   - Remove `https://fonts.googleapis.com` and `https://fonts.gstatic.com` from `style-src` and `font-src` directives if they are present. Ensure `'self'` is allowed.

### Verification
1. Run `npm run dev` and open the browser's Network tab.
2. Hard reload the page.
3. **Assert:** Zero requests are made to `fonts.googleapis.com` or `fonts.gstatic.com`.
4. **Assert:** Fonts render correctly (Space Grotesk for UI, Fira Code for code/canvas).

---

## 3. Implement Dependency License Scanning (P089)

### Problem Description
SketchGit relies on numerous npm dependencies, but there is no automated CI check to ensure their licenses are compliant with the project's distribution model (e.g., blocking restrictive copyleft licenses like GPL).

### Proposed Solution
Integrate `license-checker-rseidelsohn` into the CI pipeline. Create a formal policy document and a local developer script. The CI step will fail the build if a non-compliant license is detected in the production dependencies.

### Code Changes

1. **Create License Policy Document:**
   **File:** `reports/license-policy.md`
   Document the allowed licenses (MIT, ISC, Apache-2.0, CC0-1.0, etc.), blocked licenses (GPL, AGPL), and the review process for exceptions.

2. **Create Local Check Script:**
   **File:** `scripts/check-licenses.mjs`
   ```javascript
   import { execSync } from 'child_process';
   try {
     console.log('Running license check on production dependencies...');
     const output = execSync('npx license-checker-rseidelsohn --production --json', { encoding: 'utf-8' });
     console.log('License check completed successfully.');
     // Optional: Add custom parsing and reporting logic here
   } catch (error) {
     console.error('License check failed:', error.message);
     process.exit(1);
   }
   ```

3. **Update CI Pipeline:**
   **File:** `.github/workflows/ci.yml`
   Add a new step to the existing `ci` job:
   ```yaml
   - name: License compliance check
     run: |
       npx license-checker-rseidelsohn \
         --production \
         --failOn "GPL-2.0;GPL-3.0;AGPL-3.0;SSPL-1.0;BUSL-1.1" \
         --onlyAllow "MIT;ISC;BSD-2-Clause;BSD-3-Clause;Apache-2.0;CC0-1.0;Unlicense;0BSD;LGPL-2.1;MPL-2.0;Python-2.0;CC-BY-4.0"
   ```

4. **Update Dependabot Config:**
   **File:** `.github/dependabot.yml`
   Add a comment reminding reviewers to check license changes on dependency updates.

### Verification
1. Run `npx license-checker-rseidelsohn --production` locally.
2. **Assert:** All current production dependencies fall within the allowed list. (Resolve any immediate violations if found).
3. Push changes to a branch and observe the GitHub Actions run.
4. **Assert:** The "License compliance check" step passes successfully.
