import { test, expect } from '@playwright/test';

test.describe('Grouping and Alignment', () => {
  test('user can group, align, and ungroup objects', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10_000 });

    // Draw first rectangle
    const rectBtn = page.getByRole('button', { name: /Rectangle/i });
    await rectBtn.click();
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) return;
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.up();

    // Draw second rectangle
    await rectBtn.click();
    await page.mouse.move(box.x + 150, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 100);
    await page.mouse.up();

    // Select both objects using Shift+Click (we'll just draw a selection box)
    const selectBtn = page.getByRole('button', { name: /Select/i });
    await selectBtn.click();
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 210, box.y + 110);
    await page.mouse.up();

    // Grouping
    await page.keyboard.press('Control+g');

    // Alignment Properties panel should be visible
    const alignSection = page.locator('#pp-align-section');
    await expect(alignSection).toBeVisible();

    // Ungrouping
    await page.keyboard.press('Control+Shift+G');

    // Select just one
    await page.mouse.move(box.x + 75, box.y + 75);
    await page.mouse.click(box.x + 75, box.y + 75);

    // Alignment Properties panel should NOT be visible for single rect
    await expect(alignSection).toBeHidden();
  });
});
