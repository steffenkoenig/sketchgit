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
| P003 | Add a Persistence Layer | Reliability | [P003](proposals/done/P003_add-persistence-layer.md) |
| P007 | Implement Authentication & Authorization | Reliability, Security | [P007](proposals/done/P007_authentication-and-authorization.md) |

---

## Proposals – In Progress

*No proposals are currently in progress.*

---

## Proposals – Not Started

| ID | Title | Dimension(s) | File |
|----|-------|--------------|------|
| P001 | Decompose the Monolithic Engine into Modules | Maintainability, Performance | [P001](proposals/P001_decompose-monolithic-engine.md) |
| P002 | Add an Automated Test Suite | Reliability, Maintainability | [P002](proposals/P002_add-automated-test-suite.md) |
| P004 | WebSocket Reconnection & Connection Resilience | Reliability | [P004](proposals/P004_websocket-reconnection-resilience.md) |
| P005 | Enable TypeScript Strict Mode and Remove `@ts-nocheck` | Maintainability | [P005](proposals/P005_enable-typescript-strict-mode.md) |
| P006 | Optimize Real-time Collaboration Throughput | Performance | [P006](proposals/P006_optimize-realtime-collaboration-throughput.md) |
| P008 | Replace `innerHTML` with Safe DOM Manipulation | Security, Maintainability | [P008](proposals/P008_replace-innerhtml-safe-dom.md) |
| P009 | Internationalization (i18n) Support | Maintainability | [P009](proposals/P009_internationalization-i18n.md) |
| P010 | Improve Error Handling & Observability | Reliability, Maintainability | [P010](proposals/P010_error-handling-and-observability.md) |

---

## Dependency Map

Some proposals build on or benefit from others. The table below shows key dependencies:

| Proposal | Depends on / Benefits from |
|----------|---------------------------|
| P002 (Tests) | P001 (modules) makes unit testing practical |
| P004 (WS reconnect) | P003 ✅ (persistence) enables server-restart recovery |
| P005 (TypeScript) | Best implemented alongside P001 (new files can use types from the start) |
| P006 (Throughput) | P003 ✅ (persistence) enables server-side full-sync cache |
| P008 (innerHTML) | P001 (modules) creates clean seam for React migration of modal UIs |
| P010 (Observability) | P001 (modules) enables per-module structured error handling |

---

## Recommended Implementation Order

The proposals are independent enough to be worked on in parallel across team members, but the following sequencing maximizes compound benefit:

1. ~~**P003** – Persistence (PostgreSQL + Prisma)~~ ✅ **Done**
2. ~~**P007** – Auth/authz (anonymous-first + optional accounts)~~ ✅ **Done**
3. **P001** – Module decomposition (unlocks all other work)
4. **P005** – TypeScript strict (best done during module extraction)
5. **P008** – innerHTML fix (quick security win, do immediately; modal migration during P001)
6. **P002** – Test suite (do early; enables confident iteration on everything else)
7. **P004** – WebSocket resilience (builds on P003)
8. **P006** – Throughput optimization (builds on P003)
9. **P009** – i18n (standalone; German label fix is a quick sub-task)
10. **P010** – Observability (ongoing companion to all other work)

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

