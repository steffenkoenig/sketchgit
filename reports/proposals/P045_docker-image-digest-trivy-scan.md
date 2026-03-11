# P045 – Docker Image Digest Pinning and Trivy Security Scanning in CI

## Title
Pin Docker Base Images to SHA256 Digests and Add Trivy Vulnerability Scanning to the CI Pipeline

## Brief Summary
The `Dockerfile` uses floating image tags (`node:22-alpine`) without pinning to a specific image digest. Each `docker build` may silently pull a different image layer if upstream maintainers publish patches, making builds non-reproducible and potentially introducing untested changes. Additionally, neither the Docker image nor the npm dependency tree is scanned for known vulnerabilities in the CI pipeline. Adding digest pinning and Trivy scanning closes these gaps: the first ensures reproducible builds; the second provides automated detection of CVEs in the container image and its dependencies, consistent with supply-chain security best practices.

## Current Situation

### Dockerfile — floating tags
```dockerfile
# Stage 1
FROM node:22-alpine AS deps       # ← no digest

# Stage 2
FROM node:22-alpine AS builder    # ← no digest

# Stage 3
FROM node:22-alpine AS runner     # ← no digest
```
All three stages use the same mutable tag. A `docker build` on Monday and a `docker build` on Friday may produce different images even from the same `Dockerfile` if Node.js or Alpine patches are published in between.

