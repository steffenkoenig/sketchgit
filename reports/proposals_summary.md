# Proposals Summary

This document lists all optimization proposals for the **SketchGit** application, grouped by integration state.

Each proposal is focused on one of three quality dimensions: **Performance**, **Reliability**, or **Maintainability** (many address more than one).

---

## Technology Decisions Recorded

| Proposal | Decision |
|----------|----------|
| P003 – Persistence Layer | **PostgreSQL + Prisma ORM** (schema-first, type-safe, migration-capable) |
| P007 – Auth & Authorization | **Option C** – Anonymous-first with optional account upgrade (NextAuth v5, Credentials + GitHub OAuth) |

---

## Proposals – Completed

| ID | Title | Dimension(s) | File |
|----|-------|--------------|------|
| P001 | Decompose the Monolithic Engine into Modules | Maintainability, Performance | [P001](proposals/done/P001_decompose-monolithic-engine.md) |
| P002 | Add an Automated Test Suite | Reliability, Maintainability | [P002](proposals/done/P002_add-automated-test-suite.md) |
| P003 | Add a Persistence Layer | Reliability | [P003](proposals/done/P003_add-persistence-layer.md) |
| P004 | WebSocket Reconnection & Connection Resilience | Reliability | [P004](proposals/done/P004_websocket-reconnection-resilience.md) |
| P005 | Enable TypeScript Strict Mode and Remove `@ts-nocheck` | Maintainability | [P005](proposals/done/P005_enable-typescript-strict-mode.md) |
| P006 | Optimize Real-time Collaboration Throughput | Performance | [P006](proposals/done/P006_optimize-realtime-collaboration-throughput.md) |
| P007 | Implement Authentication & Authorization | Reliability, Security | [P007](proposals/done/P007_authentication-and-authorization.md) |
| P008 | Replace `innerHTML` with Safe DOM Manipulation | Security, Maintainability | [P008](proposals/done/P008_replace-innerhtml-safe-dom.md) |
| P009 | Internationalization (i18n) Support | Maintainability | [P009](proposals/done/P009_internationalization-i18n.md) |
| P010 | Improve Error Handling & Observability | Reliability, Maintainability | [P010](proposals/done/P010_error-handling-and-observability.md) |
| P013 | Migrate the Custom WebSocket Server from JavaScript to TypeScript | Maintainability, Reliability | [P013](proposals/P013_migrate-server-to-typescript.md) |
| P014 | Add Structured Input Validation to All API Endpoints with Zod | Reliability, Security | [P014](proposals/P014_input-validation-zod.md) |
| P015 | Add Rate Limiting and Brute-Force Protection to API Endpoints | Security, Reliability | [P015](proposals/P015_rate-limiting-brute-force-protection.md) |
| P016 | Add a Continuous Integration and Continuous Deployment Pipeline Using GitHub Actions | Maintainability, Reliability | [P016](proposals/P016_cicd-pipeline-github-actions.md) |
| P018 | Replace CDN-Loaded Fabric.js with a Bundled npm Dependency | Reliability, Maintainability, Security | [P018](proposals/P018_replace-cdn-fabric-npm.md) |
| P011 | Database Performance Optimization: JSONB Storage, Missing Indices, and Query Improvements | Performance | [P011](proposals/P011_database-performance-optimization.md) |
| P019 | Add HTTP Security Headers and CSRF Protection | Security | [P019](proposals/P019_security-headers-csrf.md) |
| P023 | Add a Health Check Endpoint and Implement Graceful Shutdown | Reliability | [P023](proposals/P023_health-check-graceful-shutdown.md) |
| P020 | Prevent Memory Leaks by Implementing Proper Resource Cleanup | Reliability, Performance | [P020](proposals/P020_memory-leak-resource-cleanup.md) |
| P027 | Fail Fast on Misconfiguration: Validate Required Environment Variables at Application Startup | Reliability | [P027](proposals/P027_env-validation-startup.md) |
| P017 | Further Decompose the app.ts Orchestrator into Feature-Focused Coordinators | Maintainability | [P017](proposals/done/P017_decompose-app-orchestrator.md) |
| P026 | Add a Dockerfile and Multi-Stage Build for Reproducible Container Deployments | Reliability, Maintainability | [P026](proposals/done/P026_dockerfile-containerization.md) |
| P028 | Expand Automated Test Coverage to Canvas, Collaboration, and API Layers | Reliability, Maintainability | [P028](proposals/done/P028_expanded-test-coverage.md) |
| P021 | Reduce Unnecessary React Re-Renders with useCallback, useMemo, and Component Splitting | Performance | [P021](proposals/done/P021_react-performance-optimizations.md) |
| P024 | Virtualize the Commit Timeline SVG to Support Large Commit Histories | Performance | [P024](proposals/done/P024_timeline-virtualization.md) |
| P025 | Improve Application Accessibility: ARIA Roles, Keyboard Navigation, and Screen Reader Support | Maintainability | [P025](proposals/done/P025_accessibility-aria-keyboard.md) |
| P022 | Improve Canvas Rendering Performance: Batch Renders, Reduce Object Churn, and Cache Arrows | Performance | [P022](proposals/done/P022_canvas-rendering-performance.md) |
| P012 | Horizontal Scalability: Replace In-Memory Room State with Redis Pub/Sub | Reliability, Performance | [P012](proposals/done/P012_horizontal-scalability-redis-pubsub.md) |
| P042 | Add the `@typescript-eslint/no-floating-promises` ESLint Rule to Catch Unhandled Promise Rejections | Reliability, Maintainability | [P042](proposals/done/P042_no-floating-promises-eslint-rule.md) |
| P044 | Debounce the `pushPresence` Broadcast to Prevent Ghost-Client Flicker During Simultaneous Connects | Performance, UX | [P044](proposals/done/P044_presence-broadcast-debouncing.md) |
| P054 | Fix Timing Side-channel in `verifyCredentials` That Enables User-enumeration Attacks | Security | [P054](proposals/done/P054_constant-time-credential-verification.md) |
| P029 | Fix Unbounded Commit Query in `roomRepository.loadRoomSnapshot` and Add Paginated Commit History REST API | Performance, Reliability | [P029](proposals/done/P029_paginated-commit-history-api.md) |
| P030 | Add an LRU In-Memory Cache for Room Snapshots to Avoid Repeated Database Loads on Reconnect | Performance | [P030](proposals/done/P030_in-memory-room-snapshot-cache.md) |
| P031 | Validate Incoming WebSocket Message Payloads with Zod Schemas and Enforce Per-Message Size Limits | Reliability, Security | [P031](proposals/done/P031_websocket-message-validation.md) |
| P032 | Invoke `pruneInactiveRooms` on a Recurring Schedule to Prevent Unbounded Database Growth | Reliability, Performance | [P032](proposals/done/P032_automated-room-pruning-job.md) |
| P033 | Store Incremental Canvas Diffs Instead of Full Snapshots per Commit to Reduce Database Storage by 80–95% | Performance | [P033](proposals/done/P033_delta-based-canvas-storage.md) |
| P034 | Enforce Room Membership and Visibility Rules on WebSocket Connection Upgrade | Security, Reliability | [P034](proposals/done/P034_room-access-control-enforcement.md) |
| P035 | Aggregate Presence Across All Server Instances Using Redis Hash | Reliability | [P035](proposals/done/P035_cross-instance-presence-redis-hash.md) |
| P036 | Replace Ad-hoc `console.warn`/`console.error` Calls with a Unified Client-Side Logging Abstraction | Maintainability | [P036](proposals/done/P036_client-side-logging-abstraction.md) |
| P037 | Implement an Undo/Redo History Stack in the Canvas Engine with Ctrl+Z / Ctrl+Shift+Z Support | Performance, UX | [P037](proposals/done/P037_undo-redo-stack.md) |
| P038 | Add a Playwright End-to-End Test Suite Covering Critical User Journeys | Reliability, Maintainability | [P038](proposals/done/P038_e2e-playwright-test-suite.md) |
| P039 | Add a REST Endpoint to Export the Current Room's Canvas as PNG or SVG | Maintainability, UX | [P039](proposals/done/P039_canvas-export-api.md) |
| P040 | Implement Email-Based Password Reset for Credentials-Provider Users | Security, Reliability | [P040](proposals/done/P040_password-reset-flow.md) |
| P041 | Implement a User Account Self-Deletion Endpoint (GDPR Right to Erasure) | Security, Compliance | [P041](proposals/done/P041_gdpr-account-deletion.md) |
| P043 | Add a Drain Window Before Closing WebSocket Connections During Graceful Shutdown | Reliability | [P043](proposals/done/P043_graceful-shutdown-drain-window.md) |
| P045 | Pin Docker Base Images to SHA256 Digests and Add Trivy Vulnerability Scanning in CI | Security, Reliability | [P045](proposals/done/P045_docker-image-digest-trivy-scan.md) |
| P046 | Replace In-memory Proxy Rate Limiter with Redis-backed Counter for Multi-instance Correctness | Security, Reliability | [P046](proposals/done/P046_redis-backed-rate-limiter.md) |
| P047 | Add `safeBranchName()` and Commit Message Length Validation to Prevent Database Corruption | Security, Reliability | [P047](proposals/done/P047_branch-name-commit-message-sanitization.md) |
| P049 | Add `PATCH /api/rooms/[roomId]` to Allow Room Owners to Set a Memorable Slug | UX, Maintainability | [P049](proposals/done/P049_room-slug-management-api.md) |
| P050 | Integrate `next-intl` to Consume the Pre-existing `messages/en.json` and `messages/de.json` | UX, Maintainability | [P050](proposals/done/P050_i18n-wire-message-catalogue.md) |
| P051 | Cancel Pending Room-cleanup Timers During Graceful Shutdown to Prevent Post-shutdown Errors | Reliability | [P051](proposals/done/P051_room-cleanup-timer-shutdown.md) |
| P052 | Broadcast Merge Commits to Peers and Persist Them (Both Clean and Conflict-resolved Merges) | Reliability | [P052](proposals/done/P052_broadcast-merge-commits.md) |
| P053 | Broadcast Branch Rollback and Branch-switch Operations to Peers to Prevent Silent Divergence | Reliability | [P053](proposals/done/P053_broadcast-branch-operations.md) |
| P055 | Replace `window.confirm()` in `cpRollback` with an Accessible In-app Confirmation Modal | UX, Accessibility | [P055](proposals/done/P055_replace-window-confirm.md) |
| P056 | Implement Nonce-based CSP to Replace `'unsafe-inline'` in `script-src` and `style-src` | Security | [P056](proposals/done/P056_nonce-based-csp.md) |
| P057 | Validate Commit SHA Format and Canvas Payload Size Before WebSocket DB Persistence | Security, Reliability | [P057](proposals/done/P057_commit-sha-payload-validation.md) |
| P069 | Enforce a Configurable Maximum Number of WebSocket Clients per Room | Reliability, Security | [P069](proposals/done/P069_room-capacity-limit.md) |
| P072 | Add `security.txt`, `robots.txt`, and `/.well-known/` Routes | Security, Maintainability | [P072](proposals/done/P072_security-txt-robots-txt.md) |
| P077 | Create Shared Vitest Test Fixtures and Factory Helpers | Maintainability | [P077](proposals/done/P077_test-fixtures-factories.md) |

