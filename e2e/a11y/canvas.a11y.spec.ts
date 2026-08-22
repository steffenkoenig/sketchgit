/**
 * P082 – Accessibility audit (axe-core, WCAG 2.1 AA) of the main canvas app
 * shell (toolbar, topbar, timeline) — the drawing surface itself is excluded.
 *
 * See auth.a11y.spec.ts for why the AxeBuilder setup is duplicated per file
 * rather than shared — a confirmed Playwright loader limitation.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

function buildAxe(page: import("@playwright/test").Page) {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("canvas");
}

test.describe("Accessibility – canvas app shell", () => {
  test("home page (anonymous room) has no WCAG 2.1 AA violations", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 10_000 });
    const results = await buildAxe(page).analyze();
    expect(results.violations).toEqual([]);
  });

  test("commit modal has no WCAG 2.1 AA violations while open", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 10_000 });

    const commitBtn = page.getByRole("button", { name: /commit/i }).first();
    await commitBtn.click();

    const results = await buildAxe(page).analyze();
    expect(results.violations).toEqual([]);
  });
});
