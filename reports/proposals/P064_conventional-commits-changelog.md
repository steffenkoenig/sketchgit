# P064 – Conventional Commits and Automated CHANGELOG

## Title
Enforce Conventional Commit Message Format with Commitlint and Automate CHANGELOG Generation with Release Please

## Brief Summary
The repository currently has no enforced commit message format, making it impossible to automatically determine what changed between releases, generate meaningful release notes, or trigger semantic version bumps. Adding `commitlint` (with a `commit-msg` git hook via `husky`) enforces the Conventional Commits specification, and adding `release-please` (Google's automated release PR action) generates a CHANGELOG and bumps the `package.json` version automatically whenever commits are merged to `main`.

## Current Situation
`git log --oneline` of the repository shows mixed, unstructured commit messages:
- `"fix prisma migration"`
- `"update server"`
- `"add auth"`
- `"P057 done"`

There is no `CHANGELOG.md`. Version in `package.json` is `1.0.0` and has never been changed. The deploy workflow in `.github/workflows/deploy.yml` triggers on `v*` tags, but there is no automation to create those tags or populate release notes.

### Relevant files
```
package.json               ← version: "1.0.0", no commitlint/husky scripts
.github/workflows/ci.yml   ← no commit message linting
.github/workflows/deploy.yml ← deploys on v* tags; tags created manually
.gitignore                 ← no entry for .husky/
```

## Problem with Current Situation
1. **No release notes**: There is no CHANGELOG or release notes. Users and operators cannot determine what changed between deployed versions without reading raw git history.
2. **Manual versioning**: Version bumps in `package.json` are manual. There is no standard process for determining whether a change is a patch, minor, or major version increment.
3. **Inconsistent history**: Unstructured commit messages make it impossible to automate any downstream tooling (e.g., a bot that labels PRs by type, or a dashboard showing feature velocity vs. bug-fix rate).
4. **Missing context for future AI agents**: GitHub Copilot Coding Agent and similar tools benefit from structured commit history to understand the evolution of the codebase. Conventional Commits provides a machine-readable signal.
5. **No pre-commit quality gate for commit messages**: Developers can merge code with empty or misleading commit messages, reducing the quality of the audit trail.

## Goal to Achieve
1. Add `commitlint` with `@commitlint/config-conventional` to enforce the [Conventional Commits](https://www.conventionalcommits.org/) specification on every commit.
2. Add `husky` to install a `commit-msg` git hook so the check runs locally before a commit is accepted.
3. Add a CI step to validate commit message format on pull requests (catches messages that bypass the hook, e.g., commits pushed directly).
4. Add `release-please` as a GitHub Actions workflow so that whenever commits are merged to `main`, a "Release PR" is automatically created that bumps `package.json` version and updates `CHANGELOG.md`.
5. When the Release PR is merged, `release-please` creates a git tag (e.g., `v1.1.0`), which triggers the existing `deploy.yml` workflow.

## What Needs to Be Done

### 1. Install commitlint and husky
```bash
npm install --save-dev @commitlint/cli @commitlint/config-conventional husky
```

### 2. Create `commitlint.config.ts`
```typescript
export default { extends: ['@commitlint/config-conventional'] };
```
Allowed commit types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

### 3. Initialize husky
```bash
npx husky init
```
This creates `.husky/` and adds `npm run prepare` (which runs `husky`) to the `postinstall` lifecycle. Update `package.json`:
```json
"prepare": "husky"
```

### 4. Create `.husky/commit-msg` hook
```sh
#!/bin/sh
npx --no -- commitlint --edit "$1"
```

### 5. Add CI commit message lint step
In `.github/workflows/ci.yml`, add a step that lints the PR's commit messages:
```yaml
- name: Lint commit messages
  if: github.event_name == 'pull_request'
  run: npx commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }} --verbose
```

### 6. Create `release-please` configuration
Create `.github/release-please-config.json`:
```json
{
  "packages": {
    ".": {
      "release-type": "node",
      "changelog-sections": [
        { "type": "feat",     "section": "Features" },
        { "type": "fix",      "section": "Bug Fixes" },
        { "type": "perf",     "section": "Performance Improvements" },
        { "type": "refactor", "section": "Refactoring" },
        { "type": "docs",     "section": "Documentation" }
      ]
    }
  }
}
```

Create `.github/manifest.json`:
```json
{
  ".": "1.0.0"
}
```

### 7. Create `.github/workflows/release-please.yml`
```yaml
name: Release Please

on:
  push:
    branches: [main]

jobs:
  release-please:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          config-file: .github/release-please-config.json
          manifest-file: .github/manifest.json
```

### 8. Add `.husky/` to `.gitignore` exclusions
Husky's generated files should be committed (the hooks reference scripts via `npx`). Ensure `.husky/` is **not** in `.gitignore`.

### 9. Migrate existing commits (optional)
For the initial setup, create a `CHANGELOG.md` manually that summarizes all work done to date (P001–P057 proposals), then set the version to `1.0.0`. Going forward, `release-please` will maintain the file automatically.

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `package.json` | Add `commitlint`, `husky` devDependencies; add `prepare` script |
| `commitlint.config.ts` | New file: commitlint configuration |
| `.husky/commit-msg` | New file: git commit-msg hook |
| `.github/workflows/ci.yml` | Add commit message lint step |
| `.github/workflows/release-please.yml` | New file: release-please action |
| `.github/release-please-config.json` | New file: release-please configuration |
| `.github/manifest.json` | New file: current version manifest |
| `CHANGELOG.md` | New file: initial empty changelog (release-please maintains it) |

## Additional Considerations

### Breaking change detection
Conventional Commits specifies that `feat!:` or `BREAKING CHANGE:` in the commit footer triggers a major version bump. The current codebase has no public API consumers, so this is informational, but it establishes a clear signal for future breaking changes.

### Scope of commitlint
The `@commitlint/config-conventional` configuration requires `type(scope?): description`. Scopes are optional but encouraged for navigation (e.g., `feat(auth): add password reset`, `fix(ws): handle reconnect race condition`).

### Release-please and the deploy workflow
The existing `deploy.yml` triggers on `v*` tags. Release-please creates these tags automatically when the Release PR is merged. The integration requires no changes to `deploy.yml`.

### Editor integration
VS Code with the [Conventional Commits](https://marketplace.visualstudio.com/items?itemName=vivaxy.vscode-conventional-commits) extension provides an interactive commit message builder. Recommend adding to `.vscode/extensions.json` (if that file is added as part of P063 or separately).

### `SKIP_COMMIT_LINT` escape hatch
For automated commits (e.g., Dependabot, release-please itself), the `commit-msg` hook can be bypassed by setting `HUSKY=0` in the environment. Release-please and Dependabot PRs create their own commits that follow the Conventional Commits format automatically.

## Testing Requirements
- `npx commitlint --from HEAD~1 --to HEAD` passes for a commit with message `feat: add new feature`.
- `npx commitlint --from HEAD~1 --to HEAD` fails for a commit with message `update stuff`.
- CI commit lint step passes on a PR with conventional commits and fails on a PR without.
- `release-please` creates a Release PR with a populated `CHANGELOG.md` and a bumped version when a `feat:` commit is merged to `main`.
- The `.husky/commit-msg` hook blocks a commit with a non-conventional message in a local `git commit` invocation.

## Dependency Map
- Builds on: P016 ✅ (CI pipeline), P063 (Copilot instructions — references conventional commits)
- Independent of: database, Redis, auth, Next.js runtime
