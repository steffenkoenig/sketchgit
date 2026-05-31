import { test, expect } from '@playwright/test';

test.describe('Object Grouping & Alignment', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Some basic setup for local e2e if there are dialogs.
    const onboardingBtn = page.locator('button:has-text("Get Started")');
    if (await onboardingBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await onboardingBtn.click();
    }
  });

  test('can group, align, and ungroup objects', async ({ page }) => {
    // 1. Draw a rectangle
    await page.click('button[title="Rectangle (R)"]');
    const canvas = page.locator('canvas').first();
    await canvas.dragTo(canvas, {
      sourcePosition: { x: 100, y: 100 },
      targetPosition: { x: 200, y: 200 },
    });

    // 2. Draw a circle
    await page.click('button[title="Ellipse (E)"]');
    await canvas.dragTo(canvas, {
      sourcePosition: { x: 300, y: 300 },
      targetPosition: { x: 400, y: 400 },
    });

    // 3. Switch to select tool
    await page.click('button[title="Select (V)"]');

    // 4. Box select both
    await canvas.dragTo(canvas, {
      sourcePosition: { x: 50, y: 50 },
      targetPosition: { x: 450, y: 450 },
    });

    // We should see grouping actions in Properties panel
    await expect(page.locator('button:has-text("Group")').first()).toBeVisible({ timeout: 5000 });

    // 5. Group them
    await page.click('button:has-text("Group")');

    // Now it should show Ungroup
    await expect(page.locator('button:has-text("Ungroup")').first()).toBeVisible({ timeout: 5000 });

    // 6. Test Align Left
    // Align left applies inside the active selection or group
    await page.click('button[title="Align Left"]');
    await page.waitForTimeout(100);

    // 7. Ungroup them
    await page.click('button:has-text("Ungroup")');
    await expect(page.locator('button:has-text("Group")').first()).toBeVisible({ timeout: 5000 });
  });
});
