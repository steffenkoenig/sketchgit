# P087 – Visual Regression Testing with Playwright Snapshots

## Status
Not Started

## Dimensions
Reliability · Maintainability

## Problem

SketchGit has a growing UI: canvas toolbar, timeline panel, modals, collaboration
panel, theme toggle (P078), and auth pages. The Playwright E2E suite (P038) validates
functional behaviour (clicks, form submissions, WebSocket messages) but does **not**
catch **visual regressions** — unintended changes to layout, colour, spacing, or
component appearance caused by:

- TailwindCSS version upgrades.
- Component refactoring for performance (P021) or accessibility (P025/P082).
- Theme changes (dark/light toggle from P078).
- Fabric.js canvas rendering changes across versions.

A developer making an "internal-only" refactor can accidentally shift a button by 2px,
change a modal's background colour, or alter the canvas default stroke — and no CI
check will catch it before it ships.

## Proposed Solution

Use **Playwright's built-in visual comparison** (`expect(page).toHaveScreenshot()` /
`expect(locator).toHaveScreenshot()`) to capture and compare pixel snapshots of key
UI states.

### Snapshots to capture

| Name | Element / State | Variants |
|------|----------------|---------|
| `toolbar-default` | Full toolbar | light, dark |
| `toolbar-tool-selected` | Toolbar with pen tool active | light, dark |
| `canvas-empty` | Empty canvas area | light, dark |
| `canvas-with-objects` | Canvas with seeded rect + circle | light, dark |
| `timeline-empty` | Timeline with no commits | light, dark |
| `timeline-with-commits` | Timeline with 5 commits | light, dark |
| `modal-commit` | Commit dialog open | light, dark |
| `modal-merge-conflict` | Merge conflict dialog open | light, dark |
| `collab-panel` | Collaboration panel with one peer | light, dark |
| `auth-signin` | Sign-in page | light only |
| `auth-register` | Registration page | light only |
| `dashboard` | Dashboard with two rooms | light, dark |

Total: ~22 baseline snapshots (expandable as UI grows).

### Snapshot update workflow

1. Snapshots are committed to the repository in `e2e/snapshots/` (tracked by git).
2. When a **deliberate** UI change is made, run `npx playwright test --update-snapshots`
   locally to regenerate the affected baseline images.
3. The updated snapshot files are committed in the same PR as the UI change.
4. CI automatically validates that no other snapshots were accidentally changed.

### Pixel difference threshold

Configure a `maxDiffPixelRatio` of `0.01` (1% of pixels) to tolerate sub-pixel
anti-aliasing differences across platforms:

```typescript
expect(page).toHaveScreenshot('toolbar-default-light.png', {
  maxDiffPixelRatio: 0.01,
});
```

### Theme variants

Snapshots for dark mode set the `prefers-color-scheme` media feature via Playwright's
`colorScheme` option:

```typescript
const page = await context.newPage();
await context.emulateMedia({ colorScheme: 'dark' });
```

### CI integration

Add a `visual` Playwright project in `playwright.config.ts`. The CI job:
- Runs the `visual` project after the main E2E suite.
- Uses `--update-snapshots` **only** on pushes to the `main` branch with a special
  `[update-snapshots]` flag in the commit message — never on PR branches.
- Fails if any snapshot comparison exceeds the `maxDiffPixelRatio` threshold.

## Code Structure

```
e2e/
  visual/
    toolbar.visual.spec.ts
    canvas.visual.spec.ts
    timeline.visual.spec.ts
    modals.visual.spec.ts
    auth.visual.spec.ts
    dashboard.visual.spec.ts
  snapshots/
    toolbar-default-light.png
    toolbar-default-dark.png
    … (committed baseline images)

playwright.config.ts   ← new 'visual' project with snapshotDir config
```

## Type Requirements

No new TypeScript types needed. Playwright's `toHaveScreenshot` matcher is typed in
`@playwright/test`.

## Linting Requirements

No new ESLint rules required. Snapshot update commits follow the Conventional Commits
format: `test(visual): update toolbar snapshot after button radius change`.

## Test Requirements

Visual tests extend the Playwright test model. Each spec file:
1. Navigates to the target route.
2. Waits for all animations and async data to settle
   (`page.waitForLoadState('networkidle')`).
3. Calls `toHaveScreenshot()` with a stable, descriptive name.
4. Uses `page.waitForSelector()` to ensure dynamic content (e.g. canvas objects) is
   rendered before snapshotting.

Test data for canvas snapshots must use deterministic seeds (e.g. a specific room slug
seeded in the test database) to prevent snapshot variance from random content.

## Database / Data Impact

Visual tests use the same Playwright test database as P038. Add snapshot-specific
seed data (rooms with deterministic canvas state) to the E2E seed script.

## Repository Structure

- New `e2e/visual/` directory.
- New `e2e/snapshots/` directory committed to git (with `e2e/snapshots/**/*.png` added
  to `.gitattributes` as binary files to avoid diff noise).
- Add `e2e/snapshots/` to `.gitignore` exclusions only for the CI-generated diff
  artifacts (not the baseline images themselves).
- Update `playwright.config.ts` with the `visual` project.
- Update `ci.yml` to run the `visual` project.

## GitHub Copilot Agents and Skills

- Copilot Chat can inspect snapshot diff artifacts uploaded by CI to identify which
  pixel region changed and suggest the root cause.
- The `new-component` Copilot skill (see P086) should include a step to add a visual
  snapshot for the new component.
- When updating snapshots, developers can describe the intended visual change to
  Copilot and it will generate the appropriate `toHaveScreenshot` call.

## Implementation Order

1. Add `visual` project to `playwright.config.ts`.
2. Write the toolbar and canvas specs (highest-value, most stable).
3. Generate initial baselines: `npx playwright test --update-snapshots --project=visual`.
4. Commit baseline images.
5. Add remaining specs (timeline, modals, auth, dashboard).
6. Add `.gitattributes` binary marker for `.png` files in `e2e/snapshots/`.
7. Add `visual` job to `ci.yml`.

## Effort Estimate
Medium (2–3 days). Initial baseline generation is quick; the ongoing maintenance cost
is low if snapshot updates are consistently committed with UI changes.

## Dependencies
- P038 ✅ (Playwright E2E suite — visual tests share the same Playwright setup)
- P078 ✅ (theme toggle — dark/light variants require the toggle to be implemented)
- P016 ✅ (CI pipeline — new job added here)
- P025 ✅ (accessibility — stable ARIA selectors enable reliable element targeting)
