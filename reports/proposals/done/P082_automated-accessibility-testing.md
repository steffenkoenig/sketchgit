# P082 – Automated Accessibility Testing with axe-core in CI

## Status
Not Started

## Dimensions
Reliability · Maintainability · Accessibility

## Problem

Proposal P025 introduced ARIA roles, keyboard navigation, and screen-reader support
through a manual review process. While the changes from P025 are captured in code,
there is no automated safety net to prevent **accessibility regressions** from being
merged. Any developer adding a new modal, button, or form element could silently
introduce WCAG 2.1 Level AA violations with no CI signal.

Current gaps:

| Gap | Risk |
|-----|------|
| No automated a11y assertions in unit/integration tests | Regressions ship silently |
| No a11y assertions in the Playwright E2E suite (P038) | Critical user journeys not verified |
| No CI job dedicated to a11y scanning | Violations never discovered at review time |
| No threshold / policy document for acceptable violations | Ambiguity about what is "OK" |

## Proposed Solution

### 1. Unit / Component Tests: `@axe-core/react` + `jest-axe` (via Vitest)

Install `axe-core` and `vitest-axe` (or the `jest-axe` adapter that works with Vitest).
In every React component test file that renders interactive elements, add:

```
const { container } = render(<MyComponent />);
const results = await axe(container);
expect(results).toHaveNoViolations();
```

Priority components to cover immediately:
- All modal dialogs (`components/modals/`)
- The toolbar (`components/Toolbar.tsx`)
- The auth pages (`app/auth/*/page.tsx`)
- The collaboration panel (`components/CollabPanel.tsx`)

### 2. E2E Tests: `@axe-core/playwright`

For each Playwright test in `e2e/`, inject the axe runtime via
`@axe-core/playwright` and run an accessibility audit on the page after every
significant navigation or dialog open:

```typescript
import AxeBuilder from '@axe-core/playwright';

const results = await new AxeBuilder({ page }).analyze();
expect(results.violations).toEqual([]);
```

Apply this to the critical journeys already covered by P038: sign-in, room creation,
drawing, commit, and merge flows.

### 3. CI Job

Add a dedicated `a11y` GitHub Actions job in `.github/workflows/ci.yml` that:
- Runs after the main `ci` job (requires passing lint, type-check, unit tests).
- Builds the Next.js app in test mode.
- Runs `npx playwright test --project=a11y` with a separate axe-focused test project.
- Uploads a JSON accessibility report as a CI artifact.
- **Fails the PR** if any WCAG 2.1 Level AA violations are found.

### 4. Baseline Policy

Create `reports/accessibility-policy.md` that defines:
- Target conformance: WCAG 2.1 Level AA.
- Accepted temporary exclusions (if any) with a linked issue number and expiry date.
- Instructions for suppressing a false-positive with `disableRules` (must be reviewed
  in PR and linked to an upstream issue).

## Code Structure

```
lib/test/
  a11y.ts              ← shared axe configuration (rules, reporterOptions)

e2e/
  a11y/
    auth.a11y.spec.ts
    canvas.a11y.spec.ts
    collaboration.a11y.spec.ts

playwright.config.ts   ← add 'a11y' project with headed=false, same base URL

reports/
  accessibility-policy.md
```

## Type Requirements

- `vitest-axe` / `jest-axe` extends Vitest's `expect` matchers. The `setupFilesAfterEach`
  in `vitest.config.ts` must import `configureAxe` from `vitest-axe`.
- All helpers in `lib/test/a11y.ts` must be typed. No `any`.

## Linting Requirements

No new ESLint rules required. The `no-floating-promises` rule (P042) already forces
`await` on the `axe()` call.

## Test Requirements

The axe tests **are** the tests. Failure conditions:

| Scenario | Expected outcome |
|----------|-----------------|
| A button has no accessible label | Test fails with rule `button-name` |
| A modal lacks `role="dialog"` | Test fails with rule `aria-required-attr` |
| Colour contrast below 4.5:1 | Test fails with rule `color-contrast` |
| A form input has no associated `<label>` | Test fails with rule `label` |

`axe` audits must run against the actual rendered DOM (not snapshots) so that
dynamic content (portals, modals opened via state) is included.

## Database / Data Impact

No schema changes required.

## Repository Structure

- New `e2e/a11y/` directory for accessibility-specific E2E specs.
- New `lib/test/a11y.ts` for shared axe configuration and helper.
- New `reports/accessibility-policy.md` for the conformance baseline.
- Update `playwright.config.ts` to add the `a11y` project.
- Update `vitest.config.ts` to include `vitest-axe` setup in `setupFilesAfterEach`.
- Update `.github/workflows/ci.yml` to add the `a11y` job.