---

## Proposals – In Progress

*No proposals are currently in progress.*

---

## Proposals – Not Started

| ID | Title | Dimension(s) | File |
|----|-------|--------------|------|
| P058 | Reduce JavaScript Bundle Size Through Bundle Analysis and Dynamic Code Splitting | Performance, Maintainability | [P058](proposals/P058_bundle-analysis-code-splitting.md) |
| P059 | Enable WebSocket Per-Message Deflate Compression | Performance | [P059](proposals/P059_websocket-permessage-deflate.md) |
| P060 | Add PgBouncer Transaction-Mode Connection Pooling | Performance, Reliability | [P060](proposals/P060_pgbouncer-connection-pooling.md) |
| P061 | Instrument with OpenTelemetry Distributed Tracing and Metrics | Reliability, Maintainability | [P061](proposals/P061_opentelemetry-tracing-metrics.md) |
| P062 | Auto-generate OpenAPI 3.1 Specification from Zod Schemas | Maintainability | [P062](proposals/P062_openapi-documentation.md) |
| P063 | Add GitHub Copilot Workspace Configuration and Custom Instructions | Maintainability | [P063](proposals/P063_copilot-workspace-configuration.md) |
| P064 | Enforce Conventional Commits and Automate CHANGELOG Generation | Maintainability | [P064](proposals/P064_conventional-commits-changelog.md) |
| P065 | Migrate Password Hashing from bcryptjs to Argon2id | Security | [P065](proposals/P065_argon2id-password-hashing.md) |
| P066 | Replace Plain Room Share Links with Time-Limited Signed Invitation Tokens | Security, UX | [P066](proposals/P066_room-invitation-tokens.md) |
| P067 | Prevent Conflicting Concurrent Edits via Canvas Object Reservation (Soft Lock) | Reliability, UX | [P067](proposals/P067_canvas-object-locking.md) |
| P068 | Introduce Machine-Readable Error Codes in All API Error Responses | Maintainability, UX | [P068](proposals/P068_structured-error-codes.md) |
| P070 | Add `Cache-Control` Headers to SHA-Addressed API Responses | Performance | [P070](proposals/P070_http-cache-control-headers.md) |
| P071 | Enable Prisma Slow-Query Logging and Duration Alerting | Reliability, Maintainability | [P071](proposals/P071_prisma-slow-query-logging.md) |
| P073 | Batch Multiple Small WebSocket Messages Within a Single Tick | Performance | [P073](proposals/P073_websocket-message-batching.md) |
| P074 | Persist a Per-Room Activity Feed and Audit Log | Reliability, Security, UX | [P074](proposals/P074_room-activity-feed-audit-log.md) |
| P075 | Support Redis Sentinel and Cluster Connection Modes | Reliability | [P075](proposals/P075_redis-sentinel-cluster.md) |
| P076 | Add PDF Export for Canvas Drawings | UX | [P076](proposals/P076_canvas-pdf-export.md) |
| P078 | Add Dark/Light Theme Toggle with `prefers-color-scheme` Support | UX, Accessibility | [P078](proposals/P078_dark-light-theme-toggle.md) |
| P079 | Show Peer Branch Positions in Presence Panel and Branch Modal, with One-Click Branch Follow | UX, Reliability | [P079](proposals/P079_cross-branch-peer-visibility.md) |
| P080 | Add a Presenter Mode That Lets a User Ask Peers to Follow Their Canvas View in Real Time | UX, Reliability | [P080](proposals/P080_presenter-follow-view.md) |

