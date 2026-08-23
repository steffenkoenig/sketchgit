/**
 * P096 – E2E test: canvas minimap / radar view.
 */
import { test, expect } from '@playwright/test';

test.describe('Minimap – navigation overview', () => {
  test('shows content once something is drawn, and clicking it pans the main canvas', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10_000 });

    // Draw a rectangle so the minimap has content to show.
    await page.locator('#trect').click();
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 200, box.y + 180);
      await page.mouse.up();
    }

    const minimap = page.getByTestId('minimap-surface');
    await expect(minimap).toBeVisible();

    // The content indicator only renders once getMinimapData() reports a
    // non-null worldBounds — confirms the poll loop picked up the new object.
    await expect(page.getByTestId('minimap-content')).toBeVisible({ timeout: 3_000 });

    const viewportIndicator = page.getByTestId('minimap-viewport');
    await expect(viewportIndicator).toBeVisible();
    const before = await viewportIndicator.boundingBox();

    // Click a corner of the minimap far from the current viewport indicator
    // to pan the main canvas there.
    const minimapBox = await minimap.boundingBox();
    if (minimapBox) {
      await page.mouse.click(minimapBox.x + minimapBox.width - 5, minimapBox.y + minimapBox.height - 5);
    }

    await page.waitForTimeout(400); // one poll cycle (200ms) plus margin
    const after = await viewportIndicator.boundingBox();

    expect(before).toBeTruthy();
    expect(after).toBeTruthy();
    if (before && after) {
      const moved = Math.abs(before.x - after.x) > 1 || Math.abs(before.y - after.y) > 1;
      expect(moved).toBe(true);
    }

    // The app did not crash — canvas and toolbar are still usable.
    await expect(canvas).toBeVisible();
  });

  test('the "n" keyboard shortcut and the hide button both toggle minimap visibility', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10_000 });

    const minimap = page.getByTestId('minimap-surface');
    await expect(minimap).toBeVisible();

    // Select tool first so 'n' isn't captured by an unrelated shortcut, then
    // click empty canvas space to ensure focus isn't inside a text input.
    await page.locator('#tselect').click();
    await page.keyboard.press('n');
    await expect(minimap).toBeHidden();

    const showButton = page.getByRole('button', { name: /show minimap/i });
    await expect(showButton).toBeVisible();
    await showButton.click();
    await expect(minimap).toBeVisible();

    const hideButton = page.getByRole('button', { name: /hide minimap/i });
    await hideButton.click();
    await expect(minimap).toBeHidden();

    await page.keyboard.press('n');
    await expect(minimap).toBeVisible();
  });
});
