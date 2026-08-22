import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  // P087 – snapshots must be generated in the same environment they're compared
  // against (font rendering / anti-aliasing differ across OS + GPU). Baselines
  // are generated inside mcr.microsoft.com/playwright:v1.61.0-noble — the same
  // image family CI's `npx playwright install --with-deps chromium` on
  // ubuntu-latest produces — never on a local macOS/Windows machine.
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: ['**/a11y/**', '**/visual/**'] },
    // P082 – accessibility audits (axe-core), run separately in CI so a
    // WCAG regression is reported distinctly from a functional E2E failure.
    { name: 'a11y', use: { ...devices['Desktop Chrome'] }, testDir: 'e2e/a11y' },
    // P087 – visual regression snapshots, run separately in CI.
    { name: 'visual', use: { ...devices['Desktop Chrome'] }, testDir: 'e2e/visual' },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/api/ready',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