---

## Dependency Map

Some proposals build on or benefit from others. The table below shows key dependencies:

| Proposal | Depends on / Benefits from |
|----------|---------------------------|
| P002 (Tests) | P001 ✅ (modules) makes unit testing practical |
| P005 (TypeScript) | P001 ✅ (new files already use types; remaining work is legacy cleanup) |
| P006 (Throughput) | P003 ✅ (persistence) enables server-side full-sync cache |
| P008 (innerHTML) | P001 ✅ (modules) creates clean seam for React migration of modal UIs |
| P010 (Observability) | P001 ✅ (modules) enables per-module structured error handling |
| P011 (DB Performance) | P003 ✅ (persistence layer established) |
| P012 (Scalability) | P004 ✅ (WebSocket resilience), P011 (DB indices recommended first) |
| P013 (Server TS) | P005 ✅ (TypeScript strict mode pattern established) |
| P014 (Validation) | P013 (server TypeScript enables typed schema imports) |
| P015 (Rate Limiting) | P014 (validation runs before rate-limit counting) |
| P016 (CI/CD) | P002 ✅ (tests exist to run); benefits all other proposals |
| P017 (Orchestrator) | P001 ✅ (module decomposition), P002 ✅ (tests for new coordinators) |
| P018 (Fabric npm) | P005 ✅ (TypeScript strict mode unlocks type checking of Fabric.js API) |
| P019 (Security Headers) | P018 (CDN Fabric.js removal tightens CSP to `script-src 'self'`) |
| P020 (Memory Leaks) | P001 ✅ (modules give each subsystem a clear destroy boundary) |
| P021 (React Perf) | P017 (orchestrator decomposition maps to sub-components) |
| P022 (Canvas Perf) | P006 ✅ (draw-delta); P020 (clean lifecycle makes pooling safe) |
| P023 (Health Check) | P026 (Docker/Kubernetes deploys consume the health endpoint) |
| P024 (Timeline Virt.) | P001 ✅ (pure layout function extractable from module) |
| P025 (Accessibility) | P008 ✅ (safe DOM operations); P025 extends modal ARIA |
| P026 (Docker) | P023 (health endpoint wired to HEALTHCHECK directive) |
| P027 (Env Validation) | P014 (Zod already available); P013 (typed env in server.ts) |
| P028 (Test Coverage) | P024 (layout extraction makes timeline testable); P014 (Zod enables 422 tests) |
| P029 (Paginated Commits API) | P011 ✅ (index added), P014 ✅ (Zod available) |
| P030 (Room Snapshot Cache) | P011 ✅ (bounded query), P023 ✅ (health endpoint); P029 recommended first |
| P031 (WS Payload Validation) | P013 ✅ (server in TypeScript), P014 ✅ (Zod available) |
| P032 (Room Pruning Job) | P003 ✅ (Prisma), P023 ✅ (shutdown handler), P027 ✅ (env validation) |
| P033 (Delta Canvas Storage) | P011 ✅ (JSONB column), P001 ✅ (`buildObjMap` available); P029 recommended first |
| P034 (Room Access Control) | P007 ✅ (auth established), P013 ✅ (TypeScript server) |
| P035 (Cross-Instance Presence) | P012 ✅ (Redis pub/sub), P007 ✅ (userId on ClientState), P023 ✅ (shutdown handler) |
| P036 (Client Logging) | P001 ✅ (module decomposition), P010 ✅ (pino server-side pattern) |
| P037 (Undo/Redo) | P001 ✅ (module decomposition), P022 ✅ (canvas rendering, loadFromJSON) |
| P038 (E2E Tests) | P016 ✅ (CI pipeline), P007 ✅ (auth flows), P023 ✅ (health endpoint) |
| P039 (Canvas Export) | P011 ✅ (JSONB canvasJson), P014 ✅ (Zod), P018 ✅ (Fabric.js npm) |
| P040 (Password Reset) | P007 ✅ (Credentials provider), P003 ✅ (VerificationToken model), P014 ✅ (Zod) |
| P041 (GDPR Deletion) | P007 ✅ (auth session), P003 ✅ (cascade rules), P014 ✅ (Zod) |
| P042 (no-floating-promises) | `@typescript-eslint/eslint-plugin` ✅ already installed and configured |
| P043 (Shutdown Drain) | P023 ✅ (graceful shutdown), P027 ✅ (env validation) |
| P044 (Presence Debounce) | P023 ✅ (shutdown handler to extend), P035 (complements Redis presence) |
| P045 (Docker Digest + Trivy) | P016 ✅ (CI pipeline), P026 ✅ (Dockerfile exists) |
| P046 (Redis Rate Limiter) | P012 ✅ (ioredis installed), P015 ✅ (in-memory limiter to extend) |
| P047 (Branch Sanitization) | P013 ✅ (server TypeScript), P031 (Zod WS validation — same allow-list constants) |
| P048 (Server-auth Fullsync) | P011 ✅ (DB indices), P030 (LRU cache makes per-join DB cost negligible) |
| P049 (Room Slug API) | P003 ✅ (Room.slug in schema), P007 ✅ (auth), P014 ✅ (Zod) |
| P050 (i18n Wire-up) | P021 ✅ (React memoization); messages/en.json + de.json already complete |
| P051 (Cleanup Timer Fix) | P023 ✅ (shutdown handler exists); complements P043 (drain window) |
| P052 (Merge Broadcast) | P017 ✅ (MergeCoordinator + AppContext.ws), P004 ✅ (WsClient.send()); severity: High |
| P053 (Branch Ops Broadcast) | P017 ✅ (coordinators), P004 ✅ (WsClient); new `branch-update` WS message type; severity: High |
| P054 (Timing-safe Verify) | P003 ✅ (userRepository), P007 ✅ (credentials provider); complements P015 ✅ (rate limiting) |
| P055 (Confirm Modal) | P017 ✅ (CommitCoordinator), P025 ✅ (openModal focus-trap), P055 pairs with P053 (cpRollback) |
| P056 (Nonce CSP) | P019 ✅ (CSP framework, explicitly deferred nonce work), P013 ✅ (proxy.ts TypeScript) |
| P057 (SHA/Payload Validation) | P013 ✅ (server TypeScript), P047 (branch sanitization — same boundary pattern) |
| P058 (Bundle Analysis) | P018 ✅ (Fabric.js npm enables tree-shaking), P021 ✅ (React perf) |
| P059 (WS Compression) | P013 ✅ (server TypeScript), P006 ✅ (draw-delta throttling amplifies savings) |
| P060 (PgBouncer) | P003 ✅ (Prisma established), P012 ✅ (horizontal scaling motivation) |
| P061 (OpenTelemetry) | P010 ✅ (Pino logging), P013 ✅ (TypeScript server), P023 ✅ (health check) |
| P062 (OpenAPI Docs) | P014 ✅ (Zod schemas already exist), P016 ✅ (CI pipeline) |
| P063 (Copilot Config) | All completed proposals (documents the conventions they established) |
| P064 (Conventional Commits) | P016 ✅ (CI pipeline); complements P063 (Copilot references commit format) |
| P065 (Argon2id) | P007 ✅ (auth), P054 ✅ (constant-time verification preserved) |
| P066 (Invitation Tokens) | P003 ✅ (Prisma), P007 ✅ (auth), P034 ✅ (access control), P054 ✅ (constant-time) |
| P067 (Object Locking) | P001 ✅ (modules), P006 ✅ (real-time collab), P020 ✅ (resource cleanup) |
| P068 (Error Codes) | P014 ✅ (Zod validation), P009 ✅ (i18n), P050 ✅ (next-intl wiring) |
| P069 (Room Capacity) | P013 ✅ (server TypeScript), P015 ✅ (per-IP limit — same upgrade handler) |
| P070 (Cache-Control) | P029 ✅ (paginated commits — SHA cursor enables immutable caching), P039 ✅ (export endpoint) |
| P071 (Prisma Slow-Query) | P003 ✅ (Prisma), P011 ✅ (DB performance — slow queries indicate missing indices) |
| P072 (security.txt) | P040 ✅ (password reset flow — /.well-known/change-password redirects there) |
| P073 (WS Batching) | P004 ✅ (WsClient), P006 ✅ (draw-delta throttling), P031 ✅ (WS validation) |
| P074 (Activity Feed) | P003 ✅ (Prisma), P032 ✅ (pruning), P041 ✅ (GDPR), P053 ✅ (branch-update) |
| P075 (Redis Sentinel) | P012 ✅ (ioredis established), P046 ✅ (Redis rate limiter) |
| P076 (PDF Export) | P039 ✅ (PNG/SVG export), P070 (cache headers) |
| P077 (Test Factories) | P002 ✅ (test suite), P028 ✅ (expanded coverage), P003 ✅ (Prisma models) |
| P078 (Theme Toggle) | P050 ✅ (locale switcher pattern), P039 ✅ (export uses themed background), P056 ✅ (CSP nonce) |
| P079 (Peer Branch Visibility) | P001 ✅ (modules), P012 ✅ (Redis presence), P017 ✅ (BranchCoordinator), P035 ✅ (cross-instance presence), P053 ✅ (branch-update) |
| P080 (Presenter Mode) | P001 ✅ (modules), P017 ✅ (coordinators + AppContext), P020 ✅ (cleanup), P031 ✅ (WS validation), P053 ✅ (branch-update); P079 (checkoutBranchByName) |

