# Changelog

All notable changes to SketchGit are documented in this file.

This changelog is maintained automatically by [Release Please](https://github.com/googleapis/release-please).
Once this release automation is active, every `feat:`, `fix:`, `perf:`, and `refactor:` commit merged to `main` will
automatically appear here when the next Release Please PR is merged.

## [1.0.0] – Initial Release

### Features

- **P001** – Decomposed monolithic canvas engine into `lib/sketchgit/` module hierarchy
- **P002** – Automated test suite with Vitest; merge engine + git model independently unit-testable
- **P003** – PostgreSQL persistence via Prisma 6 with server-authoritative fullsync
- **P004** – WebSocket exponential-backoff reconnection with heartbeat
- **P005** – TypeScript strict mode across all new module files
- **P006** – Real-time collaboration throughput optimisation (draw-delta protocol)
- **P007** – Anonymous-first authentication (NextAuth v5); optional account creation
- **P008** – Replaced `innerHTML` with safe DOM manipulation to eliminate XSS risk
- **P009** – Internationalisation (i18n) foundation with `next-intl`
- **P010** – Structured error observability with Pino logging
- **P011** – Database performance: JSONB canvas column, 4 covering indices, paginated queries
- **P012** – Horizontal scalability via Redis pub/sub for multi-instance presence
- **P013** – Migrated custom server from JavaScript to TypeScript (`server.ts`)
- **P014** – Input validation with Zod schemas; shared `validate()` helper
- **P015** – Rate limiting (per-IP WebSocket + auth route limits)
- **P016** – CI/CD pipeline (lint, type-check, test, coverage, build, Docker, Dependabot)
- **P017** – Decomposed `app.ts` orchestrator into 5 coordinator modules
- **P018** – Replaced CDN Fabric.js with npm package (`import { fabric }`)
- **P019** – Security headers and CSRF protection (CSP, `X-Frame-Options`, Origin validation)
- **P020** – Memory leak prevention (`destroy()` in CanvasEngine, CollabManager; `useEffect` cleanup)
- **P021** – React performance optimisations (`useCallback`, `React.memo`, `useMemo`)
- **P022** – Canvas rendering performance (`requestRenderAll`, Polyline in-place update)
- **P023** – Health check endpoints (`/api/health`, `/api/ready`) and graceful SIGTERM shutdown
- **P024** – Timeline virtualisation (`getVisibleCommits()` for scroll-based DOM culling)
- **P025** – Accessibility: ARIA roles, keyboard navigation, focus trap in modals, skip link
- **P026** – Dockerfile multi-stage build, `.dockerignore`, `.nvmrc`, `docker-compose` service
- **P027** – Environment variable validation at startup via `lib/env.ts`
- **P028** – Expanded test coverage for API routes and coordinators
- **P029** – Paginated commit history API with cursor-based pagination
- **P030** – LRU in-memory room snapshot cache (`lru-cache`)
- **P031** – WebSocket message validation with Zod (`InboundWsMessageSchema`)
- **P032** – Automated room pruning job (configurable inactive-room retention)
- **P033** – Delta-based canvas storage (DELTA/SNAPSHOT storage types, delta replay)
- **P034** – Room access control (ClientRole, per-role write permissions)
- **P035** – Cross-instance presence via Redis Hash
- **P036** – Client-side logging abstraction (`lib/sketchgit/logger.ts`, ESLint `no-console`)
- **P037** – Undo/redo stack in CanvasEngine (Ctrl+Z / Ctrl+Y with broadcast)
- **P038** – Playwright E2E test suite (5 scenarios, CI integration)
- **P039** – Canvas export REST API (PNG + SVG via Fabric.js headless renderer)
- **P040** – Password reset flow (forgot-password / reset-password endpoints + UI)
- **P041** – GDPR account deletion (DELETE `/api/auth/account`, password re-confirmation)
- **P043** – Graceful shutdown drain window for in-flight DB writes
- **P045** – Docker image SHA256 digest pinning + Trivy vulnerability scanning in CI
- **P046** – Redis-backed rate limiter for multi-instance correctness
- **P047** – Branch name and commit message sanitisation (length limits, safe characters)
- **P048** – Server-authoritative canvas fullsync on WebSocket connect
- **P049** – Room slug management API (`PATCH /api/rooms/[roomId]`)
- **P050** – Wired `next-intl` i18n message catalogue (EN + DE, `LocaleSwitcher`)
- **P051** – Cancelled room cleanup timers on graceful shutdown
- **P052** – Broadcast merge commits to peers and persist to DB
- **P053** – Broadcast branch rollback and branch-switch operations to peers
- **P055** – Replaced `window.confirm()` with accessible in-app confirmation modal
- **P056** – Nonce-based CSP (removed `'unsafe-inline'` from `script-src`/`style-src`)
- **P057** – Commit SHA format and canvas payload size validation before DB persistence
- **P063** – GitHub Copilot custom instructions (`.github/copilot-instructions.md`)
- **P064** – Conventional Commits enforcement (commitlint + husky) and release-please automation
- **P068** – Structured API error codes (`ApiErrorCode`, `apiError()` helper, i18n keys)
- **P069** – Configurable room capacity limit (`MAX_CLIENTS_PER_ROOM`, `ROOM_FULL` error)
- **P070** – `Cache-Control: immutable` headers for SHA-addressed API responses + `ETag`/`304`
- **P071** – Prisma slow-query logging (`SLOW_QUERY_MS`, `LOG_QUERIES` env vars)
- **P072** – `security.txt`, `robots.txt`, `/.well-known/change-password` route, `SECURITY.md`
- **P077** – Shared Vitest test factories (`lib/test/factories.ts`, `lib/test/wsFactories.ts`)
