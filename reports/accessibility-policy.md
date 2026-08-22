# Accessibility Policy

## Target Conformance

**WCAG 2.1 Level AA.** Enforced automatically via axe-core (`@axe-core/playwright`)
in the `a11y` CI job (`.github/workflows/ci.yml`), which runs
`e2e/a11y/*.a11y.spec.ts` against the built app and fails the build on any
violation.

## Scope

The audited surface is the application chrome — auth pages, the canvas app
shell (topbar, toolbar, timeline), and modals/dialogs. The `<canvas>` drawing
surface itself is explicitly excluded (`.exclude("canvas")` in the
`buildAxe()` helper defined in each `e2e/a11y/*.spec.ts` file — see the
Implementation Note below for why it's duplicated per file): a raster/vector
drawing canvas has no accessible-DOM equivalent for axe-core to audit
against, and freeform drawing is inherently a visual medium.

## Accepted Exclusions

None currently. Any exclusion added in the future must be recorded here with:
- The specific axe rule ID excluded.
- Why it cannot be satisfied (with a linked GitHub issue if the fix is planned).
- An expiry date or condition under which the exclusion is revisited.

## Suppressing a False Positive

If axe reports a violation that is a genuine false positive (not a real
accessibility barrier), do not silently work around it. Instead:
1. Confirm it's actually a false positive by testing with a real screen reader
   or the relevant WCAG success criterion text, not just judgment.
2. Add a scoped `.disableRules([...])` call on the specific `AxeBuilder`
   instance (never disable a rule globally) with a comment explaining why.
3. Link the suppression to an upstream axe-core issue if the false positive is
   a known axe-core bug, or to an internal issue if it's specific to this app.
4. Get it reviewed in the PR — a disabled rule is a policy exception, not a
   routine code change.

## Adding New Audited Pages

When a new page or significant new interactive surface (a new modal, a new
top-level route) is added, add a corresponding `*.a11y.spec.ts` test in
`e2e/a11y/` following the pattern in the existing specs. Coverage today:

| Surface | Spec |
|---------|------|
| Sign-in page | `e2e/a11y/auth.a11y.spec.ts` |
| Register page | `e2e/a11y/auth.a11y.spec.ts` |
| Home page / canvas app shell | `e2e/a11y/canvas.a11y.spec.ts` |
| Commit modal | `e2e/a11y/canvas.a11y.spec.ts` |

Not yet covered (candidates for future specs): the dashboard, the branch
modal, the share/invite modal, the merge-conflict resolution modal.

## Implementation Note: Shared Axe Config

The `AxeBuilder` setup (tags, exclusions) is duplicated in each
`*.a11y.spec.ts` file rather than factored into a shared `lib/test/`
helper module. This is deliberate, not an oversight: Playwright 1.61's
TypeScript loader fails to resolve `@axe-core/playwright`'s conditional
package exports when the package is imported from any file other than the
spec file Playwright directly executes (`TypeError: context.conditions
?.includes is not a function`) — reproduced with both a `.ts` and a plain
`.mjs` helper module, both inside and outside the `e2e/` directory. If a
future Playwright upgrade resolves this, consider re-factoring into a shared
helper — but verify with a real test run first, not just that it builds.