## GitHub Copilot Agents and Skills

- The Copilot instructions file should note that every new interactive component
  requires an `axe(container)` assertion in its test file.
- A custom Copilot skill can scaffold a new a11y test file for a given component path
  by auto-generating the `render` + `axe` + `expect(results).toHaveNoViolations()`
  pattern.
- The CI failure message from axe provides actionable WCAG rule IDs and affected
  HTML nodes, making Copilot Chat highly effective at fixing violations.

## Implementation Order

1. Install `vitest-axe` (unit tests) and `@axe-core/playwright` (E2E).
2. Create `lib/test/a11y.ts` with shared configuration.
3. Update `vitest.config.ts` to import the extended matchers.
4. Add axe assertions to the highest-risk component tests (modals first).
5. Create `e2e/a11y/` E2E specs for critical journeys.
6. Update `playwright.config.ts` with the `a11y` project.
7. Add the `a11y` CI job to `ci.yml`.
8. Create `reports/accessibility-policy.md`.

## Effort Estimate
Small–Medium (1–2 days). `axe-core` is mature and well-documented.

## Dependencies
- P025 ✅ (ARIA/keyboard baseline — ensures initial violations are low)
- P038 ✅ (Playwright E2E suite — the a11y E2E specs extend existing journeys)
- P016 ✅ (CI pipeline — new job added here)

## Implementation Notes (2026-08-22)

Implemented the E2E layer (`@axe-core/playwright` + a dedicated `a11y` CI job)
in full. The unit/component-test layer (`vitest-axe`/`jest-axe` on rendered
components) was **not** implemented — the proposal assumed React Testing
Library-based component tests already existed to attach axe assertions to;
this codebase has zero component-render tests (`@testing-library/react` isn't
even installed — all existing tests are pure-function/API-route/canvas-engine
unit tests). Introducing RTL-based component testing is a separate,
significant testing-infrastructure decision beyond this proposal's stated
scope, and E2E coverage of the actual rendered pages arguably catches more
real WCAG issues anyway (real DOM structure, real CSS, real portal-rendered
modals) than isolated component renders would.

**Found and fixed 5 real pre-existing WCAG 2.1 AA violations** while
verifying the specs against a live app (not just writing specs and assuming
they'd pass):
- `#headSHA` and `#conflictStats`: `aria-label` on a roleless `span`/`div`
  (axe `aria-prohibited-attr`) — added `role="status"` to both (they already
  had `aria-live="polite"`, a natural pairing).
- `.tl-label`, `.auth-divider`, `.auth-footer`, and both password-hint spans
  (register + reset-password pages): all used `--tx3`, which is `#94a3b8` in
  the light theme — 2.19–2.34:1 contrast against the surrounding backgrounds,
  short of WCAG's 4.5:1. Switched to `--tx2` (`#475569`), which passes.
- `.auth-link`: only distinguished from surrounding text by color (axe
  `link-in-text-block`) — now underlined by default, not just on hover.

**Discovered a genuine Playwright limitation**, not a mistake on this
codebase's part: `@axe-core/playwright` fails to resolve inside any file
Playwright loads indirectly (a shared helper module), only working when
imported directly by the executed spec file — reproduced with `.ts` and
plain `.mjs` helpers, same and different directories, all identical
`TypeError: context.conditions?.includes is not a function`. Documented in
`reports/accessibility-policy.md` and inlined the (small) `buildAxe()` setup
per spec file rather than the shared `lib/test/a11y.ts` module the proposal's
"Code Structure" section called for.

**Also found, fixed, and separately found-but-left-open** two things outside
this proposal's direct scope, surfaced while verifying against a live app:
- Fixed: `e2e/auth.spec.ts`'s existing register-flow test had a heading regex
  (`/create account/i`) that didn't match the actual page text ("Create
  *your* account") — a one-line, unambiguous fix, same class of bug found in
  writing this proposal's own specs.
- Left open: fixing that regex unmasked a **separate, pre-existing** failure
  further into the same test — after submitting the registration form, the
  page never navigates away from `/auth/register`. Not investigated further:
  it's unrelated to accessibility, and since `e2e/*.spec.ts` (the whole P038
  suite, not just the new a11y specs) was never wired into CI before this
  change, it's been silently broken with nobody able to notice. Worth a
  dedicated look, but out of scope for this proposal.

Verified end-to-end against a live app, not just written and assumed
correct: ran the actual `a11y` Playwright project against a real Postgres +
`npm run dev`, confirmed the CI job's exact command sequence
(`prisma migrate deploy` → `playwright test --project=a11y`) locally, and
confirmed all 4 specs pass zero-violation after the fixes above.
