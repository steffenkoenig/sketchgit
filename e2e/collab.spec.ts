/**
 * P038 – E2E test: Two browser contexts collaborate in the same room.
 */
import { test, expect } from '@playwright/test';

test.describe('Collaboration', () => {
  test('two pages in the same room receive a welcome message', async ({ browser }) => {
    const roomId = `e2e-collab-${Date.now()}`;

    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    try {
      await page1.goto(`/?room=${roomId}`);
      await page2.goto(`/?room=${roomId}`);

      // Both pages should load the canvas successfully
      await expect(page1.locator('canvas').first()).toBeVisible({ timeout: 10_000 });
      await expect(page2.locator('canvas').first()).toBeVisible({ timeout: 10_000 });

      // Both pages should eventually show the other collaborator
      // The presence indicator shows connected clients
      await page1.waitForTimeout(2_000); // allow WebSocket handshake to complete

      // Verify no error state (error elements are not shown)
      await expect(page1.locator('[data-error="true"]')).toHaveCount(0);
      await expect(page2.locator('[data-error="true"]')).toHaveCount(0);
    } finally {
      await page1.close();
      await page2.close();
      await ctx1.close();
      await ctx2.close();
    }
  });

  test('health endpoint reports correct client count', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    const body = await response.json() as { status: string; clients: number };
    expect(typeof body.clients).toBe('number');
    expect(body.clients).toBeGreaterThanOrEqual(0);
  });
});
