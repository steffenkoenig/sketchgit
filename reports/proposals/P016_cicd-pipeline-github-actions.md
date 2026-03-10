# P016 – CI/CD Pipeline with GitHub Actions

## Title
Add a Continuous Integration and Continuous Deployment Pipeline Using GitHub Actions

## Brief Summary
The repository has no automated pipeline to verify that code is correct before it is merged or deployed. Tests, linting, and the TypeScript build all run only when a developer remembers to run them locally. Adding a GitHub Actions CI pipeline enforces quality gates on every pull request and main-branch push, and a CD workflow automates deployment so releases are repeatable and low-risk.

## Current Situation
The repository includes a full test suite (`vitest`), a linter (`eslint`), and TypeScript compilation (`tsc`), all configured and ready to use. However, none of these are executed automatically on push or pull request. The only build-related commands are in `package.json`:

```json
"scripts": {
  "dev":    "node server.mjs",
  "build":  "next build",
  "start":  "node server.mjs",
  "test":   "vitest run",
  "test:coverage": "vitest run --coverage",
  "lint":   "eslint ."
}
```

There is no `.github/workflows/` directory. Developers must manually run `npm test` and `npm run lint` before pushing. There is no mechanism to block a merge if tests are failing, linting errors are present, or the TypeScript build fails.

## Problem with Current Situation
1. **No merge protection**: A broken commit can be merged to the main branch without any automated checks, potentially breaking the application for all users.
2. **Human error**: Developers forget to run tests or lint locally, especially for "quick" changes.
3. **No coverage enforcement**: The 70% coverage threshold defined in `vitest.config.ts` is only meaningful if the coverage check runs in CI. It currently does not.
4. **Manual deployments**: Deploying a new version requires someone to manually run `npm run build` and restart the server, which is error-prone and not documented.
5. **No build artifact verification**: The Next.js production build (`next build`) is never run automatically. Build errors (missing environment variables, type errors in pages, etc.) are discovered only at deployment time.
6. **No status badges**: README lacks CI status badges, so the health of the main branch is not visible at a glance.

## Goal to Achieve
1. Run tests, lint, and TypeScript build automatically on every push and pull request.
2. Block merging of a pull request if any CI check fails.
3. Enforce the 70% code coverage threshold in CI.
4. Automate production deployment triggered by a push to `main` (or a tagged release).
5. Cache `node_modules` in CI to keep pipeline execution time under 3 minutes.

## What Needs to Be Done

### 1. Create the CI workflow

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: sketchgit_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/sketchgit_test
      AUTH_SECRET: ci-test-secret-do-not-use-in-production
      NEXTAUTH_URL: http://localhost:3000

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run database migrations
        run: npx prisma migrate deploy

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npx tsc --noEmit

      - name: Run tests with coverage
        run: npm run test:coverage

      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-report
          path: coverage/

      - name: Build Next.js
        run: npm run build
```

### 2. Create the CD workflow (optional, deploy-on-tag)

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy

on:
  push:
    tags: ['v*']

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      - run: npm run build

      # Deployment step depends on hosting provider:
      # For Railway/Render: trigger deploy webhook
      # For a VPS: use SSH action to pull and restart
      - name: Deploy to production
        run: |
          curl -X POST "${{ secrets.DEPLOY_WEBHOOK_URL }}"
```

### 3. Add branch protection rules
In the GitHub repository settings:
- Require all CI checks to pass before merging.
- Require at least one approving review for PRs targeting `main`.
- Prevent force-pushes to `main`.

### 4. Add CI status badge to README
```markdown
[![CI](https://github.com/steffenkoenig/sketchgit/actions/workflows/ci.yml/badge.svg)](https://github.com/steffenkoenig/sketchgit/actions/workflows/ci.yml)
```

### 5. Cache dependencies for faster builds
The `cache: npm` option in `actions/setup-node` automatically caches the `~/.npm` directory. For Prisma's generated client, add:
```yaml
- name: Cache Prisma client
  uses: actions/cache@v4
  with:
    path: node_modules/.prisma
    key: prisma-${{ hashFiles('prisma/schema.prisma') }}
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `.github/workflows/ci.yml` | New file: lint, type check, tests, build on every push/PR |
| `.github/workflows/deploy.yml` | New file: automated deploy on tag push |
| `README.md` | Add CI status badge |
| GitHub repository settings | Enable branch protection requiring CI checks to pass |

## Additional Considerations

### Test environment variables
The CI workflow must not use real production credentials. All secrets required by the application must be either provided as GitHub Actions secrets (for production CD) or replaced with safe test values (for CI). A `.env.test` file or GitHub Actions `env:` block should cover all `process.env` references.

### Prisma migrations in CI
The `prisma migrate deploy` command applies pending migrations to the test database. This ensures that the CI database schema always matches the current `schema.prisma`, catching any migration that is missing or incorrect.

### Parallelism
Lint, type check, and tests can be split into parallel jobs to further reduce wall-clock time. With caching, each job takes 30–60 seconds, and running them in parallel brings total CI time under 2 minutes.

### Dependabot
Alongside the CI pipeline, enable Dependabot in `.github/dependabot.yml` to keep npm dependencies up to date automatically:
```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
```
Dependabot PRs will automatically be checked by the CI workflow before merging.
