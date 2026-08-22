/**
 * P087 – Visual regression: empty canvas area, light and dark theme.
 */
import { test, expect } from "@playwright/test";

test.describe("Visual – canvas", () => {
  for (const theme of ["dark", "light"] as const) {
    test(`empty canvas (${theme})`, async ({ page }) => {
      await page.goto("/");
      if (theme === "light") {
        await page.evaluate(() => {
          document.cookie = "THEME=light; path=/";
        });
        await page.reload();
      }
      const canvas = page.locator("canvas").first();
      await expect(canvas).toBeVisible({ timeout: 10_000 });
      await expect(canvas).toHaveScreenshot(`canvas-empty-${theme}.png`, { maxDiffPixelRatio: 0.01 });
    });
  }
});
