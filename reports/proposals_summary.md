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

---

## Proposals – In Progress

*No proposals are currently in progress.*

---

## Proposals – Not Started

| ID | Title | Dimension(s) | File |
|----|-------|--------------|------|
| P011 | Database Performance Optimization: JSONB Storage, Missing Indices, and Query Improvements | Performance | [P011](proposals/P011_database-performance-optimization.md) |
| P012 | Horizontal Scalability: Replace In-Memory Room State with Redis Pub/Sub | Reliability, Performance | [P012](proposals/P012_horizontal-scalability-redis-pubsub.md) |
| P013 | Migrate the Custom WebSocket Server from JavaScript to TypeScript | Maintainability, Reliability | [P013](proposals/P013_migrate-server-to-typescript.md) |
| P014 | Add Structured Input Validation to All API Endpoints with Zod | Reliability, Security | [P014](proposals/P014_input-validation-zod.md) |
| P015 | Add Rate Limiting and Brute-Force Protection to API Endpoints | Security, Reliability | [P015](proposals/P015_rate-limiting-brute-force-protection.md) |
| P016 | Add a Continuous Integration and Continuous Deployment Pipeline Using GitHub Actions | Maintainability, Reliability | [P016](proposals/P016_cicd-pipeline-github-actions.md) |
| P017 | Further Decompose the app.ts Orchestrator into Feature-Focused Coordinators | Maintainability | [P017](proposals/P017_decompose-app-orchestrator.md) |
| P018 | Replace CDN-Loaded Fabric.js with a Bundled npm Dependency | Reliability, Maintainability, Security | [P018](proposals/P018_replace-cdn-fabric-npm.md) |
| P019 | Add HTTP Security Headers and CSRF Protection | Security | [P019](proposals/P019_security-headers-csrf.md) |
| P020 | Prevent Memory Leaks by Implementing Proper Resource Cleanup | Reliability, Performance | [P020](proposals/P020_memory-leak-resource-cleanup.md) |
| P021 | Reduce Unnecessary React Re-Renders with useCallback, useMemo, and Component Splitting | Performance | [P021](proposals/P021_react-performance-optimizations.md) |
| P022 | Improve Canvas Rendering Performance: Batch Renders, Reduce Object Churn, and Cache Arrows | Performance | [P022](proposals/P022_canvas-rendering-performance.md) |
| P023 | Add a Health Check Endpoint and Implement Graceful Shutdown | Reliability | [P023](proposals/P023_health-check-graceful-shutdown.md) |
| P024 | Virtualize the Commit Timeline SVG to Support Large Commit Histories | Performance | [P024](proposals/P024_timeline-virtualization.md) |
| P025 | Improve Application Accessibility: ARIA Roles, Keyboard Navigation, and Screen Reader Support | Maintainability | [P025](proposals/P025_accessibility-aria-keyboard.md) |
| P026 | Add a Dockerfile and Multi-Stage Build for Reproducible Container Deployments | Reliability, Maintainability | [P026](proposals/P026_dockerfile-containerization.md) |
| P027 | Fail Fast on Misconfiguration: Validate Required Environment Variables at Application Startup | Reliability | [P027](proposals/P027_env-validation-startup.md) |
| P028 | Expand Automated Test Coverage to Canvas, Collaboration, and API Layers | Reliability, Maintainability | [P028](proposals/P028_expanded-test-coverage.md) |

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

### Next wave (P011–P018)
11. **P016** – CI/CD pipeline (unblocks safe delivery of all subsequent changes)
12. **P013** – Migrate server to TypeScript (low-risk, high-maintainability win)
13. **P018** – Replace CDN Fabric.js with npm (quick security and reliability win)
14. **P014** – Input validation with Zod (security hardening; enables P027)
15. **P015** – Rate limiting (builds on P014; security hardening)
16. **P011** – Database performance (JSONB, indices, pagination)
17. **P017** – Decompose app.ts orchestrator (builds on P001 pattern)
18. **P012** – Horizontal scalability via Redis (architectural upgrade; do last)

### Third wave (P019–P028)
19. **P027** – Env validation on startup (small effort, high safety gain; use Zod from P014)
20. **P019** – Security headers & CSRF (quick win after P018 tightens CSP)
21. **P023** – Health check & graceful shutdown (prerequisite for P026 Docker)
22. **P026** – Dockerfile & containerization (enables container-based deployment)
23. **P020** – Memory leak & resource cleanup (small effort, improves all future refactors)
24. **P028** – Expanded test coverage (collab, wsClient, API routes)
25. **P021** – React performance optimizations (measure first with Profiler)
26. **P022** – Canvas rendering performance (measure first with DevTools)
27. **P024** – Timeline virtualization (needed when commit count > 200)
28. **P025** – Accessibility / ARIA (ongoing; start with quick wins)

---

## Quick Wins (Low effort, high impact)

The following items from the proposals can be implemented quickly and independently:

| Quick Win | Parent Proposal | Estimated Effort |
|-----------|-----------------|------------------|
| Replace German object-type labels with English | P009 | 5 minutes |
| Enable `perMessageDeflate` on the WebSocket server | P006 | 5 minutes |
| Throttle cursor broadcast to 10 updates/second | P006 | 30 minutes |
| Remove unused `scrollToCommit()` function | P010 | 5 minutes |
| Replace `Math.random()` IDs with `crypto.randomUUID()` | P001 / P005 | 15 minutes |
| Replace empty `catch (_) {}` blocks with `console.warn` | P010 | 30 minutes |
| Add React error boundary wrapping `<SketchGitApp />` | P010 | 1 hour |
| Add `integrity` SRI hash to CDN Fabric.js script tag | P018 | 15 minutes |
| Add `@@index([roomId])` to Commit model | P011 | 15 minutes |
| Add `transpilePackages: ['fabric']` to next.config.mjs | P018 | 5 minutes |
| Add `X-Frame-Options: DENY` header to next.config.mjs | P019 | 5 minutes |
| Add Origin validation to WebSocket upgrade handler | P019 | 30 minutes |
| Add `SIGTERM` handler calling `prisma.$disconnect()` | P020 / P023 | 30 minutes |
| Add `aria-label` to all toolbar buttons | P025 | 1 hour |
| Add `.nvmrc` pinning Node.js to version 22 | P026 | 5 minutes |
| Add `output: 'standalone'` to `next.config.mjs` | P026 | 5 minutes |

