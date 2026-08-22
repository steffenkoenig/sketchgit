/**
 * P087 – Visual regression: toolbar appearance, light and dark theme.
 */
import { test, expect } from "@playwright/test";

test.describe("Visual – toolbar", () => {
  for (const theme of ["dark", "light"] as const) {
    test(`toolbar default (${theme})`, async ({ page }) => {
      await page.goto("/");
      if (theme === "light") {
        await page.evaluate(() => {
          document.cookie = "THEME=light; path=/";
        });
        await page.reload();
      }
      const toolbar = page.getByRole("toolbar").first();
      await expect(toolbar).toBeVisible({ timeout: 10_000 });
      await expect(toolbar).toHaveScreenshot(`toolbar-default-${theme}.png`, { maxDiffPixelRatio: 0.01 });
    });
  }
});
