/**
 * P082 – Accessibility audit (axe-core, WCAG 2.1 AA) of the auth pages.
 *
 * The AxeBuilder setup below is duplicated in each *.a11y.spec.ts file
 * rather than factored into a shared helper module — verified that
 * Playwright 1.61's TypeScript loader fails to resolve
 * `@axe-core/playwright`'s conditional exports when it's imported from any
 * file other than the spec file Playwright directly executes (reproduced
 * with both a `.ts` and a plain `.mjs` helper, in the same directory and
 * outside it — same `TypeError: context.conditions?.includes is not a
 * function` in every case). Do not "clean this up" into a shared module.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

function buildAxe(page: import("@playwright/test").Page) {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("canvas"); // the drawing surface has no accessible-DOM equivalent to audit; see reports/accessibility-policy.md
}

test.describe("Accessibility – auth pages", () => {
  test("sign-in page has no WCAG 2.1 AA violations", async ({ page }) => {
    await page.goto("/auth/signin");
    await expect(page.getByRole("button", { name: /sign in|log in/i })).toBeVisible({ timeout: 10_000 });
    const results = await buildAxe(page).analyze();
    expect(results.violations).toEqual([]);
  });

  test("register page has no WCAG 2.1 AA violations", async ({ page }) => {
    await page.goto("/auth/register");
    await expect(page.getByRole("heading", { name: /create.*account|register|sign up/i })).toBeVisible({ timeout: 10_000 });
    const results = await buildAxe(page).analyze();
    expect(results.violations).toEqual([]);
  });
});
