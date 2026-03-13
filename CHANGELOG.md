# Changelog

All notable changes to SketchGit are documented in this file.

This changelog is maintained automatically by [Release Please](https://github.com/googleapis/release-please).
Once this release automation is active, every `feat:`, `fix:`, `perf:`, and `refactor:` commit merged to `main` will
automatically appear here when the next Release Please PR is merged.

## [0.2.0](https://github.com/steffenkoenig/sketchgit/compare/sketchgit-next-v1.1.0...sketchgit-next-v1.2.0) (2026-03-13)


### Features

* **share-links:** add sharing UI — topbar button + commit popup action (P091) ([ba28de9](https://github.com/steffenkoenig/sketchgit/commit/ba28de93027c2094c943315d491ffac9975874d7))


### Bug Fixes

* bring branch coverage above 69% threshold ([245d435](https://github.com/steffenkoenig/sketchgit/commit/245d43569089b39cb2c625db9cfe4712fdb63716))
* bring branch coverage above 69% threshold ([3b79846](https://github.com/steffenkoenig/sketchgit/commit/3b79846aa498f137820a3adf300b73ff59d941e0))
* **deploy:** correct tag trigger pattern to match release-please tags ([a31a1a6](https://github.com/steffenkoenig/sketchgit/commit/a31a1a6d5a0f3ffdb67019a22597a7e25b209a9c))
* **deploy:** correct workflow tag trigger to match release-please tags ([2effa16](https://github.com/steffenkoenig/sketchgit/commit/2effa16c4feccd273388b8e8cadeb309406d8248))
* remove unused `mockPngImage` destructuring and replace `any[]` with `unknown[]` ([b92f3b2](https://github.com/steffenkoenig/sketchgit/commit/b92f3b22b6911d2ff88205226c8e6436090a94d8))
* remove unused mockPngImage destructuring and replace any[] with unknown[] ([92af785](https://github.com/steffenkoenig/sketchgit/commit/92af7853a6c1779ca3546abdf85571fa5cd1b60e))
* **share-links:** address all PR review comments — scope guards, fullsync filtering, error handling ([a76f1c4](https://github.com/steffenkoenig/sketchgit/commit/a76f1c4718ac07be195fc60d912b4fa7610795a4))

## [0.1.0](https://github.com/steffenkoenig/sketchgit/compare/sketchgit-next-v1.0.0...sketchgit-next-v1.1.0) (2026-03-13)


### Features

* add bug-scanner Copilot Coding Agent with scan and write-report skills ([431e880](https://github.com/steffenkoenig/sketchgit/commit/431e880664586ca016ac8b443a3ec3b99cc85619))
* add bug-scanner Copilot Coding Agent with scan and write-report skills ([ba6f1fc](https://github.com/steffenkoenig/sketchgit/commit/ba6f1fc75c28f74d1e8cd83b784a1382befa9509))
* automatic commit messages and branch names with auto-commit on branch creation ([d521efa](https://github.com/steffenkoenig/sketchgit/commit/d521efa337a04dd28b8b43d7cac5af82df3cc009))
* automatic commit messages and branch names with auto-commit on branch creation ([0eb0568](https://github.com/steffenkoenig/sketchgit/commit/0eb0568798966cc8919cbb21442d7caffdb616a3))
* **deploy:** push to GHCR with SHA tag and update k8s manifest via GitOps ([2c6cd44](https://github.com/steffenkoenig/sketchgit/commit/2c6cd440587947963fe5498e8d7a25b2ec0aff91))
* **identity:** persist user name, room and branch in localStorage for anonymous users ([853015f](https://github.com/steffenkoenig/sketchgit/commit/853015f917526f94f0429235e600ee9b3e304d42))
* **identity:** persist user name, room, and branch in localStorage for anonymous users ([a818239](https://github.com/steffenkoenig/sketchgit/commit/a8182396daa1bd7f7dcdd0c6420931e482843a02))
* implement P003 persistence (PostgreSQL+Prisma) and P007 auth/authz (anonymous + optional accounts) ([7105dbd](https://github.com/steffenkoenig/sketchgit/commit/7105dbdc56e6636213de75a9d69e6e9310f6f645))
* implement P017 (coordinator decomposition), P026 (Dockerfile), P028 (expanded tests)" ([75d835d](https://github.com/steffenkoenig/sketchgit/commit/75d835de2b9c0fc16160e975da70f351d5db040c))
* implement P021 (React perf), P024 (timeline virtualization), P025 (accessibility) ([5f29af2](https://github.com/steffenkoenig/sketchgit/commit/5f29af2558ae9034a05acbdfd6eb84551207e22c))
* implement P022 (canvas perf) and P012 (Redis pub/sub) — all proposals complete ([ed2b457](https://github.com/steffenkoenig/sketchgit/commit/ed2b457402e440013506772fe50ae072562f3ef7))
* implement P054 (constant-time auth), P042 (no-floating-promises ESLint), P044 (presence debouncing)" ([157821d](https://github.com/steffenkoenig/sketchgit/commit/157821d27f3da052cb9f98735c78fa1a124809e6))
* implement P059 P058 P065 P073 P062 – WS compression, bundle analysis, Argon2id, WS batching, OpenAPI ([e484de4](https://github.com/steffenkoenig/sketchgit/commit/e484de45dc369d2df87b4ea3d780db448a5fca21))
* implement P063 P064 P068 P070 P071 ([8f1a901](https://github.com/steffenkoenig/sketchgit/commit/8f1a9013fdac71997376f3bf8cac8779e1286c2e))
* implement P069 room capacity, P072 security.txt/robots.txt, P077 test factories" ([b49055e](https://github.com/steffenkoenig/sketchgit/commit/b49055e5840a13c159dfa9b46c101b77cb67989d))
* implement P076 P079 P075 P067 P080 – PDF export, peer branches, Redis HA, object locking, presenter mode ([84cde5d](https://github.com/steffenkoenig/sketchgit/commit/84cde5d8934db5239a9342014feb9a59b40dd1a0))
* implement P078 P074 P066 – dark/light theme, activity feed, invitation tokens ([dd6094d](https://github.com/steffenkoenig/sketchgit/commit/dd6094d8c6b75e4a29fe0383265e9a23cc642fc3))
* **infra:** add k8s manifests for microk8s/ArgoCD deployment ([d24874b](https://github.com/steffenkoenig/sketchgit/commit/d24874b6cc1c742852878cfafc74c9d76a0d9f52))
* **infra:** k8s manifests for microk8s/ArgoCD + GHCR image pipeline with SHA tagging ([793487b](https://github.com/steffenkoenig/sketchgit/commit/793487b89455d59ac5283eb9561f56d92055ba02))
* **mobile:** responsive topbar scroll, timeline vertical scroll, canvas pinch-to-zoom, viewport meta ([86a2182](https://github.com/steffenkoenig/sketchgit/commit/86a2182653bc4d581b5709b6f994f2194647b86e))
* **mobile:** responsive topbar, timeline vertical scroll, canvas pinch-to-zoom ([e1bce1c](https://github.com/steffenkoenig/sketchgit/commit/e1bce1ca04cf9645d42495cca7a187b715ccb14e))
* P001 module decomposition + P004 WebSocket reconnection resilience ([13a148e](https://github.com/steffenkoenig/sketchgit/commit/13a148e49ef49cdb251f2145214487620895690d))
* PDF export, cross-branch peer presence, Redis HA modes, canvas object locking, presenter mode ([53f4b97](https://github.com/steffenkoenig/sketchgit/commit/53f4b977dd62c98a3da33c245a605402a221025d))


### Bug Fixes

* 304 ordering, PDF determinism, invitation race, DUMMY_HASH, strokeWidth, husky ([e5254f5](https://github.com/steffenkoenig/sketchgit/commit/e5254f504c1647929d35a9125b134032f4a36cc2))
* add @swc/helpers override to sync package-lock.json for CI ([bab9c0b](https://github.com/steffenkoenig/sketchgit/commit/bab9c0bf6b5c295d84d079284042bb5ba762c780))
* add postinstall script to run prisma generate after npm ci ([a868484](https://github.com/steffenkoenig/sketchgit/commit/a8684848af8c039659767c5b9d31b79c01540531))
* add public/.gitkeep so Docker COPY /app/public succeeds ([325d948](https://github.com/steffenkoenig/sketchgit/commit/325d948562b03d693a30fbde6a336103e41f8cdf))
* address all 9 review comments (aria-pressed, Redis dupe, RAF leak, modal, Dockerfile, non-ASCII) ([8d5c340](https://github.com/steffenkoenig/sketchgit/commit/8d5c3401e1edc2d3a55a7f404825524363437fae))
* address code review feedback; move P001+P004 to done/; update proposals_summary.md ([bb59c8a](https://github.com/steffenkoenig/sketchgit/commit/bb59c8ad43e3776b49683ea43e384aeb241e990d))
* address code review feedback; move P003+P007 to done/; update proposals_summary.md ([b658adc](https://github.com/steffenkoenig/sketchgit/commit/b658adc99a65e3d50c6d28c12a2d5f328515b768))
* address PR review comments (unused import, MemberRole type, _stopPresenting in destroy) ([feb5b6d](https://github.com/steffenkoenig/sketchgit/commit/feb5b6d87e7416b13e1857ef454848ece0b43db5))
* apply all PR review comments (rate limit, WS schema, auth guards, access control, DELTA reconstruction) ([e1ab8cd](https://github.com/steffenkoenig/sketchgit/commit/e1ab8cddbc9d693ef4f030815689576dde283d78))
* apply second-round review fixes (wsSchema nullable branch, write-guard, CSP inline styles, fixed-window comment, public-room EDITOR role) ([af2e901](https://github.com/steffenkoenig/sketchgit/commit/af2e901170e84b11f68479899692ebaf47a09ac2))
* **canvas:** drawing tools produce no output — unbound toJSON aborts onMouseDown ([e6c6c2f](https://github.com/steffenkoenig/sketchgit/commit/e6c6c2f156bdf36aa9c215a585f972e49e07b453))
* **canvas:** merging branches empties canvas — _id never serialised in Fabric.js v7 ([16b3fe1](https://github.com/steffenkoenig/sketchgit/commit/16b3fe1e86cb05292202c5c71f1f22aca88e7e01))
* **canvas:** repair drawing tools broken by unbound toJSON in getCanvasData() ([8a2908c](https://github.com/steffenkoenig/sketchgit/commit/8a2908c40507b109fa2972a1cd5c50d4bc45b070))
* **canvas:** resolve TypeScript build error in pen branch of onMouseUp ([b5b58b0](https://github.com/steffenkoenig/sketchgit/commit/b5b58b0bf77d37301e57496c2fad1d5ac1751223))
* **canvas:** use toObject() and FabricObject.customProperties to include _id in serialised JSON ([64ff493](https://github.com/steffenkoenig/sketchgit/commit/64ff493c01e1fbd1fd64d50e8a8516e11097e855))
* **ci:** add fetch-depth=0 to checkout for commitlint base SHA resolution ([97388c0](https://github.com/steffenkoenig/sketchgit/commit/97388c06b24f196ee102966a99417cc6c15c3800))
* **ci:** raise commitlint header-max-length to 120, ignore Initial plan commit ([ed3c105](https://github.com/steffenkoenig/sketchgit/commit/ed3c105811b74ee065eb0be22c6089dcb7e75d25))
* **collab:** always close name modal in setName() so anonymous users can draw ([460ea4e](https://github.com/steffenkoenig/sketchgit/commit/460ea4e8ba2e16ad212270500b5b597dea77fbd7))
* Dockerfile stage 1 uses npm ci --ignore-scripts to skip prisma generate ([c1463e8](https://github.com/steffenkoenig/sketchgit/commit/c1463e8e62cc08d89223ba3f773c370c302b5b4f))
* eliminate detached HEAD with branch-tip detection and auto-branch-on-draw ([2685245](https://github.com/steffenkoenig/sketchgit/commit/268524513d79b020a7b417df9b05f1ac8778c323))
* eliminate detached HEAD with branch-tip detection and auto-branch-on-draw ([e054c2d](https://github.com/steffenkoenig/sketchgit/commit/e054c2d9c8fad3b513fbf02022724265bfef6158))
* **identity:** fix savePreferences data loss, deep-link branch clobbering, and stale URL after branch restore ([3139287](https://github.com/steffenkoenig/sketchgit/commit/3139287de20dc65cfe2a4915bb1f92d5094c730f))
* implement all 11 identified bugs (BUG-001 – BUG-011) ([2c4503d](https://github.com/steffenkoenig/sketchgit/commit/2c4503de88acbeb83df2e056c37976c3d56245a8))
* implement all 11 identified bugs (BUG-001 through BUG-011) ([65d200c](https://github.com/steffenkoenig/sketchgit/commit/65d200c5af74ac4fac94227f76d87f8768d196a3))
* **merge:** add integration tests and close BUG-019 tracking ([b442bd5](https://github.com/steffenkoenig/sketchgit/commit/b442bd553e404e105f60bdeb75e637615148b8a2))
* **merge:** use ours canvas envelope instead of base in clean 3-way merge ([374e428](https://github.com/steffenkoenig/sketchgit/commit/374e428d0aca53576ccf5031db366ac08d8f3add))
* **mobile:** guard pinch start-distance epsilon; add pinch-to-zoom tests ([79fc239](https://github.com/steffenkoenig/sketchgit/commit/79fc239be0772277ee21521508551d4222d39c88))
* PostCSS Tailwind v4, Prisma v7 adapter, coverage threshold ([2e05f9f](https://github.com/steffenkoenig/sketchgit/commit/2e05f9fad6034c7eeb2681792fcfd7a4a5a497b2))
* resolve all TypeScript errors (Zod v4 API, CanvasDelta casts, null/undefined, Buffer, resend package) ([a369cb5](https://github.com/steffenkoenig/sketchgit/commit/a369cb502f10805a2f73ac0c906a30089c8483fe))
* resolve CI TypeScript errors - Prisma v7, Fabric v7, Tailwind v4 migration; no any types ([5048a59](https://github.com/steffenkoenig/sketchgit/commit/5048a59a72db441911ae943704cc3a44bdf8e382))
* resolve room slug in export route; push undo history on object:modified ([1ec3a06](https://github.com/steffenkoenig/sketchgit/commit/1ec3a060142c003e24f0057aff39a0a3b07b4ced))
* **types:** resolve TS7022 circular inference in resolveCommitCanvas ([dadbe4f](https://github.com/steffenkoenig/sketchgit/commit/dadbe4f84124513c42b919c18866132d4f6111eb))


### Refactoring

* address code review feedback for P063-P071 ([2d309e9](https://github.com/steffenkoenig/sketchgit/commit/2d309e923a77369b74416c42189bdec72ec7844c))
* **identity:** extract setBranchInUrl to userPreferences, cache prefs at startup, fix test mocks ([4d2b783](https://github.com/steffenkoenig/sketchgit/commit/4d2b78387bce18d4ab36a7e430e96542d0261163))
* **identity:** remove redundant nullish coalescing, rename shadowed variable ([b381e65](https://github.com/steffenkoenig/sketchgit/commit/b381e6592dd900464d4ba268970f6d6454dfba05))


### Documentation

* add GAP-016 through GAP-022 and update GAP-019 classification ([1d00dd8](https://github.com/steffenkoenig/sketchgit/commit/1d00dd8b32d1c8a81ac43c601f3c2d8846b70f7d))
* add optimization proposals P011–P018 and update proposals_summary.md ([059a096](https://github.com/steffenkoenig/sketchgit/commit/059a0965895791b937affa4ac48e7dd303af1896))
* add optimization proposals P019–P028 and update proposals_summary.md ([0bbd8e7](https://github.com/steffenkoenig/sketchgit/commit/0bbd8e77a8baf0ce61eee74989ab5f5dd8dee0b1))
* add optimization proposals P029-P036 and update proposals_summary.md ([fe0a1d1](https://github.com/steffenkoenig/sketchgit/commit/fe0a1d1340cdbc7a1c9d0cff0bd6eb174a464d58))
* add optimization proposals P037-P045 and update proposals_summary.md ([d4d8294](https://github.com/steffenkoenig/sketchgit/commit/d4d8294088150e897d92eba55fe71a62a617ebad))
* add optimization proposals P046-P051 and update proposals_summary.md ([f2b5611](https://github.com/steffenkoenig/sketchgit/commit/f2b5611d8d8047cf966443bb2a2f86bda7c0e9b7))
* add optimization proposals P052-P057 and update proposals_summary.md ([23e42b1](https://github.com/steffenkoenig/sketchgit/commit/23e42b1c5b6fdd649601c28536d519b716b87b80))
* add optimization proposals P079–P080 (peer branch visibility, presenter mode) ([78184a1](https://github.com/steffenkoenig/sketchgit/commit/78184a1325e051c0fa036f213881e76780312eca))
* add optimization proposals P081–P090 and update proposals_summary.md ([fdcf249](https://github.com/steffenkoenig/sketchgit/commit/fdcf2496a2971e1550237bd462f6d46d66f31fe2))
* add optimization proposals P081–P090 and update proposals_summary.md ([9943215](https://github.com/steffenkoenig/sketchgit/commit/9943215b08650805e0d408c92c2ffd770eeff789))
* add P080 Presenter Mode proposal and update proposals_summary.md ([b8479b5](https://github.com/steffenkoenig/sketchgit/commit/b8479b5a609ac443f1d8d1e6431ebaefe9827bea))
* add proposals P058-P068 and update proposals_summary.md ([d04c257](https://github.com/steffenkoenig/sketchgit/commit/d04c257d306452665685c037eeadb2b32e8cb0ca))
* **bugs:** add bug scan reports BUG-001 through BUG-004 ([d1c8b05](https://github.com/steffenkoenig/sketchgit/commit/d1c8b05ea733dafc24aadde78546ba28e1d0f838))
* **bugs:** add BUG-012 undo saves post-transform state in canvasEngine ([643687d](https://github.com/steffenkoenig/sketchgit/commit/643687d31954cb5abb2d6878cbc4f3e2138e8bd5))
* **bugs:** add BUG-013 and BUG-014 from third scan pass ([32186e7](https://github.com/steffenkoenig/sketchgit/commit/32186e7e56c4f5c30052822f1989a0071cb223b3))
* **bugs:** add BUG-015 and BUG-016 from fourth scan pass ([444588b](https://github.com/steffenkoenig/sketchgit/commit/444588b496d4d49b38082858f8d93e5c797980b7))
* **bugs:** add BUG-017, BUG-018, BUG-019 from fifth scan pass ([c79f42f](https://github.com/steffenkoenig/sketchgit/commit/c79f42ffa0ab926de65e37c2a83d0445f4f93894))
* **bugs:** add second-pass bug reports BUG-005 through BUG-008 ([cd243e0](https://github.com/steffenkoenig/sketchgit/commit/cd243e08e99cfd9a2b1a06cc543dc157f8813ab1))
* **bugs:** archive fixed reports to done/ and restructure bug_summary.md ([4cfd694](https://github.com/steffenkoenig/sketchgit/commit/4cfd694ce73a684957f7def550e59a0e4cb34112))
* **bugs:** move BUG-001–011 to done/ and rewrite bug_summary.md with Fixed/Open split ([e91c6e7](https://github.com/steffenkoenig/sketchgit/commit/e91c6e7819a01ac3a67042e128f8223da91db7f6))
* **bugs:** third-pass scan — BUG-009 through BUG-011 ([4df4714](https://github.com/steffenkoenig/sketchgit/commit/4df47147268fa1abd6c751762631f72cdbb0089a))
* create German/EU compliance gap documents in reports/gaps/ ([3ec393f](https://github.com/steffenkoenig/sketchgit/commit/3ec393f340f830e7a40fa09ad37686380f59e22a))
* German/EU compliance gap analysis – GAP-016 through GAP-022 + GAP-019 classification ([6f9316e](https://github.com/steffenkoenig/sketchgit/commit/6f9316e426c7aef759a4acdbac1802d689da8373))
* update README to reflect current app state ([326c732](https://github.com/steffenkoenig/sketchgit/commit/326c73284dec5086ab6b24af285934fcbc6db2d5))
* update README to reflect current app state ([38e1b2d](https://github.com/steffenkoenig/sketchgit/commit/38e1b2d12714fbe565a5276d83ccb5b64f3e4a96))

## [0.0.0] – Initial Release

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
