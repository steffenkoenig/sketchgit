/**
 * P092 – E2E test: offline mode status badge.
 *
 * Uses Playwright's `context.setOffline()`, which simulates a real network
 * outage (fires the browser's native `online`/`offline` events, the same
 * signal networkStatus.ts listens for) rather than mocking navigator.onLine.
 *
 * Scope note: this only covers the badge's online/offline reactivity, not
 * the full draw-while-offline → reconnect → sync round trip. That full
 * cycle requires `_postEvent`'s pre-existing `wsClientId` guard to be set,
 * which only happens once the WebSocket welcome handshake completes — and
 * WS connections from Playwright/Chromium do not reliably complete in this
 * sandbox (documented during the P091 investigation this same session: raw
 * WS/TCP clients connect fine, but Chromium via Playwright/CDP does not,
 * most likely a localhost dual-stack quirk specific to this environment).
 * The draw/commit queueing and replay logic itself is covered by
 * lib/sketchgit/realtime/collaborationManager.test.ts's P092 suite (mocked
 * fetch + real fake-indexeddb), which does not depend on a live WS
 * connection and passes deterministically.
 */
import { test, expect } from '@playwright/test';

test.describe('Offline mode badge (P092)', () => {
  test('badge is not shown while online with nothing queued', async ({ page }) => {
    const roomId = `e2e-offline-badge-${Date.now()}`;
    await page.goto(`/?room=${roomId}`);
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1_000);
    await expect(page.locator('#offlineBadge')).toHaveCount(0);
  });

  test('badge appears with an accessible offline announcement when the network drops, and clears on reconnect', async ({ page, context }) => {
    const roomId = `e2e-offline-badge-${Date.now()}`;
    await page.goto(`/?room=${roomId}`);
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1_000);

    await context.setOffline(true);

    const badge = page.locator('#offlineBadge');
    await expect(badge).toBeVisible({ timeout: 5_000 });
    await expect(badge).toHaveText(/offline/i);
    // role="status" (not just color) so screen readers announce the change.
    await expect(badge).toHaveAttribute('role', 'status');

    await context.setOffline(false);
    // No queued actions to sync in this scenario, so the badge should clear
    // as soon as the online event fires (no lingering "syncing…" state).
    await expect(badge).not.toBeVisible({ timeout: 5_000 });
  });
});
