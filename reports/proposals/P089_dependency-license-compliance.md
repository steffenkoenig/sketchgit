# P089 – Dependency License Compliance Scanning

## Status
Not Started

## Dimensions
Maintainability · Compliance · Security

## Problem

SketchGit has approximately 50 direct npm dependencies and hundreds of transitive
ones. Each dependency carries a software license. Some licenses (GPL, AGPL, LGPL,
SSPL) impose obligations that may be incompatible with the project's intended
distribution model. Others (CC0, MIT, ISC, Apache-2.0) are permissive.

Currently:
- There is **no automated check** that scans dependency licenses during CI.
- A `npm install <new-package>` can silently introduce a copyleft dependency with
  no review gate.
- There is no **policy document** defining which licenses are acceptable.
- Dependabot (already configured) updates dependency versions but does not check
  license changes introduced by a version update.

This becomes a legal and compliance risk as the project gains users or if it is
ever commercialised or open-sourced.

## Proposed Solution

### 1. License audit tool: `license-checker-rseidelsohn`

Use the actively-maintained `license-checker-rseidelsohn` package to generate a
full dependency license report:

```
npx license-checker-rseidelsohn --production --json --out reports/licenses.json
```

The `--production` flag excludes `devDependencies` from the compliance check
(dev tools like Vitest do not need to comply with distribution-facing license rules).

### 2. Allowlist policy

Create `reports/license-policy.md` defining:

**Allowed licenses** (permissive / notice-only):
- MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, CC0-1.0, Unlicense, 0BSD

**Requires review** (may be acceptable with attribution):
- LGPL-2.0, LGPL-2.1, LGPL-3.0, MPL-2.0, CC-BY-4.0

**Blocked** (copyleft / incompatible):
- GPL-2.0, GPL-3.0, AGPL-3.0, SSPL-1.0, BUSL-1.1

**Unknown / unlicensed**:
- Any package with no license field → automatically blocked; requires manual review
  and explicit exception with a linked GitHub issue.

### 3. CI enforcement

Add a `license-check` step to the existing `ci` job in `.github/workflows/ci.yml`:

```yaml
- name: License compliance check
  run: |
    npx license-checker-rseidelsohn \
      --production \
      --excludePackages "package-name@version" \
      --failOn "GPL-2.0;GPL-3.0;AGPL-3.0;SSPL-1.0;BUSL-1.1" \
      --onlyAllow "MIT;ISC;BSD-2-Clause;BSD-3-Clause;Apache-2.0;CC0-1.0;Unlicense;0BSD;LGPL-2.1;MPL-2.0;Python-2.0;CC-BY-4.0"
```

The `--excludePackages` list holds explicitly reviewed exceptions. Each exception must
reference a GitHub issue number in a comment in the `license-policy.md` file.

The step **fails the CI build** if a blocked or unknown license is detected.

### 4. Generated report artifact

Upload `reports/licenses.json` as a CI artifact on every main-branch push. This gives
the project a current, auditable record of all dependency licenses.

### 5. Dependabot integration note

Update `.github/dependabot.yml` to add a comment instructing reviewers to check the
license if the PR changes a dependency to a different author (licensor can change
between versions in rare cases).

### 6. `scripts/check-licenses.mjs`

A lightweight Node.js helper script that wraps `license-checker-rseidelsohn` and
outputs a human-readable summary table, so developers can run it locally before
adding a new dependency:

```
node scripts/check-licenses.mjs
```

## Code Structure

```
scripts/
  check-licenses.mjs    ← local developer utility

reports/
  license-policy.md     ← allowlist, blocklist, exception register
  licenses.json         ← generated report (gitignored; uploaded as CI artifact)

.github/
  workflows/
    ci.yml              ← new license-check step in ci job
  dependabot.yml        ← updated with license review note
```

## Type Requirements

`scripts/check-licenses.mjs` is plain ES module JavaScript. No TypeScript types needed.
Add `scripts/` to `tsconfig.json` `exclude` array.

## Linting Requirements

Add `scripts/` to the ESLint `ignorePatterns` list (or add a minimal
`scripts/.eslintrc.json` with `"env": { "node": true, "es2022": true }`).

## Test Requirements

No Vitest unit tests are needed for the license checker itself (it is a third-party
tool). The CI step serves as the automated gate.

Write a documentation test in `lib/env.test.ts` that verifies `SKIP_LICENSE_CHECK`
(optional env var for local development iteration) is handled correctly by the
CI configuration.

## Database / Data Impact

No database changes.

## Repository Structure

- New `scripts/check-licenses.mjs`.
- New `reports/license-policy.md`.
- Add `reports/licenses.json` to `.gitignore` (generated file, uploaded as artifact).
- Update `ci.yml` with the license-check step.
- Update `dependabot.yml` with a review note.

## GitHub Copilot Agents and Skills

- A custom Copilot skill `check-dependency-license` can run the license check on a
  proposed package name before it is added: "Is lodash@4.17.21 safe to add?".
- Copilot Chat can reference `reports/license-policy.md` when answering questions
  about acceptable dependencies.
- The Coding Agent should run `node scripts/check-licenses.mjs` as part of any
  task that installs new npm packages.

## Implementation Order

1. Create `reports/license-policy.md`.
2. Run `npx license-checker-rseidelsohn --production --json` to audit current
   dependencies and identify any current violations.
3. Address any existing violations (update package, find alternative, or document
   exception).
4. Create `scripts/check-licenses.mjs`.
5. Add license-check step to `ci.yml`.
6. Add `reports/licenses.json` to `.gitignore`.
7. Update `dependabot.yml`.

## Effort Estimate
Small (0.5–1 day). The tooling is mature; the main work is the initial audit and
writing the policy document.

## Dependencies
- P016 ✅ (CI pipeline — license check step added here)
- P045 ✅ (Trivy scanning — Trivy scans for vulnerability CVEs; this proposal
  covers license compliance, a complementary but separate concern)
