/**
 * P087 – Visual regression: auth pages.
 */
import { test, expect } from "@playwright/test";

test.describe("Visual – auth pages", () => {
  test("sign-in page", async ({ page }) => {
    await page.goto("/auth/signin");
    await expect(page.getByRole("button", { name: /sign in|log in/i })).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveScreenshot("auth-signin.png", { maxDiffPixelRatio: 0.01, fullPage: true });
  });

  test("register page", async ({ page }) => {
    await page.goto("/auth/register");
    await expect(page.getByRole("heading", { name: /create.*account|register|sign up/i })).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveScreenshot("auth-register.png", { maxDiffPixelRatio: 0.01, fullPage: true });
  });
});
