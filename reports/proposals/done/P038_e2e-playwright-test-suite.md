# P038 – End-to-End Test Suite with Playwright

## Title
Add a Playwright End-to-End Test Suite Covering Critical User Journeys

## Brief Summary
The existing test suite (Vitest) covers library-level logic — git model operations, merge engine, canvas helpers, and API route handlers — but has zero coverage of real browser interactions. No automated test exercises the full stack: a user opening the app, drawing on the canvas, committing, creating a branch, merging, or navigating the dashboard. Regressions in UI wiring, Next.js routing, WebSocket handshake, or Prisma integration are only caught in production. Adding a Playwright suite for the five most critical user journeys provides a fast feedback loop for these end-to-end paths with minimal ongoing maintenance overhead.

## Current Situation
CI pipeline (`.github/workflows/ci.yml`) runs:
1. Lint → type check → migrations → unit tests → coverage → `npm run build`

There is no `e2e` step. The repository has no `playwright.config.ts`, no `e2e/` directory, and no E2E npm scripts. The Vitest coverage threshold (70%) applies only to library code and excludes the entire UI layer (`components/`, `app/` pages), the WebSocket server, and any real-browser behaviour.

## Problem with Current Situation
1. **Invisible regressions in UI wiring**: The five React coordinator callbacks, toolbar button handlers, and modal interactions are never automatically tested. A wrong prop name or missing `onClick` handler silently breaks user flows.
2. **WebSocket handshake untested**: No test verifies that the custom `server.ts` starts, accepts a WebSocket upgrade, exchanges `welcome` + `fullsync`, and cleanly shuts down.
3. **Authentication flows untested**: Register, sign-in, session persistence, and dashboard redirect are only tested via unit stubs of `verifyCredentials`. Real browser cookie handling and NextAuth redirects are never exercised.
4. **Merge workflow fragile**: The three-way merge UI — conflict modal, property chooser, apply button — is the most complex UI flow and the hardest to keep working without end-to-end verification.
5. **No regression gate before merging**: Developers must manually test every PR for UI breakage, leading to review fatigue and inconsistent standards.

## Goal to Achieve
1. Install Playwright as a devDependency and add a `test:e2e` npm script.
2. Implement five E2E test scenarios covering the core user journeys.
3. Add an `e2e` job to the CI workflow that runs against a started server + test database.
4. Keep E2E tests fast (< 2 minutes total) by targeting critical paths only, not exhaustive coverage.
5. Provide a clear scaffolding pattern so additional E2E tests can be added with minimal friction.

## What Needs to Be Done

### 1. Install Playwright
```bash
npm install --save-dev @playwright/test
npx playwright install chromium --with-deps
```

### 2. Create `playwright.config.ts`
```typescript
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
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
```

### 3. Implement five E2E scenarios in `e2e/`

