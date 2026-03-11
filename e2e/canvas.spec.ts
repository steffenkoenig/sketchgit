/**
 * P038 – E2E test: Anonymous user draws on the canvas and creates a commit.
 */
import { test, expect } from '@playwright/test';

test.describe('Canvas – draw and commit', () => {
  test('anonymous user can draw and create a commit', async ({ page }) => {
    await page.goto('/');
    // Wait for the app to be ready (canvas visible)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10_000 });

    // Select the pen tool
    const penBtn = page.getByRole('button', { name: /pen/i });
    await penBtn.click();

    // Draw a stroke on the canvas
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 3, box.y + box.height / 3);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.up();
    }

    // Open the commit modal
    const commitBtn = page.getByRole('button', { name: /commit/i }).first();
    await commitBtn.click();

    // Fill in the commit message
    const msgInput = page.getByRole('textbox').first();
    await msgInput.fill('E2E first stroke');

    // Submit the commit
    const saveBtn = page.getByRole('button', { name: /save|commit/i }).last();
    await saveBtn.click();

    // Wait a moment for the commit to be processed
    await page.waitForTimeout(1_000);
    // Verify the toolbar is still visible (app did not crash)
    await expect(page.locator('canvas').first()).toBeVisible();
  });
});