---

## Recommended Implementation Order

### Already completed
1. ~~**P003** – Persistence (PostgreSQL + Prisma)~~ ✅ **Done**
2. ~~**P007** – Auth/authz (anonymous-first + optional accounts)~~ ✅ **Done**
3. ~~**P001** – Module decomposition~~ ✅ **Done**
4. ~~**P004** – WebSocket resilience~~ ✅ **Done**
5. ~~**P005** – TypeScript strict (new module files are clean; legacy `@ts-nocheck` files remain)~~ ✅ **Done**
6. ~~**P008** – innerHTML fix (quick security win)~~ ✅ **Done**
7. ~~**P002** – Test suite (merge engine + git model are now independently unit-testable)~~ ✅ **Done**
8. ~~**P006** – Throughput optimization (builds on P003)~~ ✅ **Done**
9. ~~**P009** – i18n (standalone)~~ ✅ **Done**
10. ~~**P010** – Observability (ongoing companion)~~ ✅ **Done**
11. ~~**P016** – CI/CD pipeline (lint, coverage, deploy workflow, dependabot)~~ ✅ **Done**
12. ~~**P013** – Migrate server to TypeScript (tsx, tsconfig.server.json, full type safety)~~ ✅ **Done**
13. ~~**P014** – Input validation with Zod (lib/api/validate.ts, register route schema)~~ ✅ **Done**
14. ~~**P015** – Rate limiting (middleware.ts for auth routes, per-IP WebSocket limits)~~ ✅ **Done**
15. ~~**P027** – Env validation on startup (lib/env.ts, validateEnv(), fail-fast on misconfiguration)~~ ✅ **Done**
16. ~~**P018** – Replace CDN Fabric.js with npm (import { fabric }, destroy(), transpilePackages)~~ ✅ **Done**
17. ~~**P011** – Database performance (JSONB canvasJson, 4 indices, pagination take:100)~~ ✅ **Done**
18. ~~**P019** – Security headers & CSRF (CSP, X-Frame-Options, Origin validation in WS upgrade)~~ ✅ **Done**
19. ~~**P023** – Health check & graceful shutdown (/api/health, /api/ready, SIGTERM handler)~~ ✅ **Done**
20. ~~**P020** – Memory leak prevention (destroy() in CanvasEngine, CollabManager, app; useEffect cleanup)~~ ✅ **Done**
21. ~~**P017** – Decompose app.ts orchestrator (5 coordinators + AppContext; app.ts slimmed to ~185 lines)~~ ✅ **Done**
22. ~~**P026** – Dockerfile & containerization (multi-stage Dockerfile, .dockerignore, .nvmrc, docker-compose app service)~~ ✅ **Done**
23. ~~**P028** – Expanded test coverage (register route tests, coordinator tests, vitest config updated)~~ ✅ **Done**
24. ~~**P021** – React performance (useCallback for call(), React.memo on AppTopbar + LeftToolbar, useMemo for session)~~ ✅ **Done**
25. ~~**P024** – Timeline virtualization (computeLayout() separated; getVisibleCommits() for scroll-based DOM culling)~~ ✅ **Done**
26. ~~**P025** – Accessibility/ARIA (role=toolbar, aria-labels, focus-trap in modals, sr-only labels, skip link)~~ ✅ **Done**
27. ~~**P022** – Canvas rendering performance (requestRenderAll everywhere, pen Polyline in-place update, mouseup→Path conversion)~~ ✅ **Done**
28. ~~**P012** – Horizontal scalability via Redis (ioredis pub/sub, broadcastLocalRoom + broadcastRoom, graceful shutdown, docker-compose redis service)~~ ✅ **Done**
29. ~~**P029** – Paginated commit history API + bounded loadRoomSnapshot (take: 100, cursor pagination, GET /api/rooms/[roomId]/commits)~~ ✅ **Done**
30. ~~**P030** – LRU in-memory room snapshot cache (lru-cache, createRoomSnapshotCache, invalidate on commit, stats in /api/health)~~ ✅ **Done**
31. ~~**P031** – WebSocket message validation (InboundWsMessageSchema, size gate, safeParse, PAYLOAD_TOO_LARGE/INVALID_PAYLOAD errors)~~ ✅ **Done**
32. ~~**P032** – Automated room pruning job (startPruningJob, excludeRoomIds, PRUNE_INACTIVE_ROOMS_DAYS + PRUNE_INTERVAL_HOURS env vars)~~ ✅ **Done**
33. ~~**P033** – Delta-based canvas storage (CommitStorageType enum, computeCanvasDelta + replayCanvasDelta, DELTA/SNAPSHOT on write + reconstruct on read)~~ ✅ **Done**
34. ~~**P034** – Room access control (checkRoomAccess, ClientRole, ACCESS_DENIED on upgrade, FORBIDDEN on draw/commit for VIEWER/ANONYMOUS)~~ ✅ **Done**
35. ~~**P035** – Cross-instance presence via Redis Hash (REDIS_PRESENCE_PREFIX, getGlobalPresence, HSET+EXPIRE pipeline, hdel on shutdown)~~ ✅ **Done**
36. ~~**P036** – Client-side logging abstraction (lib/sketchgit/logger.ts, setLogLevel, onError hook, replaced 4× console.warn, ESLint no-console rule)~~ ✅ **Done**
37. ~~**P037** – Undo/redo stack in CanvasEngine (undoStack/redoStack, pushHistory on mousedown, undo()/redo() with broadcast, Ctrl+Z/Shift+Z/Y)~~ ✅ **Done**
38. ~~**P038** – Playwright E2E test suite (playwright.config.ts, 5 test scenarios in e2e/, test:e2e npm script, CI integration)~~ ✅ **Done**
39. ~~**P039** – Canvas Export REST API (renderToSVG/renderToPNG via StaticCanvas, GET /api/rooms/[roomId]/export, PNG+SVG download links in AppTopbar)~~ ✅ **Done**
40. ~~**P040** – Password reset flow (createPasswordResetToken+resetPassword in userRepository, POST forgot-password/reset-password endpoints, forgot-password+reset-password UI pages, "Forgot password?" link on signin)~~ ✅ **Done**
41. ~~**P041** – GDPR account deletion (DELETE /api/auth/account, password re-confirmation for credentials users, DeleteAccountButton with modal dialog in dashboard)~~ ✅ **Done**
42. ~~**P043** – Graceful shutdown drain window (inFlightWrites+beginWrite/endWrite/waitForDrain in server.ts, dbSaveCommit wrapped, shutdown-warning WsMessageType, SHUTDOWN_DRAIN_MS env var, toast in wsClient.ts)~~ ✅ **Done**
43. ~~**P045** – Docker digest pinning + Trivy CI (FROM node:22-alpine@sha256:... in all 3 stages, docker-build+trivy-scan CI jobs, SARIF upload to GitHub Security)~~ ✅ **Done**
44. ~~**P046** – Redis-backed rate limiter (lib/redis.ts getRedisClient() singleton, applyRateLimitRedis INCR+EXPIRE atomic counter, fail-open on Redis error, proxy.ts async delegation when REDIS_URL set)~~ ✅ **Done**
45. ~~**P047** – Branch name + commit message sanitization (safeBranchName/safeCommitMessage in server.ts, applied in dbSaveCommit, 100-char branch limit, 500-char message limit)~~ ✅ **Done**
46. ~~**P048** – Server-authoritative fullsync (room.size === 1 guard removed; every connecting client receives DB snapshot via P030 LRU cache; peer-to-peer fullsync-request retained as fallback)~~ ✅ **Done**
47. ~~**P049** – Room slug management API (PATCH /api/rooms/[roomId] with Zod validation + ownership check, resolveRoomId in roomRepository, slug resolution in WS upgrade, RenameRoomButton inline editor in dashboard, slug links)~~ ✅ **Done**
48. ~~**P050** – i18n message catalogue wired (next-intl installed, i18n.ts with cookie+Accept-Language locale detection, withNextIntl in next.config.mjs, NextIntlClientProvider in layout, useTranslations in SketchGitApp.tsx + AppTopbar.tsx, EN/DE LocaleSwitcher)~~ ✅ **Done**
49. ~~**P051** – Room cleanup timer shutdown (roomCleanupTimers.clear() in shutdown handler + timer.unref() on creation)~~ ✅ **Done**
50. ~~**P052** – Merge commit broadcast (ws.send in doMerge + applyMergeResolution; isMerge=true commit relayed to peers and persisted via existing commit message path)~~ ✅ **Done**
51. ~~**P053** – Branch-update message type (new `branch-update` WsMessageType; sent after cpRollback, cpCheckout, openBranchModal switch; handled in collaborationManager.applyBranchUpdate; relayed by server with write-permission check; branch-update blocked for VIEWER/ANONYMOUS)~~ ✅ **Done**
52. ~~**P055** – Replace window.confirm() with accessible modal (confirmModal overlay in SketchGitApp.tsx; showConfirm/acceptConfirm/cancelConfirm in CommitCoordinator; cpRollback uses showConfirm with callback; exposed in app API)~~ ✅ **Done**
53. ~~**P056** – Nonce-based CSP (buildCsp in lib/server/csp.ts; randomBytes nonce in proxy.ts per request; x-nonce header forwarded to layout.tsx; 'unsafe-inline' removed from next.config.mjs; NextIntlClientProvider + SessionProvider receive nonce; next.config.mjs experimental.nonce=true)~~ ✅ **Done**
54. ~~**P057** – Commit SHA/payload validation (validateCommitMessage in lib/server/commitValidation.ts; SHA regex /^[0-9a-f]{8,64}$/; canvas 2 MB limit + JSON.parse check; parents max 2, each valid SHA; applied before dbSaveCommit in server.ts; invalid messages logged + dropped)~~ ✅ **Done**
55. ~~**P069** – Room capacity limit (MAX_CLIENTS_PER_ROOM env var, capacity check in WS connection handler after access control, ROOM_FULL error message + ws.close(1008), intentionalClose suppresses reconnect in wsClient.ts, maxRoomSize in /api/health)~~ ✅ **Done**
56. ~~**P072** – security.txt + robots.txt (public/robots.txt disallows /auth/ /api/ /dashboard/ and AI crawlers; public/.well-known/security.txt RFC 9116 contact; app/.well-known/change-password/route.ts 302→/auth/forgot-password; SECURITY.md responsible disclosure policy)~~ ✅ **Done**
57. ~~**P077** – Test factories (lib/test/factories.ts makeUser/makeOAuthUser/makeRoom/makeMembership/makeCommit; lib/test/wsFactories.ts makeDrawDelta/makeWsCommit/makeBranchUpdate/makeCursorMessage/makeErrorMessage; lib/test/setup.ts global beforeEach/afterEach; vitest.config.ts setupFiles; 3 test files migrated)~~ ✅ **Done**