### CI pipeline — no image scanning
`.github/workflows/ci.yml` builds the Next.js application and runs tests but does not:
- Build the Docker image (the `Dockerfile` is never exercised by CI).
- Scan the built image for CVEs.
- Scan `package-lock.json` for known vulnerable dependencies (beyond Dependabot's PR-based alerts).

Dependabot is configured (assumed from P016) and provides weekly PR-based dependency updates, but it does not scan the container image layers (e.g. `openssl` in `node:22-alpine`) or detect CVEs in transitive non-npm dependencies.

## Problem with Current Situation
1. **Non-reproducible builds**: Without a digest, two builds from the same `Dockerfile` may produce different images. Debugging a production issue becomes harder when the development and production images differ due to silently pulled upstream patches.
2. **Supply chain risk**: A compromised or malicious update to `node:22-alpine` (e.g. a typosquatting attack on Docker Hub, or a compromised layer in the upstream image) would be silently incorporated into every new production build.
3. **No CVE gate in CI**: The CI pipeline has no step that blocks a merge when a critical CVE is introduced in a new dependency. Vulnerabilities are only detected reactively (via Dependabot PRs) rather than proactively (at PR merge time).
4. **Docker build never verified in CI**: A broken `Dockerfile` (e.g. a missing `COPY` instruction after a file rename) would only be discovered on the first production deployment, not during code review.

## Goal to Achieve
1. Pin all three `FROM node:22-alpine` lines to a specific SHA256 digest.
2. Add a `docker-build` CI job that builds the production image on every PR to `main` to verify the `Dockerfile` remains functional.
3. Add a Trivy vulnerability scan CI job that scans the built image for `CRITICAL` and `HIGH` severity CVEs and fails the build when any are found.
4. Add a Trivy `fs` scan for npm dependency CVEs as a companion step (scans `package-lock.json` using the same database).
5. Establish a process for updating the pinned digest (monthly automated PR via Renovate or a workflow dispatch action).

## What Needs to Be Done

### 1. Pin Docker base image digest in `Dockerfile`
Find the current digest:
```bash
docker pull node:22-alpine
docker inspect node:22-alpine --format '{{index .RepoDigests 0}}'
# → node@sha256:<64-char-hex>
```

Update the `Dockerfile`:
```dockerfile
# ─── Stage 1: Install all dependencies ───────────────────────────────────────
FROM node:22-alpine@sha256:<CURRENT_DIGEST> AS deps

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine@sha256:<CURRENT_DIGEST> AS builder

# ─── Stage 3: Production runtime ─────────────────────────────────────────────
FROM node:22-alpine@sha256:<CURRENT_DIGEST> AS runner
```
All three stages reference the same digest so that the build is truly single-image.

### 2. Add `docker-build` job to `.github/workflows/ci.yml`
```yaml
docker-build:
  name: Verify Docker build
  runs-on: ubuntu-latest
  needs: ci
  steps:
    - uses: actions/checkout@v6
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3
    - name: Build Docker image (no push)
      uses: docker/build-push-action@v6
      with:
        context: .
        push: false
        tags: sketchgit:ci-${{ github.sha }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
        # Pass a dummy DATABASE_URL so Prisma generate doesn't error
        build-args: |
          DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy
```

### 3. Add Trivy image scan job
```yaml
trivy-scan:
  name: Container vulnerability scan
  runs-on: ubuntu-latest
  needs: docker-build
  steps:
    - uses: actions/checkout@v6
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3
    - name: Build image for scanning
      uses: docker/build-push-action@v6
      with:
        context: .
        push: false
        tags: sketchgit:scan
        load: true  # make image available to Trivy
    - name: Run Trivy vulnerability scan (image)
      uses: aquasecurity/trivy-action@master
      with:
        image-ref: sketchgit:scan
        format: table
        exit-code: '1'
        ignore-unfixed: true
        vuln-type: os,library
        severity: CRITICAL,HIGH
    - name: Run Trivy filesystem scan (npm deps)
      uses: aquasecurity/trivy-action@master
      with:
        scan-type: fs
        scan-ref: .
        format: sarif
        output: trivy-results.sarif
        severity: CRITICAL,HIGH
    - name: Upload Trivy SARIF results to GitHub Security
      uses: github/codeql-action/upload-sarif@v3
      if: always()
      with:
        sarif_file: trivy-results.sarif
```

Uploading the SARIF file to GitHub Security integrates Trivy findings with the repository's Security tab, providing a unified view of CVEs alongside CodeQL findings.

### 4. Establish a digest update process
Add a `.github/renovate.json` entry (or extend the existing one if P016 added Dependabot) to automatically open PRs when the `node:22-alpine` digest is updated:
```json
{
  "dockerfile": {
    "pinDigests": true
  }
}
```
Alternatively, add a monthly `workflow_dispatch` GitHub Actions workflow that runs `docker pull node:22-alpine && docker inspect …` and opens a PR if the digest has changed.

### 5. Document the pinning strategy in `Dockerfile`
Add a comment above each `FROM` line:
```dockerfile
# Pinned to digest for reproducible builds.
# To update: run `docker pull node:22-alpine && docker inspect node:22-alpine --format '{{index .RepoDigests 0}}'`
# Then update all three FROM lines and commit.
FROM node:22-alpine@sha256:<DIGEST> AS deps
```

## Components Affected
| Component | Change |
|-----------|--------|
| `Dockerfile` | Pin all three `FROM` lines to SHA256 digest |
| `.github/workflows/ci.yml` | Add `docker-build` and `trivy-scan` jobs |

## Data & Database Model
No data changes. This is a CI/CD and build infrastructure change.

## Testing Requirements
- CI: `docker-build` job succeeds when `Dockerfile` is valid.
- CI: `docker-build` job fails if a `COPY` or `RUN` command in `Dockerfile` errors.
- CI: `trivy-scan` job fails if a CRITICAL/HIGH CVE is detected in the image.
- Digest update: updated digest in `Dockerfile` passes CI without modification to application code.

## Linting and Type Requirements
No code changes. YAML syntax for the new CI jobs follows the existing `ci.yml` structure.

## Security Implications
This proposal directly addresses supply chain security. The primary risks mitigated:
- Reproducibility: SHA256 pinning ensures the exact same image layers are used in every build.
- CVE detection: Trivy will detect vulnerabilities in Alpine OS packages (e.g. `musl`, `openssl`) and npm packages. The SARIF upload surfaces these in the GitHub Security tab.
- Audit trail: CI logs record which image digest was used for every production build.

## Dependency Map
- Depends on: P016 ✅ (CI/CD pipeline exists), P026 ✅ (Dockerfile exists)
- Complements: P019 ✅ (security headers), P034 (access control); together they form a defence-in-depth posture
- Independent of all feature proposals — can be implemented immediately as a standalone PR
