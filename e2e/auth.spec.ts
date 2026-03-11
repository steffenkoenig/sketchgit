/**
 * P038 – E2E test: User registration, sign-in, and dashboard access.
 */
import { test, expect } from '@playwright/test';

test.describe('Authentication flow', () => {
  test('user can register and see the home page', async ({ page }) => {
    const email = `e2e+${Date.now()}@example.com`;

    await page.goto('/auth/register');
    await expect(page.getByRole('heading', { name: /create account|register|sign up/i })).toBeVisible({ timeout: 10_000 });

    await page.getByLabel(/name/i).fill('E2E User');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill('E2EPassword123!');
    await page.getByRole('button', { name: /create|register|sign up/i }).click();

    // After registration we should land on the home or dashboard page
    await expect(page).toHaveURL(/\/(dashboard)?$/, { timeout: 10_000 });
  });

  test('sign-in page is reachable', async ({ page }) => {
    await page.goto('/auth/signin');
    await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeVisible({ timeout: 10_000 });
  });

  test('dashboard redirects unauthenticated users to sign-in', async ({ page }) => {
    await page.goto('/dashboard');
    // Should either redirect to sign-in or show sign-in prompts
    await expect(
      page.getByRole('link', { name: /sign in/i }).or(page.getByRole('button', { name: /sign in/i }))
    ).toBeVisible({ timeout: 10_000 });
  });
});