### New proposals (P029–P080)
These proposals address issues discovered in subsequent review cycles. Proposals P058–P080 are newly added and listed in recommended implementation order in the "Not Started" table above.

**Recommended order for P058–P068:**
1. **P063** – Copilot instructions (no code changes; high leverage for all future development)
2. **P068** – Structured error codes (pure refactor; improves all subsequent API work)
3. **P062** – OpenAPI docs (depends on P068 for typed error schemas)
4. **P064** – Conventional commits (low-effort process improvement)
5. **P065** – Argon2id hashing (security improvement; transparent migration)
6. **P058** – Bundle analysis (performance; measurable immediate impact)
7. **P059** – WebSocket compression (performance; one-line config change)
8. **P060** – PgBouncer (infrastructure; most impact on scaled deployments)
9. **P061** – OpenTelemetry (observability; enables data-driven decisions for remaining work)
10. **P066** – Invitation tokens (security/UX; requires schema migration)
11. **P067** – Object locking (UX/reliability; requires canvas + WS changes)

**Recommended order for P069–P080:**
1. **P072** – security.txt + robots.txt (static files; zero risk; immediate security value)
2. **P077** – Test factories (pure test infrastructure; improves all subsequent test work)
3. **P069** – Room capacity limit (single env var + one server.ts check; high reliability impact)
4. **P070** – Cache-Control headers (adds headers to existing routes; no behaviour change)
5. **P071** – Prisma slow-query logging (one-line change to prisma.ts; immediate observability)
6. **P073** – WebSocket message batching (additive to WsClient; improves P059 effectiveness)
7. **P078** – Dark/Light theme toggle (CSS variables + cookie; low risk; improves UX)
8. **P076** – PDF export (new export format; builds on P039 + P070)
9. **P079** – Peer branch visibility (extends presence payload; branch modal UI; one-click follow)
10. **P080** – Presenter mode (view-sync message; viewport API; follow/unfollow UI; builds on P079)
11. **P075** – Redis Sentinel/Cluster (infrastructure; needed before multi-region deployment)
12. **P074** – Activity feed (new DB model + API endpoint; provides audit trail)

