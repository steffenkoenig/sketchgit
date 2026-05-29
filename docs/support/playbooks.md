# Support Playbook Updates

## Handling Font Rendering Issues (GAP-016)
With the transition to self-hosted fonts via Next.js (`next/font/google`), if users report that fonts are falling back to default system fonts (like sans-serif or monospace):
1. **Verify Asset Loading:** Ask the user to check their browser network tab for failed requests to `.woff2` font files.
2. **Cache/Proxy:** Ensure that no aggressive caching or corporate proxies are blocking local assets from the SketchGit domain.
3. **No External Dependencies:** Inform the user that they do not need to allow access to `fonts.googleapis.com`.

## CI Pipeline Failures - License Checks (P089)
If a developer reports that their Pull Request is failing the "License compliance check" step:
1. **Identify the Dependency:** Have the developer review the GitHub Actions log to identify which new or updated package is failing the check.
2. **Check Policy:** Refer them to `reports/license-policy.md`.
3. **Resolution:** The developer must either switch to an alternative package with an allowed license, or request an exception (which requires a PR to update the policy and the `check-licenses.mjs` script).