#### `e2e/canvas.spec.ts` – Anonymous user draws and commits
```typescript
test('anonymous user can draw and create a commit', async ({ page }) => {
  await page.goto('/');
  // Select the pen tool
  await page.getByRole('button', { name: /pen/i }).click();
  // Draw a stroke on the canvas.
  // The canvas element should carry a `data-testid="main-canvas"` attribute
  // (add this to the <canvas> element in SketchGitApp as part of this proposal
  // to avoid depending on the internal Fabric.js element ID `#c`).
  const canvas = page.getByTestId('main-canvas');
  await canvas.hover();
  await page.mouse.down();
  await page.mouse.move(100, 100);
  await page.mouse.up();
  // Commit
  await page.getByRole('button', { name: /commit/i }).click();
  await page.getByRole('textbox', { name: /message/i }).fill('First stroke');
  await page.getByRole('button', { name: /save commit/i }).click();
  await expect(page.getByText('First stroke')).toBeVisible();
});
```

#### `e2e/auth.spec.ts` – Register, sign in, dashboard
```typescript
test('user can register, sign in, and see dashboard', async ({ page }) => {
  const email = `test+${Date.now()}@example.com`;
  await page.goto('/auth/register');
  await page.fill('input[type="text"]', 'Test User');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/');
  await page.goto('/dashboard');
  await expect(page.getByText('Your Drawings')).toBeVisible();
});
```

#### `e2e/branches.spec.ts` – Create branch, commit on it
```typescript
test('user can create a branch and commit to it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /new branch/i }).click();
  await page.fill('input[name="branchName"]', 'feature/test');
  await page.getByRole('button', { name: /create/i }).click();
  await expect(page.getByText('feature/test')).toBeVisible();
});
```

#### `e2e/timeline.spec.ts` – Timeline renders commits
```typescript
test('timeline displays commits after drawing', async ({ page }) => {
  await page.goto('/');
  // Commit initial state
  await page.getByRole('button', { name: /commit/i }).click();
  await page.fill('[name=message]', 'Initial');
  await page.getByRole('button', { name: /save/i }).click();
  await page.getByRole('button', { name: /timeline/i }).click();
  await expect(page.locator('svg').first()).toBeVisible();
});
```

#### `e2e/collab.spec.ts` – Two tabs collaborate in same room
```typescript
test('two pages in the same room receive each other's presence', async ({ browser }) => {
  const page1 = await browser.newPage();
  const page2 = await browser.newPage();
  await page1.goto('/?room=e2e-test-room');
  await page2.goto('/?room=e2e-test-room');
  // Both pages should eventually show 2 collaborators
  await expect(page1.locator('[data-testid="collab-count"]')).toHaveText('2', { timeout: 5000 });
  await page1.close();
  await page2.close();
});
```

### 4. Add `e2e` CI job to `.github/workflows/ci.yml`
```yaml
e2e:
  name: End-to-end tests
  runs-on: ubuntu-latest
  needs: ci
  services:
    postgres:
      image: postgres:16-alpine
      env:
        POSTGRES_USER: postgres
        POSTGRES_PASSWORD: postgres
        POSTGRES_DB: sketchgit_e2e
      ports:
        - 5433:5432
      options: >-
        --health-cmd "pg_isready -U postgres"
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
  env:
    DATABASE_URL: postgresql://postgres:postgres@localhost:5433/sketchgit_e2e
    AUTH_SECRET: e2e-test-secret-padding-32chars!!
    NEXTAUTH_URL: http://localhost:3000
    E2E_BASE_URL: http://localhost:3000
  steps:
    - uses: actions/checkout@v6
    - uses: actions/setup-node@v6
      with: { node-version: 22, cache: npm }
    - run: npm ci
    - run: npx playwright install chromium --with-deps
    - run: npx prisma migrate deploy
    - run: npm run test:e2e
    - uses: actions/upload-artifact@v7
      if: failure()
      with:
        name: playwright-report
        path: playwright-report/
```

### 5. Add npm scripts in `package.json`
```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

## Components Affected
| Component | Change |
|-----------|--------|
| `playwright.config.ts` | **New file** – Playwright configuration |
| `e2e/canvas.spec.ts` | **New file** – draw + commit test |
| `e2e/auth.spec.ts` | **New file** – register + sign-in + dashboard test |
| `e2e/branches.spec.ts` | **New file** – branch creation test |
| `e2e/timeline.spec.ts` | **New file** – timeline visibility test |
| `e2e/collab.spec.ts` | **New file** – two-tab collaboration test |
| `.github/workflows/ci.yml` | Add `e2e` job (depends on `ci`) |
| `package.json` | Add `test:e2e` and `test:e2e:ui` scripts |
| `.gitignore` | Ignore `playwright-report/`, `test-results/` |

## Data & Database Model
E2E tests use a separate `sketchgit_e2e` database. Test accounts are created with unique timestamps to prevent collision. All data is transient (tests do not clean up; the DB is recreated on each CI run).

## Testing Requirements
All E2E tests are themselves the new tests. Success criteria:
- `test:e2e` passes in CI in < 2 minutes (5 scenarios × ~20 seconds each).
- No flaky tests: retries configured to 2 in CI; tests use `await expect().toBeVisible({ timeout: 5000 })` rather than fixed sleeps.
- Playwright HTML report uploaded as a CI artifact on failure for debugging.

## Linting and Type Requirements
- `playwright.config.ts` is excluded from the main `tsconfig.json` (separate `tsconfig.e2e.json` with `lib: ["dom", "es2022"]`).
- E2E test files are excluded from Vitest's `include` pattern (`lib/**/*.test.ts`) to prevent conflicts.
- No ESLint rules applied to `e2e/**` (different testing idioms).

## Dependency Map
- Depends on: P016 ✅ (CI/CD pipeline exists to extend), P007 ✅ (auth flows exist), P023 ✅ (health endpoint usable as readiness signal in webServer config)
- Complements: P028 ✅ (unit coverage); P038 closes the UI-layer gap that Vitest cannot cover
- Benefits from: P025 ✅ (ARIA labels make Playwright `getByRole()` selectors stable)