---

## Quick Wins (Low effort, high impact)

The following items can be implemented quickly and independently:

| Quick Win | Parent Proposal | Estimated Effort |
|-----------|-----------------|------------------|
| Replace German object-type labels with English | P009 | 5 minutes |
| Remove unused `scrollToCommit()` function | P010 | 5 minutes |
| Replace `Math.random()` IDs with `crypto.randomUUID()` | P001 / P005 | 15 minutes |
| Replace empty `catch (_) {}` blocks with `console.warn` | P010 | 30 minutes |
| Add React error boundary wrapping `<SketchGitApp />` | P010 | 1 hour |
| Add `aria-label` to all toolbar buttons | P025 | 1 hour |
| Add `.nvmrc` pinning Node.js to version 22 | P026 | 5 minutes |
| Add `output: 'standalone'` to `next.config.mjs` | P026 | 5 minutes |
| Add `take: 100` to `roomRepository.loadRoomSnapshot` | P029 | 15 minutes |
| Clear pruning job timer in graceful shutdown handler | P032 | 15 minutes |
| Add `no-console` ESLint rule for `lib/sketchgit/**` | P036 | 10 minutes |
| Enable `@typescript-eslint/no-floating-promises` in ESLint config | P042 | 10 minutes |
| Add `schedulePushPresence` debounce wrapper (replace direct calls) | P044 | 30 minutes |
| Add drain-counter `beginWrite`/`endWrite` around `dbSaveCommit` | P043 | 30 minutes |
| Pin `node:22-alpine` to SHA256 digest in Dockerfile | P045 | 15 minutes |
| Add "Forgot password?" link to sign-in page (link only, no backend) | P040 | 5 minutes |
| Add "Delete Account" button to dashboard (UI only, modal stub) | P041 | 30 minutes |
| Add `safeBranchName()` + `safeCommitMessage()` to `dbSaveCommit` | P047 | 20 minutes |
| Clear `roomCleanupTimers` in shutdown handler + add `.unref()` | P051 | 15 minutes |
| Remove `room.size === 1` guard from fullsync send | P048 | 5 minutes |
| Update dashboard room links to use `room.slug ?? room.id` | P049 | 5 minutes |
| Add `ws.send({ type: 'commit', ... })` to `doMerge()` + `applyMergeResolution()` | P052 | 20 minutes |
| Add constant-time dummy bcrypt compare in `verifyCredentials` | P054 | 15 minutes |
| Add `validateCommitMessage()` before `dbSaveCommit` in server.ts | P057 | 30 minutes |

