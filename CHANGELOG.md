# Changelog

All notable changes to SketchGit are documented in this file.

This changelog is maintained automatically by [Release Please](https://github.com/googleapis/release-please).
Once this release automation is active, every `feat:`, `fix:`, `perf:`, and `refactor:` commit merged to `main` will
automatically appear here when the next Release Please PR is merged.

## [0.5.3](https://github.com/steffenkoenig/sketchgit/compare/sketchgit-next-v0.5.2...sketchgit-next-v0.5.3) (2026-05-30)


### Bug Fixes

* [milestone 1.0] Highest priority system fixes (Bugs, Licensing, Compliance) ([#158](https://github.com/steffenkoenig/sketchgit/issues/158)) ([a81342d](https://github.com/steffenkoenig/sketchgit/commit/a81342d8ecc31ed7ace2510cdb473b1cbc823082))
* Resolve fonts CDN GAP-016 and implement P089 license scan ([#160](https://github.com/steffenkoenig/sketchgit/issues/160)) ([3889a45](https://github.com/steffenkoenig/sketchgit/commit/3889a455d0bc99a3703c586ba701fa413c346d65))


### Documentation

* add new platform improvement plans ([53ff64d](https://github.com/steffenkoenig/sketchgit/commit/53ff64d2213e9211efe7644ac17d156c0dab4764))

## [0.5.2](https://github.com/steffenkoenig/sketchgit/compare/sketchgit-next-v0.5.1...sketchgit-next-v0.5.2) (2026-05-28)


### Bug Fixes

* **lint:** add inline eslint-disable for process.env ([43b32b8](https://github.com/steffenkoenig/sketchgit/commit/43b32b8e145f88677a79270e25f4e6c5a9fb92dc))
* resolve process is not defined errors in components and lib ([2df6d7c](https://github.com/steffenkoenig/sketchgit/commit/2df6d7c77c885967a0e18a5ab9780fc027d1e442))
* verify shape creation prevention on existing object click ([58e23d5](https://github.com/steffenkoenig/sketchgit/commit/58e23d5933553e4f2927658276544d23c935f520))

## [0.5.1](https://github.com/steffenkoenig/sketchgit/compare/sketchgit-next-v0.5.0...sketchgit-next-v0.5.1) (2026-05-28)


### Bug Fixes

* broadcast and mark dirty programmatic canvas property updates ([7682bdb](https://github.com/steffenkoenig/sketchgit/commit/7682bdb7387d22d28780cf12d5fc8f7551cf9e65))
* BUG-007 non-atomic password reset token documentation ([bd615d5](https://github.com/steffenkoenig/sketchgit/commit/bd615d5093c52e9e513365b7f0105dfee2b44f4c))
* build failures in CI from unused vars and typescript resolution ([c40d32a](https://github.com/steffenkoenig/sketchgit/commit/c40d32ac560d5dc7c803141ab53c3dd153cb60cc))
* implement robust pushHistory and Arrow group rebuilding in programmatic style updates ([fc55ff2](https://github.com/steffenkoenig/sketchgit/commit/fc55ff28545e964b0690e7364286be09ab092dab))
* **lint:** remove global process comment causing no-redeclare error ([5a41653](https://github.com/steffenkoenig/sketchgit/commit/5a416532dc5be05738cda858953b751a7eed0eec))
* mark programmatic changes dirty to enable commits and broadcast ([2a61851](https://github.com/steffenkoenig/sketchgit/commit/2a61851e1273e7fd46c43e232696c954ddf39bec))
* resolve CI failures (ERESOLVE and no-redeclare) ([2e7aab9](https://github.com/steffenkoenig/sketchgit/commit/2e7aab9add51cec0e871d854beed9f5ad6a68078))
* resolve CI failures for ERESOLVE and ESLint ([0711fbc](https://github.com/steffenkoenig/sketchgit/commit/0711fbcafe68ee5ef3309ffd3ec74c0a38375d92))

## [0.5.0](https://github.com/steffenkoenig/sketchgit/compare/sketchgit-next-v0.4.0...sketchgit-next-v0.5.0) (2026-05-27)


### Features

* [milestone P011] Optimize database queries ([32cf6a5](https://github.com/steffenkoenig/sketchgit/commit/32cf6a5f28aadd62143ee3a813b4e550d7c3843b))
* [milestone P011] Optimize database queries ([a34e0b5](https://github.com/steffenkoenig/sketchgit/commit/a34e0b50dd92f60f7e76a8f393d023c09abba145))
* add bug-scanner Copilot Coding Agent with scan and write-report skills ([431e880](https://github.com/steffenkoenig/sketchgit/commit/431e880664586ca016ac8b443a3ec3b99cc85619))
* add bug-scanner Copilot Coding Agent with scan and write-report skills ([ba6f1fc](https://github.com/steffenkoenig/sketchgit/commit/ba6f1fc75c28f74d1e8cd83b784a1382befa9509))
* Add React Error Boundaries for Graceful UI Failure Isolation (P081) ([45bb296](https://github.com/steffenkoenig/sketchgit/commit/45bb29617608919f73403e889dcf5aa6d4cefa7e))
* Add React Error Boundaries for Graceful UI Failure Isolation (P081) ([175585a](https://github.com/steffenkoenig/sketchgit/commit/175585aee4329cef080d3194f9e3d2f774e272d5))
* automatic commit messages and branch names with auto-commit on branch creation ([d521efa](https://github.com/steffenkoenig/sketchgit/commit/d521efa337a04dd28b8b43d7cac5af82df3cc009))
* automatic commit messages and branch names with auto-commit on branch creation ([0eb0568](https://github.com/steffenkoenig/sketchgit/commit/0eb0568798966cc8919cbb21442d7caffdb616a3))
* **canvas:** add doodle style for hand-drawn pen look ([c874340](https://github.com/steffenkoenig/sketchgit/commit/c87434073283cb39ced3e5c04c0ee97075f10a62))
* **canvas:** add extended shape properties for drawing tools ([be749aa](https://github.com/steffenkoenig/sketchgit/commit/be749aac8965e8f0bd9b95827e6f5e12fb1a49c8))
* **canvas:** add mermaid diagram support with line-by-line merge diff ([d495f35](https://github.com/steffenkoenig/sketchgit/commit/d495f35de0cc9727862a1db928f8c48f698766e9))
* **canvas:** address review feedback — closest-snap, Path reSnap, selection restore, rAF throttle, MERGE_PROPS ([96a5f55](https://github.com/steffenkoenig/sketchgit/commit/96a5f5503303537e22f15d60b7c0b3bb75055f37))
* **canvas:** doodle style + rounded corners for all sketch styles ([5f7cbdc](https://github.com/steffenkoenig/sketchgit/commit/5f7cbdce076f55d738d65371a8cc8d3b197cde11))
* **canvas:** link line/arrow endpoints to shapes so they follow when moved ([7906b49](https://github.com/steffenkoenig/sketchgit/commit/7906b49f320338cd1328ab12503911053c6b02f9))
* **canvas:** Mermaid diagram support with line-by-line merge diffing and per-line conflict UI ([2e9b72f](https://github.com/steffenkoenig/sketchgit/commit/2e9b72f65d3f0fa1b99b2788578194524827cb55))
* **canvas:** move shape settings to contextual properties panel ([f305fde](https://github.com/steffenkoenig/sketchgit/commit/f305fde799de316974aec631dab373c0b9c5952b))
* **canvas:** replace rectangular selection box with endpoint handles for lines and arrows ([f19f053](https://github.com/steffenkoenig/sketchgit/commit/f19f0534a5f42ca23951959ac2ab05c8809d7e94))
* **canvas:** rounded corners for artist, cartoonist, and doodle styles ([9d82cca](https://github.com/steffenkoenig/sketchgit/commit/9d82ccaa82187cd6797e4fcd5cd780204f25499a))
* **canvas:** snap existing lines/arrows to shapes when moved (object:modified) ([fb25217](https://github.com/steffenkoenig/sketchgit/commit/fb25217c1398f375dd2aa256f98d5919fa13a825))
* **canvas:** snap line/arrow endpoints to shape borders not just centers ([75ed67d](https://github.com/steffenkoenig/sketchgit/commit/75ed67dd09693320c6561fab2521dfc0674a27ac))
* **canvas:** snap/attach existing lines and arrows to shapes after creation ([f48d352](https://github.com/steffenkoenig/sketchgit/commit/f48d352c0b890e10c6284f0c18535ac96a6e31b6))
* **collab:** generate random UUID room ID for first-time visitors ([fe3964d](https://github.com/steffenkoenig/sketchgit/commit/fe3964deee505f47d4945a1943d79c17586a3697))
* **deploy:** push to GHCR with SHA tag and update k8s manifest via GitOps ([2c6cd44](https://github.com/steffenkoenig/sketchgit/commit/2c6cd440587947963fe5498e8d7a25b2ec0aff91))
* export dropdown, locale dropdown, topbar SVG icons ([fee444a](https://github.com/steffenkoenig/sketchgit/commit/fee444ad1a094f2037d04c8da48ebb9ea2c352db))
* generate random UUID room ID for first-time visitors + fix TS build ([413a701](https://github.com/steffenkoenig/sketchgit/commit/413a7018ca02cd4f7236f4f03d3e405f48a5883a))
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
* **merge:** show individual conflicting mermaid lines in conflict UI ([439d062](https://github.com/steffenkoenig/sketchgit/commit/439d0622a47ac3c0b43bad44fadede13d9a44308))
* migrate client events from WebSocket to REST API (P-REST) ([baff39c](https://github.com/steffenkoenig/sketchgit/commit/baff39c0dd6edb08d717bba7a5210d1e8995e780))
* **mobile:** responsive topbar scroll, timeline vertical scroll, canvas pinch-to-zoom, viewport meta ([86a2182](https://github.com/steffenkoenig/sketchgit/commit/86a2182653bc4d581b5709b6f994f2194647b86e))
* **mobile:** responsive topbar, timeline vertical scroll, canvas pinch-to-zoom ([e1bce1c](https://github.com/steffenkoenig/sketchgit/commit/e1bce1ca04cf9645d42495cca7a187b715ccb14e))
* P001 module decomposition + P004 WebSocket reconnection resilience ([13a148e](https://github.com/steffenkoenig/sketchgit/commit/13a148e49ef49cdb251f2145214487620895690d))
* PDF export, cross-branch peer presence, Redis HA modes, canvas object locking, presenter mode ([53f4b97](https://github.com/steffenkoenig/sketchgit/commit/53f4b977dd62c98a3da33c245a605402a221025d))
* REST-based event architecture — WebSocket becomes receive-only ([6e63ec9](https://github.com/steffenkoenig/sketchgit/commit/6e63ec9c24870221bbe9ea7a0761d7938c751196))
* **share-links:** add share UI — topbar button and timeline commit popup action (P091) ([38163ec](https://github.com/steffenkoenig/sketchgit/commit/38163ec308cc18ee0e0b5e8fcfd0dd34c954497a))
* **share-links:** add sharing UI — topbar button + commit popup action (P091) ([ba28de9](https://github.com/steffenkoenig/sketchgit/commit/ba28de93027c2094c943315d491ffac9975874d7))
* **share-links:** implement P091 backend – schema, tokens, repository, API routes, WS enforcement ([f10d5a0](https://github.com/steffenkoenig/sketchgit/commit/f10d5a09c91b66bac976ec3c5d378e1630217b2d))
* Topbar export dropdown, language dropdown, and SVG icons — with portal fix for canvas overlap ([27082ef](https://github.com/steffenkoenig/sketchgit/commit/27082efca0133fcbca2647aa96066ae1c25c8806))
* **ws:** add REST polling fallback when WebSocket is unavailable ([604ccd0](https://github.com/steffenkoenig/sketchgit/commit/604ccd0e34849102d9491370dc916516d81c9bb7))


### Bug Fixes

* 'process' is not defined error in ErrorFallback.tsx ([76eea29](https://github.com/steffenkoenig/sketchgit/commit/76eea29e7d71c89837bb8739871afd3b8670a963))
* 304 ordering, PDF determinism, invitation race, DUMMY_HASH, strokeWidth, husky ([e5254f5](https://github.com/steffenkoenig/sketchgit/commit/e5254f504c1647929d35a9125b134032f4a36cc2))
* add @swc/helpers override to sync package-lock.json for CI ([bab9c0b](https://github.com/steffenkoenig/sketchgit/commit/bab9c0bf6b5c295d84d079284042bb5ba762c780))
* add loadLastRoomId to userPreferences mock in app.test.ts ([f0171f5](https://github.com/steffenkoenig/sketchgit/commit/f0171f5f6f82ff2a76c364beb0061bffe4ee8199))
* add postinstall script to run prisma generate after npm ci ([a868484](https://github.com/steffenkoenig/sketchgit/commit/a8684848af8c039659767c5b9d31b79c01540531))
* add public/.gitkeep so Docker COPY /app/public succeeds ([325d948](https://github.com/steffenkoenig/sketchgit/commit/325d948562b03d693a30fbde6a336103e41f8cdf))
* address all 9 review comments (aria-pressed, Redis dupe, RAF leak, modal, Dockerfile, non-ASCII) ([8d5c340](https://github.com/steffenkoenig/sketchgit/commit/8d5c3401e1edc2d3a55a7f404825524363437fae))
* address code review feedback; move P001+P004 to done/; update proposals_summary.md ([bb59c8a](https://github.com/steffenkoenig/sketchgit/commit/bb59c8ad43e3776b49683ea43e384aeb241e990d))
* address code review feedback; move P003+P007 to done/; update proposals_summary.md ([b658adc](https://github.com/steffenkoenig/sketchgit/commit/b658adc99a65e3d50c6d28c12a2d5f328515b768))
* address code review issues (wsClientId guard, object-lock color dedup, validation logger) ([9c01746](https://github.com/steffenkoenig/sketchgit/commit/9c01746a2b180278aa9d239a7b8188ffec49486f))
* address PR review - uuid in deps, loadLastRoomId helper, test fixes ([25056ed](https://github.com/steffenkoenig/sketchgit/commit/25056edfae6d06cb8b8f30cc3b0f570bc7d4dae0))
* address PR review comments (unused import, MemberRole type, _stopPresenting in destroy) ([feb5b6d](https://github.com/steffenkoenig/sketchgit/commit/feb5b6d87e7416b13e1857ef454848ece0b43db5))
* apply all PR review comments (rate limit, WS schema, auth guards, access control, DELTA reconstruction) ([e1ab8cd](https://github.com/steffenkoenig/sketchgit/commit/e1ab8cddbc9d693ef4f030815689576dde283d78))
* apply fill on toggleFill, add strokeUniform to prevent scaling ([02f7d69](https://github.com/steffenkoenig/sketchgit/commit/02f7d69da362d6dd5686a085f7700424c23ec9aa))
* apply open redirect protection to useRegister hook and revert next-env.d.ts ([c6cd52e](https://github.com/steffenkoenig/sketchgit/commit/c6cd52ec72fef6bd5859e91550e476606bd6a951))
* apply second-round review fixes (wsSchema nullable branch, write-guard, CSP inline styles, fixed-window comment, public-room EDITOR role) ([af2e901](https://github.com/steffenkoenig/sketchgit/commit/af2e901170e84b11f68479899692ebaf47a09ac2))
* background fill not applied on toggle; stroke width scales on resize ([4608a28](https://github.com/steffenkoenig/sketchgit/commit/4608a28450ae463691e2b9abdb25923dc3b1bc34))
* bring branch coverage above 69% threshold ([245d435](https://github.com/steffenkoenig/sketchgit/commit/245d43569089b39cb2c625db9cfe4712fdb63716))
* bring branch coverage above 69% threshold ([3b79846](https://github.com/steffenkoenig/sketchgit/commit/3b79846aa498f137820a3adf300b73ff59d941e0))
* **build:** dynamic import canvasRenderer to prevent fabric/node at build time ([b8d4479](https://github.com/steffenkoenig/sketchgit/commit/b8d44798993b6b1b79a0ae18bc53f3f964df6b15))
* **build:** move ExportQuerySchema to break canvasRenderer build-time dependency chain ([f98acf7](https://github.com/steffenkoenig/sketchgit/commit/f98acf77c66197f514994d2203458352288ab1f2))
* **build:** restore roomId for ShareModal using window.location.search on open ([c0d9544](https://github.com/steffenkoenig/sketchgit/commit/c0d9544182062db4857b1e0f77d5e1848d5c252f))
* cancel lock-expire timers and fix lint error ([7f477e3](https://github.com/steffenkoenig/sketchgit/commit/7f477e37c2e0c0284c338a1aeb8214caa630fde2))
* **canvas:** add descriptive comments to catch blocks in endpoint control methods ([95a2e7a](https://github.com/steffenkoenig/sketchgit/commit/95a2e7ad0e5aeee90ea6d78f401dc513454592d8))
* **canvas:** address code review feedback for mermaid implementation ([16dd4e9](https://github.com/steffenkoenig/sketchgit/commit/16dd4e94175056ac56c79902725231b4f46d212a))
* **canvas:** address code review issues in shape properties feature ([7c33aed](https://github.com/steffenkoenig/sketchgit/commit/7c33aed53edcf470be113faff4f078447d8219f0))
* **canvas:** address PR review – position fix, URL sanitisation, arrow rebuild, a11y, i18n ([498219d](https://github.com/steffenkoenig/sketchgit/commit/498219d140457f79c17598fce078c2e82655cae9))
* **canvas:** address review comments on endpoint controls ([d226420](https://github.com/steffenkoenig/sketchgit/commit/d22642007e9bee1f454fb5acb8cb2e8283be5754))
* **canvas:** arrow rebuild mid-drag no longer disrupts shape movement or discards in-progress arrows ([6e463b4](https://github.com/steffenkoenig/sketchgit/commit/6e463b47f9520b13204367cb1187b080eb66ff2b))
* **canvas:** Backspace/Delete deletes all selected shapes, not just one ([adefd30](https://github.com/steffenkoenig/sketchgit/commit/adefd30c22bbcc5318f5d1f64a7c76ec046707dc))
* **canvas:** cancel pending attachment rAF on snap rebuild ([#107](https://github.com/steffenkoenig/sketchgit/issues/107)) ([38deb39](https://github.com/steffenkoenig/sketchgit/commit/38deb39a388d3a70746b891921afeb369c9565f0))
* **canvas:** delete all selected objects on Backspace/Delete key ([56d9a92](https://github.com/steffenkoenig/sketchgit/commit/56d9a92a536d40b480ba8278c4a8540c595a17b2))
* **canvas:** drawing tools produce no output — unbound toJSON aborts onMouseDown ([e6c6c2f](https://github.com/steffenkoenig/sketchgit/commit/e6c6c2f156bdf36aa9c215a585f972e49e07b453))
* **canvasEngine.test:** remove unused _onBroadcastDraw destructuring ([426ec61](https://github.com/steffenkoenig/sketchgit/commit/426ec6135cf45cc957d44ae6ba1e2e70efdeb82b))
* **canvas:** exclude eraser from e.target guard and add undoStack assertion to test ([c0cfb83](https://github.com/steffenkoenig/sketchgit/commit/c0cfb83900f13a70bad4ceb410b4e8be97c5a2e0))
* **canvas:** fill-pattern on existing shapes, link save+dblclick, real sloppiness for all shapes ([1d59cbf](https://github.com/steffenkoenig/sketchgit/commit/1d59cbfd94e374bfbccc3a91df769d687bb0d41a))
* **canvas:** fill-pattern on existing shapes, link serialisation + dblclick, sloppiness for all shapes with real hand-drawn rendering ([d56a86e](https://github.com/steffenkoenig/sketchgit/commit/d56a86ef581399cf51853e15337af2ab12c59c6d))
* **canvas:** fix arrow endpoint drag by rebuilding group children in-place ([40c2767](https://github.com/steffenkoenig/sketchgit/commit/40c27677e2840a19d9a3f9156802ae56b87351ae))
* **canvas:** fix mermaid SVG size – diagrams no longer cut off ([44621fb](https://github.com/steffenkoenig/sketchgit/commit/44621fb70b99d4faf95da9b39e4bf5bf96f6196b))
* **canvas:** line, arrow, and sketch-path endpoint handles now drag correctly ([ecf5e35](https://github.com/steffenkoenig/sketchgit/commit/ecf5e35d3fd7845ab684835170e53648ca855161))
* **canvas:** merging branches empties canvas — _id never serialised in Fabric.js v7 ([16b3fe1](https://github.com/steffenkoenig/sketchgit/commit/16b3fe1e86cb05292202c5c71f1f22aca88e7e01))
* **canvas:** prevent new shape creation when interacting with existing objects while a drawing tool is active ([2c3190a](https://github.com/steffenkoenig/sketchgit/commit/2c3190a60d372662d512795e2e4a273f728165cf))
* **canvas:** repair drawing tools broken by unbound toJSON in getCanvasData() ([8a2908c](https://github.com/steffenkoenig/sketchgit/commit/8a2908c40507b109fa2972a1cd5c50d4bc45b070))
* **canvas:** resolve TypeScript build error in pen branch of onMouseUp ([b5b58b0](https://github.com/steffenkoenig/sketchgit/commit/b5b58b0bf77d37301e57496c2fad1d5ac1751223))
* **canvas:** skip new-shape creation when mouse:down hits an existing object ([eb6f543](https://github.com/steffenkoenig/sketchgit/commit/eb6f54372fa795e9ac9c9232a9b405b6260cf046))
* **canvas:** snap line endpoints for artist/cartoonist styles and track movement ([067c798](https://github.com/steffenkoenig/sketchgit/commit/067c7987c5d6c5e68bbd81b5e5eb7f4bb5903f4d))
* **canvas:** sync engine state on selection, r=3 for sharp, fill gating, opacity in arrowheads ([b2febbb](https://github.com/steffenkoenig/sketchgit/commit/b2febbba1bc7314cbe971dd194929576ebd6ac82))
* **canvas:** use preserved strokeLineCap/strokeLineJoin for curved/elbow arrows too ([29be48e](https://github.com/steffenkoenig/sketchgit/commit/29be48eb706125c12fcda63a87d5489df563ca13))
* **canvas:** use toObject() and FabricObject.customProperties to include _id in serialised JSON ([64ff493](https://github.com/steffenkoenig/sketchgit/commit/64ff493c01e1fbd1fd64d50e8a8516e11097e855))
* **ci:** add fetch-depth=0 to checkout for commitlint base SHA resolution ([97388c0](https://github.com/steffenkoenig/sketchgit/commit/97388c06b24f196ee102966a99417cc6c15c3800))
* **ci:** declare process as global to resolve no-undef lint error in browser files ([786fa0e](https://github.com/steffenkoenig/sketchgit/commit/786fa0e5dba0944163589d4c9a0daa8dfb0214b3))
* **ci:** raise commitlint header-max-length to 120, ignore Initial plan commit ([ed3c105](https://github.com/steffenkoenig/sketchgit/commit/ed3c105811b74ee065eb0be22c6089dcb7e75d25))
* **collab:** always close name modal in setName() so anonymous users can draw ([460ea4e](https://github.com/steffenkoenig/sketchgit/commit/460ea4e8ba2e16ad212270500b5b597dea77fbd7))
* **deploy:** correct tag trigger pattern to match release-please tags ([a31a1a6](https://github.com/steffenkoenig/sketchgit/commit/a31a1a6d5a0f3ffdb67019a22597a7e25b209a9c))
* **deploy:** correct workflow tag trigger to match release-please tags ([2effa16](https://github.com/steffenkoenig/sketchgit/commit/2effa16c4feccd273388b8e8cadeb309406d8248))
* **deps:** add @types/uuid to resolve TypeScript build error ([f9f5f66](https://github.com/steffenkoenig/sketchgit/commit/f9f5f66abd39164269684870cc3544da34ccdbd1))
* Dockerfile stage 1 uses npm ci --ignore-scripts to skip prisma generate ([c1463e8](https://github.com/steffenkoenig/sketchgit/commit/c1463e8e62cc08d89223ba3f773c370c302b5b4f))
* eliminate detached HEAD with branch-tip detection and auto-branch-on-draw ([2685245](https://github.com/steffenkoenig/sketchgit/commit/268524513d79b020a7b417df9b05f1ac8778c323))
* eliminate detached HEAD with branch-tip detection and auto-branch-on-draw ([e054c2d](https://github.com/steffenkoenig/sketchgit/commit/e054c2d9c8fad3b513fbf02022724265bfef6158))
* **ErrorFallback:** consistently use simple process.env check (process is global) ([6574c0e](https://github.com/steffenkoenig/sketchgit/commit/6574c0eadcf4c39099dcf95de7a147b5a2d2fcb6))
* **ErrorFallback:** remove redundant declare const process ([8e83d70](https://github.com/steffenkoenig/sketchgit/commit/8e83d702b7de531aab8a58ebd8c78f5e51aae84f))
* **ErrorFallback:** remove redundant typeof process guard and eslint-disable comment ([e25003a](https://github.com/steffenkoenig/sketchgit/commit/e25003acf325b9122a474ea650bd72cf97334cad))
* **ErrorFallback:** remove stale eslint workarounds (process is declared global) ([0e0a6bd](https://github.com/steffenkoenig/sketchgit/commit/0e0a6bd2f736d42e3b64ba454cf6363898e46e8a))
* **ErrorFallback:** revert eslint-disable and typeof guard (redundant, process is declared global) ([0d37aa7](https://github.com/steffenkoenig/sketchgit/commit/0d37aa7ce54332405ee26875cd3436228b1a6a31))
* **ErrorFallback:** simplify process guard - global process already declared via eslint config ([9a11e74](https://github.com/steffenkoenig/sketchgit/commit/9a11e74470c47b5b757c48ce0fcf4d9147b542c7))
* **ErrorFallback:** simplify process.env check - process is now a declared global ([ff36b9c](https://github.com/steffenkoenig/sketchgit/commit/ff36b9cfa077edf3187c14705247cb04000087eb))
* **errors:** address PR code review feedback ([d2bb34b](https://github.com/steffenkoenig/sketchgit/commit/d2bb34be506c0231e4db906c20d490415951b4b1))
* eslint error on process global variable ([db1bcda](https://github.com/steffenkoenig/sketchgit/commit/db1bcdaccb1b1df9f85c0bfb35851f8bda7782a3))
* **export:** bypass DB for canvas export; fix ShareModal roomId stale ref ([2ebb8a2](https://github.com/steffenkoenig/sketchgit/commit/2ebb8a255e47aa701bbe543d26f085d0f01687f2))
* **export:** fetch-based download reads live room ID; shows toast on error ([77ce248](https://github.com/steffenkoenig/sketchgit/commit/77ce248f9be6e7e1f5e7ef46e2b506a5195fc7ea))
* **export:** post endpoint with live canvas JSON bypasses DB dependency ([e152161](https://github.com/steffenkoenig/sketchgit/commit/e152161ec210f6c03e383061a442522e874d767f))
* **export:** use fabric/node entry point to fix PNG/SVG/PDF download failures ([c148571](https://github.com/steffenkoenig/sketchgit/commit/c1485713e41e42949a31b981d589318ad33f957e))
* **git:** preserve ours canvas-level properties during 3-way merge ([3cb6b4b](https://github.com/steffenkoenig/sketchgit/commit/3cb6b4bad6a9cffc96325475814734598ced322e))
* **identity:** fix savePreferences data loss, deep-link branch clobbering, and stale URL after branch restore ([3139287](https://github.com/steffenkoenig/sketchgit/commit/3139287de20dc65cfe2a4915bb1f92d5094c730f))
* implement all 11 identified bugs (BUG-001 – BUG-011) ([2c4503d](https://github.com/steffenkoenig/sketchgit/commit/2c4503de88acbeb83df2e056c37976c3d56245a8))
* implement all 11 identified bugs (BUG-001 through BUG-011) ([65d200c](https://github.com/steffenkoenig/sketchgit/commit/65d200c5af74ac4fac94227f76d87f8768d196a3))
* **lint:** fix unused variables to pass ci build ([9a7023f](https://github.com/steffenkoenig/sketchgit/commit/9a7023fdbf3cd89840776087f9cf394c6a943875))
* **lint:** process is not defined in ErrorFallback ([813ea13](https://github.com/steffenkoenig/sketchgit/commit/813ea1363629d8e5bec5c691ee8c02be1a8e5de9))
* **lint:** process is not defined in ErrorFallback ([4d12267](https://github.com/steffenkoenig/sketchgit/commit/4d1226720eed5e359d6314374158c5129174fb7f))
* localeDropdown ARIA + keyboard nav + localize all auth pages ([b0d3d22](https://github.com/steffenkoenig/sketchgit/commit/b0d3d225716ec1f172df40a72a7f97901e5d5eab))
* **merge:** add integration tests and close BUG-019 tracking ([b442bd5](https://github.com/steffenkoenig/sketchgit/commit/b442bd553e404e105f60bdeb75e637615148b8a2))
* **merge:** address 3 review comments from commit 7bd8f1a ([8f23cb1](https://github.com/steffenkoenig/sketchgit/commit/8f23cb188d934f49d94c5c8e110dd9d5759f7153))
* **merge:** address 4 review comments on canvasEngine and mergeCoordinator ([7bd8f1a](https://github.com/steffenkoenig/sketchgit/commit/7bd8f1a39783c31783251bdf0020fa4fbd671a8a))
* **merge:** pass mergedCanvasProps in MergeCoordinator and add unit test ([864a0a7](https://github.com/steffenkoenig/sketchgit/commit/864a0a755e1f48f99a79f7260bf1a24eb091eb0d))
* **merge:** use ours canvas envelope instead of base in clean 3-way merge ([374e428](https://github.com/steffenkoenig/sketchgit/commit/374e428d0aca53576ccf5031db366ac08d8f3add))
* **mobile:** guard pinch start-distance epsilon; add pinch-to-zoom tests ([79fc239](https://github.com/steffenkoenig/sketchgit/commit/79fc239be0772277ee21521508551d4222d39c88))
* PostCSS Tailwind v4, Prisma v7 adapter, coverage threshold ([2e05f9f](https://github.com/steffenkoenig/sketchgit/commit/2e05f9fad6034c7eeb2681792fcfd7a4a5a497b2))
* prevent arrow group rebuild from disrupting drag-tracking ([16c2643](https://github.com/steffenkoenig/sketchgit/commit/16c264336a078ea0be777344ca84ef97be71d722))
* prevent arrow group rebuild from disrupting drag-tracking ([862107a](https://github.com/steffenkoenig/sketchgit/commit/862107a64759c7229f408b0a39ed7c54fb3066aa))
* prevent arrow group rebuild from disrupting drag-tracking ([adf012a](https://github.com/steffenkoenig/sketchgit/commit/adf012a6541aab5e975d29c8edac2a647c4b5fb9))
* prevent infinite arrow rebuild loop when attaching arrows to shapes post-creation ([f02e88a](https://github.com/steffenkoenig/sketchgit/commit/f02e88a80ee13f22ccc947c5459dfa05fe72daa8))
* prevent infinite arrow rebuild loop when attaching arrows to shapes post-creation ([1f4df65](https://github.com/steffenkoenig/sketchgit/commit/1f4df65754ef68bf3bdcea7ccb97543387fef3d1))
* Prevent new shape creation when clicking on existing object ([#91](https://github.com/steffenkoenig/sketchgit/issues/91)) ([1ec5560](https://github.com/steffenkoenig/sketchgit/commit/1ec5560f1bb4962604dc59a2c9056907f56ac6c5))
* prevent TOCTOU race in websocket invitation handling (BUG-004) ([1ea2962](https://github.com/steffenkoenig/sketchgit/commit/1ea29620eeb12dd887dccdee594c7344d2ab6074))
* remove unused `mockPngImage` destructuring and replace `any[]` with `unknown[]` ([b92f3b2](https://github.com/steffenkoenig/sketchgit/commit/b92f3b22b6911d2ff88205226c8e6436090a94d8))
* remove unused mockPngImage destructuring and replace any[] with unknown[] ([92af785](https://github.com/steffenkoenig/sketchgit/commit/92af7853a6c1779ca3546abdf85571fa5cd1b60e))
* render topbar dropdowns via React portal so they appear above canvas ([0301268](https://github.com/steffenkoenig/sketchgit/commit/0301268bb1cf5211618a0c61dd1a3c1c75865e72))
* resolve all TypeScript errors (Zod v4 API, CanvasDelta casts, null/undefined, Buffer, resend package) ([a369cb5](https://github.com/steffenkoenig/sketchgit/commit/a369cb502f10805a2f73ac0c906a30089c8483fe))
* resolve CI TypeScript errors - Prisma v7, Fabric v7, Tailwind v4 migration; no any types ([5048a59](https://github.com/steffenkoenig/sketchgit/commit/5048a59a72db441911ae943704cc3a44bdf8e382))
* resolve process not defined in components/errors/ErrorFallback.tsx ([01bf514](https://github.com/steffenkoenig/sketchgit/commit/01bf5144203d9ef41abe95245563c48ca174ed76))
* resolve process undefined error in ErrorFallback ([7112ac0](https://github.com/steffenkoenig/sketchgit/commit/7112ac02f68df460efaf636c9ec5beceb86f58e6))
* resolve process undefined error in ErrorFallback ([fe7a11d](https://github.com/steffenkoenig/sketchgit/commit/fe7a11dba3129db925df595e8f12d3875cadca04))
* resolve room slug in export route; push undo history on object:modified ([1ec3a06](https://github.com/steffenkoenig/sketchgit/commit/1ec3a060142c003e24f0057aff39a0a3b07b4ced))
* restore allowedOrigins extraction lost during conflict resolution ([ae3572a](https://github.com/steffenkoenig/sketchgit/commit/ae3572ae7edc9cff45d3026ae8e16a974c58edd7))
* **share-links:** address all PR review comments — scope guards, fullsync filtering, error handling ([a76f1c4](https://github.com/steffenkoenig/sketchgit/commit/a76f1c4718ac07be195fc60d912b4fa7610795a4))
* **share-links:** address code review – remove test shim, fix null check, add safety docs ([4ff7d5c](https://github.com/steffenkoenig/sketchgit/commit/4ff7d5ce1a11452097d18bbc24fc169362a0dadf))
* **share-links:** resolve build type errors – RoomSummary role union, parseCookies conflict, test helper Partial type ([13af4d8](https://github.com/steffenkoenig/sketchgit/commit/13af4d8007f8d21e37ae7de259c5d9344b202d1e))
* Stop presenter mode and clear UI state on destroy ([#106](https://github.com/steffenkoenig/sketchgit/issues/106)) ([c8a9ff2](https://github.com/steffenkoenig/sketchgit/commit/c8a9ff216d44d1d49476db6bc1206e8f77e10b83))
* **test:** cast Path mock correctly to fix TS2339 type errors in CI ([9c3e545](https://github.com/steffenkoenig/sketchgit/commit/9c3e545a8840dcf20f41d5b4581a1c5a8d5c71d9))
* trigger object:modified for programmatic canvas object changes ([64e9337](https://github.com/steffenkoenig/sketchgit/commit/64e933731c8faa966d1fc37b1bfe7ced3a4ed69a))
* trigger object:modified for programmatic canvas object changes ([6c30b9a](https://github.com/steffenkoenig/sketchgit/commit/6c30b9a1d6eaea601ad020bb06faa79efda53b23))
* **types:** resolve TS7022 circular inference in resolveCommitCanvas ([dadbe4f](https://github.com/steffenkoenig/sketchgit/commit/dadbe4f84124513c42b919c18866132d4f6111eb))
* **ws:** add NEXT_PUBLIC_WS_URL support, fix logger empty-object noise, improve error handler ([c42a4c8](https://github.com/steffenkoenig/sketchgit/commit/c42a4c8075adaf9496aaca4a7d294a6ea5016b02))
* **ws:** commit logger/error improvements and /ws fallback route ([e24321d](https://github.com/steffenkoenig/sketchgit/commit/e24321d859d4141333b5d49cfe45cd84cf1febb1))


### Refactoring

* address code review feedback for P063-P071 ([2d309e9](https://github.com/steffenkoenig/sketchgit/commit/2d309e923a77369b74416c42189bdec72ec7844c))
* **auth:** create useAuthForm hook ([0357eb6](https://github.com/steffenkoenig/sketchgit/commit/0357eb6dbd862737b126d43ecf6414be812a6584))
* extract RegisterForm logic to useRegister hook ([7feae1a](https://github.com/steffenkoenig/sketchgit/commit/7feae1a13e46553c0d30ebc6accbfbd594c0c67c))
* **identity:** extract setBranchInUrl to userPreferences, cache prefs at startup, fix test mocks ([4d2b783](https://github.com/steffenkoenig/sketchgit/commit/4d2b78387bce18d4ab36a7e430e96542d0261163))
* **identity:** remove redundant nullish coalescing, rename shadowed variable ([b381e65](https://github.com/steffenkoenig/sketchgit/commit/b381e6592dd900464d4ba268970f6d6454dfba05))
* **user-repo:** remove leftover instructional comment ([fab5c7b](https://github.com/steffenkoenig/sketchgit/commit/fab5c7bd964f1a75d26b68660017d256bc5dc8b9))


### Documentation

* add GAP-016 through GAP-022 and update GAP-019 classification ([1d00dd8](https://github.com/steffenkoenig/sketchgit/commit/1d00dd8b32d1c8a81ac43c601f3c2d8846b70f7d))
* add implementation plans and fix lint errors ([361e07e](https://github.com/steffenkoenig/sketchgit/commit/361e07e1e0f08025b66188759a5ff8d0af8c1872))
* add implementation plans and fix lint errors ([3b02c44](https://github.com/steffenkoenig/sketchgit/commit/3b02c44f32eb1cca2b4e8e177d3bca31da83cf38))
* add implementation plans for critical next steps ([1d4949f](https://github.com/steffenkoenig/sketchgit/commit/1d4949ff185c286f00136c55d664e334c9036e50))
* add implementation plans for platform improvements ([9d2f9e0](https://github.com/steffenkoenig/sketchgit/commit/9d2f9e069fb455160a543983b2631972003f8e9c))
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
* add P091 granular share-links proposal ([f29eab1](https://github.com/steffenkoenig/sketchgit/commit/f29eab18ceadc0289ff10bbeb50e2a580ac8f33b))
* add plans and fix lint warnings in tests and canvas engine ([771d592](https://github.com/steffenkoenig/sketchgit/commit/771d5922e36068547911521fd30251cf9da77acd))
* add plans and fix lint warnings in tests and canvas engine ([86f8e86](https://github.com/steffenkoenig/sketchgit/commit/86f8e86a33e1daa4ff687db4cb8b33f9a6238589))
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
* fix linting errors for unused vars in tests and canvas engine ([d4ebf4b](https://github.com/steffenkoenig/sketchgit/commit/d4ebf4bcd9abdfe547a290765279f96dd778e359))
* fix linting errors for unused vars in tests and canvas engine ([9d2b367](https://github.com/steffenkoenig/sketchgit/commit/9d2b367cbf4c69d9ceda3e3f5dfd1287ed3e845f))
* fix linting errors for unused vars in tests and canvas engine ([894e200](https://github.com/steffenkoenig/sketchgit/commit/894e2001cb05e7fa54da871a6993949db5a10970))
* German/EU compliance gap analysis – GAP-016 through GAP-022 + GAP-019 classification ([6f9316e](https://github.com/steffenkoenig/sketchgit/commit/6f9316e426c7aef759a4acdbac1802d689da8373))
* **plan:** address review comment on license check script ([9f25a70](https://github.com/steffenkoenig/sketchgit/commit/9f25a70ca20d832a701849fae3f8609b6ab865bb))
* **proposals:** address PR review comments ([018c5d0](https://github.com/steffenkoenig/sketchgit/commit/018c5d0d66798957fc45ea586ee49f980f203c47))
* update README to reflect current app state ([326c732](https://github.com/steffenkoenig/sketchgit/commit/326c73284dec5086ab6b24af285934fcbc6db2d5))
* update README to reflect current app state ([38e1b2d](https://github.com/steffenkoenig/sketchgit/commit/38e1b2d12714fbe565a5276d83ccb5b64f3e4a96))

## [0.4.0](https://github.com/steffenkoenig/sketchgit/compare/sketchgit-next-v0.3.0...sketchgit-next-v0.4.0) (2026-05-27)


### Features

* [milestone P011] Optimize database queries ([32cf6a5](https://github.com/steffenkoenig/sketchgit/commit/32cf6a5f28aadd62143ee3a813b4e550d7c3843b))
* [milestone P011] Optimize database queries ([a34e0b5](https://github.com/steffenkoenig/sketchgit/commit/a34e0b50dd92f60f7e76a8f393d023c09abba145))
* Add React Error Boundaries for Graceful UI Failure Isolation (P081) ([45bb296](https://github.com/steffenkoenig/sketchgit/commit/45bb29617608919f73403e889dcf5aa6d4cefa7e))
* Add React Error Boundaries for Graceful UI Failure Isolation (P081) ([175585a](https://github.com/steffenkoenig/sketchgit/commit/175585aee4329cef080d3194f9e3d2f774e272d5))
* **canvas:** add doodle style for hand-drawn pen look ([c874340](https://github.com/steffenkoenig/sketchgit/commit/c87434073283cb39ced3e5c04c0ee97075f10a62))
* **canvas:** add extended shape properties for drawing tools ([be749aa](https://github.com/steffenkoenig/sketchgit/commit/be749aac8965e8f0bd9b95827e6f5e12fb1a49c8))
* **canvas:** add mermaid diagram support with line-by-line merge diff ([d495f35](https://github.com/steffenkoenig/sketchgit/commit/d495f35de0cc9727862a1db928f8c48f698766e9))
* **canvas:** address review feedback — closest-snap, Path reSnap, selection restore, rAF throttle, MERGE_PROPS ([96a5f55](https://github.com/steffenkoenig/sketchgit/commit/96a5f5503303537e22f15d60b7c0b3bb75055f37))
* **canvas:** doodle style + rounded corners for all sketch styles ([5f7cbdc](https://github.com/steffenkoenig/sketchgit/commit/5f7cbdce076f55d738d65371a8cc8d3b197cde11))
* **canvas:** link line/arrow endpoints to shapes so they follow when moved ([7906b49](https://github.com/steffenkoenig/sketchgit/commit/7906b49f320338cd1328ab12503911053c6b02f9))
* **canvas:** Mermaid diagram support with line-by-line merge diffing and per-line conflict UI ([2e9b72f](https://github.com/steffenkoenig/sketchgit/commit/2e9b72f65d3f0fa1b99b2788578194524827cb55))
* **canvas:** move shape settings to contextual properties panel ([f305fde](https://github.com/steffenkoenig/sketchgit/commit/f305fde799de316974aec631dab373c0b9c5952b))
* **canvas:** replace rectangular selection box with endpoint handles for lines and arrows ([f19f053](https://github.com/steffenkoenig/sketchgit/commit/f19f0534a5f42ca23951959ac2ab05c8809d7e94))
* **canvas:** rounded corners for artist, cartoonist, and doodle styles ([9d82cca](https://github.com/steffenkoenig/sketchgit/commit/9d82ccaa82187cd6797e4fcd5cd780204f25499a))
* **canvas:** snap existing lines/arrows to shapes when moved (object:modified) ([fb25217](https://github.com/steffenkoenig/sketchgit/commit/fb25217c1398f375dd2aa256f98d5919fa13a825))
* **canvas:** snap line/arrow endpoints to shape borders not just centers ([75ed67d](https://github.com/steffenkoenig/sketchgit/commit/75ed67dd09693320c6561fab2521dfc0674a27ac))
* **canvas:** snap/attach existing lines and arrows to shapes after creation ([f48d352](https://github.com/steffenkoenig/sketchgit/commit/f48d352c0b890e10c6284f0c18535ac96a6e31b6))
* **merge:** show individual conflicting mermaid lines in conflict UI ([439d062](https://github.com/steffenkoenig/sketchgit/commit/439d0622a47ac3c0b43bad44fadede13d9a44308))
* migrate client events from WebSocket to REST API (P-REST) ([baff39c](https://github.com/steffenkoenig/sketchgit/commit/baff39c0dd6edb08d717bba7a5210d1e8995e780))
* REST-based event architecture — WebSocket becomes receive-only ([6e63ec9](https://github.com/steffenkoenig/sketchgit/commit/6e63ec9c24870221bbe9ea7a0761d7938c751196))


### Bug Fixes

* 'process' is not defined error in ErrorFallback.tsx ([76eea29](https://github.com/steffenkoenig/sketchgit/commit/76eea29e7d71c89837bb8739871afd3b8670a963))
* address code review issues (wsClientId guard, object-lock color dedup, validation logger) ([9c01746](https://github.com/steffenkoenig/sketchgit/commit/9c01746a2b180278aa9d239a7b8188ffec49486f))
* apply fill on toggleFill, add strokeUniform to prevent scaling ([02f7d69](https://github.com/steffenkoenig/sketchgit/commit/02f7d69da362d6dd5686a085f7700424c23ec9aa))
* apply open redirect protection to useRegister hook and revert next-env.d.ts ([c6cd52e](https://github.com/steffenkoenig/sketchgit/commit/c6cd52ec72fef6bd5859e91550e476606bd6a951))
* background fill not applied on toggle; stroke width scales on resize ([4608a28](https://github.com/steffenkoenig/sketchgit/commit/4608a28450ae463691e2b9abdb25923dc3b1bc34))
* **build:** dynamic import canvasRenderer to prevent fabric/node at build time ([b8d4479](https://github.com/steffenkoenig/sketchgit/commit/b8d44798993b6b1b79a0ae18bc53f3f964df6b15))
* **build:** move ExportQuerySchema to break canvasRenderer build-time dependency chain ([f98acf7](https://github.com/steffenkoenig/sketchgit/commit/f98acf77c66197f514994d2203458352288ab1f2))
* **build:** restore roomId for ShareModal using window.location.search on open ([c0d9544](https://github.com/steffenkoenig/sketchgit/commit/c0d9544182062db4857b1e0f77d5e1848d5c252f))
* cancel lock-expire timers and fix lint error ([7f477e3](https://github.com/steffenkoenig/sketchgit/commit/7f477e37c2e0c0284c338a1aeb8214caa630fde2))
* **canvas:** add descriptive comments to catch blocks in endpoint control methods ([95a2e7a](https://github.com/steffenkoenig/sketchgit/commit/95a2e7ad0e5aeee90ea6d78f401dc513454592d8))
* **canvas:** address code review feedback for mermaid implementation ([16dd4e9](https://github.com/steffenkoenig/sketchgit/commit/16dd4e94175056ac56c79902725231b4f46d212a))
* **canvas:** address code review issues in shape properties feature ([7c33aed](https://github.com/steffenkoenig/sketchgit/commit/7c33aed53edcf470be113faff4f078447d8219f0))
* **canvas:** address PR review – position fix, URL sanitisation, arrow rebuild, a11y, i18n ([498219d](https://github.com/steffenkoenig/sketchgit/commit/498219d140457f79c17598fce078c2e82655cae9))
* **canvas:** address review comments on endpoint controls ([d226420](https://github.com/steffenkoenig/sketchgit/commit/d22642007e9bee1f454fb5acb8cb2e8283be5754))
* **canvas:** arrow rebuild mid-drag no longer disrupts shape movement or discards in-progress arrows ([6e463b4](https://github.com/steffenkoenig/sketchgit/commit/6e463b47f9520b13204367cb1187b080eb66ff2b))
* **canvas:** Backspace/Delete deletes all selected shapes, not just one ([adefd30](https://github.com/steffenkoenig/sketchgit/commit/adefd30c22bbcc5318f5d1f64a7c76ec046707dc))
* **canvas:** cancel pending attachment rAF on snap rebuild ([#107](https://github.com/steffenkoenig/sketchgit/issues/107)) ([38deb39](https://github.com/steffenkoenig/sketchgit/commit/38deb39a388d3a70746b891921afeb369c9565f0))
* **canvas:** delete all selected objects on Backspace/Delete key ([56d9a92](https://github.com/steffenkoenig/sketchgit/commit/56d9a92a536d40b480ba8278c4a8540c595a17b2))
* **canvasEngine.test:** remove unused _onBroadcastDraw destructuring ([426ec61](https://github.com/steffenkoenig/sketchgit/commit/426ec6135cf45cc957d44ae6ba1e2e70efdeb82b))
* **canvas:** exclude eraser from e.target guard and add undoStack assertion to test ([c0cfb83](https://github.com/steffenkoenig/sketchgit/commit/c0cfb83900f13a70bad4ceb410b4e8be97c5a2e0))
* **canvas:** fill-pattern on existing shapes, link save+dblclick, real sloppiness for all shapes ([1d59cbf](https://github.com/steffenkoenig/sketchgit/commit/1d59cbfd94e374bfbccc3a91df769d687bb0d41a))
* **canvas:** fill-pattern on existing shapes, link serialisation + dblclick, sloppiness for all shapes with real hand-drawn rendering ([d56a86e](https://github.com/steffenkoenig/sketchgit/commit/d56a86ef581399cf51853e15337af2ab12c59c6d))
* **canvas:** fix arrow endpoint drag by rebuilding group children in-place ([40c2767](https://github.com/steffenkoenig/sketchgit/commit/40c27677e2840a19d9a3f9156802ae56b87351ae))
* **canvas:** fix mermaid SVG size – diagrams no longer cut off ([44621fb](https://github.com/steffenkoenig/sketchgit/commit/44621fb70b99d4faf95da9b39e4bf5bf96f6196b))
* **canvas:** line, arrow, and sketch-path endpoint handles now drag correctly ([ecf5e35](https://github.com/steffenkoenig/sketchgit/commit/ecf5e35d3fd7845ab684835170e53648ca855161))
* **canvas:** prevent new shape creation when interacting with existing objects while a drawing tool is active ([2c3190a](https://github.com/steffenkoenig/sketchgit/commit/2c3190a60d372662d512795e2e4a273f728165cf))
* **canvas:** skip new-shape creation when mouse:down hits an existing object ([eb6f543](https://github.com/steffenkoenig/sketchgit/commit/eb6f54372fa795e9ac9c9232a9b405b6260cf046))
* **canvas:** snap line endpoints for artist/cartoonist styles and track movement ([067c798](https://github.com/steffenkoenig/sketchgit/commit/067c7987c5d6c5e68bbd81b5e5eb7f4bb5903f4d))
* **canvas:** sync engine state on selection, r=3 for sharp, fill gating, opacity in arrowheads ([b2febbb](https://github.com/steffenkoenig/sketchgit/commit/b2febbba1bc7314cbe971dd194929576ebd6ac82))
* **canvas:** use preserved strokeLineCap/strokeLineJoin for curved/elbow arrows too ([29be48e](https://github.com/steffenkoenig/sketchgit/commit/29be48eb706125c12fcda63a87d5489df563ca13))
* **ci:** declare process as global to resolve no-undef lint error in browser files ([786fa0e](https://github.com/steffenkoenig/sketchgit/commit/786fa0e5dba0944163589d4c9a0daa8dfb0214b3))
* **ErrorFallback:** consistently use simple process.env check (process is global) ([6574c0e](https://github.com/steffenkoenig/sketchgit/commit/6574c0eadcf4c39099dcf95de7a147b5a2d2fcb6))
* **ErrorFallback:** remove redundant declare const process ([8e83d70](https://github.com/steffenkoenig/sketchgit/commit/8e83d702b7de531aab8a58ebd8c78f5e51aae84f))
* **ErrorFallback:** remove redundant typeof process guard and eslint-disable comment ([e25003a](https://github.com/steffenkoenig/sketchgit/commit/e25003acf325b9122a474ea650bd72cf97334cad))
* **ErrorFallback:** remove stale eslint workarounds (process is declared global) ([0e0a6bd](https://github.com/steffenkoenig/sketchgit/commit/0e0a6bd2f736d42e3b64ba454cf6363898e46e8a))
* **ErrorFallback:** revert eslint-disable and typeof guard (redundant, process is declared global) ([0d37aa7](https://github.com/steffenkoenig/sketchgit/commit/0d37aa7ce54332405ee26875cd3436228b1a6a31))
* **ErrorFallback:** simplify process guard - global process already declared via eslint config ([9a11e74](https://github.com/steffenkoenig/sketchgit/commit/9a11e74470c47b5b757c48ce0fcf4d9147b542c7))
* **ErrorFallback:** simplify process.env check - process is now a declared global ([ff36b9c](https://github.com/steffenkoenig/sketchgit/commit/ff36b9cfa077edf3187c14705247cb04000087eb))
* **errors:** address PR code review feedback ([d2bb34b](https://github.com/steffenkoenig/sketchgit/commit/d2bb34be506c0231e4db906c20d490415951b4b1))
* eslint error on process global variable ([db1bcda](https://github.com/steffenkoenig/sketchgit/commit/db1bcdaccb1b1df9f85c0bfb35851f8bda7782a3))
* **export:** bypass DB for canvas export; fix ShareModal roomId stale ref ([2ebb8a2](https://github.com/steffenkoenig/sketchgit/commit/2ebb8a255e47aa701bbe543d26f085d0f01687f2))
* **export:** fetch-based download reads live room ID; shows toast on error ([77ce248](https://github.com/steffenkoenig/sketchgit/commit/77ce248f9be6e7e1f5e7ef46e2b506a5195fc7ea))
* **export:** post endpoint with live canvas JSON bypasses DB dependency ([e152161](https://github.com/steffenkoenig/sketchgit/commit/e152161ec210f6c03e383061a442522e874d767f))
* **export:** use fabric/node entry point to fix PNG/SVG/PDF download failures ([c148571](https://github.com/steffenkoenig/sketchgit/commit/c1485713e41e42949a31b981d589318ad33f957e))
* **lint:** fix unused variables to pass ci build ([9a7023f](https://github.com/steffenkoenig/sketchgit/commit/9a7023fdbf3cd89840776087f9cf394c6a943875))
* **lint:** process is not defined in ErrorFallback ([813ea13](https://github.com/steffenkoenig/sketchgit/commit/813ea1363629d8e5bec5c691ee8c02be1a8e5de9))
* **lint:** process is not defined in ErrorFallback ([4d12267](https://github.com/steffenkoenig/sketchgit/commit/4d1226720eed5e359d6314374158c5129174fb7f))
* **merge:** address 3 review comments from commit 7bd8f1a ([8f23cb1](https://github.com/steffenkoenig/sketchgit/commit/8f23cb188d934f49d94c5c8e110dd9d5759f7153))
* **merge:** address 4 review comments on canvasEngine and mergeCoordinator ([7bd8f1a](https://github.com/steffenkoenig/sketchgit/commit/7bd8f1a39783c31783251bdf0020fa4fbd671a8a))
* prevent arrow group rebuild from disrupting drag-tracking ([16c2643](https://github.com/steffenkoenig/sketchgit/commit/16c264336a078ea0be777344ca84ef97be71d722))
* prevent arrow group rebuild from disrupting drag-tracking ([862107a](https://github.com/steffenkoenig/sketchgit/commit/862107a64759c7229f408b0a39ed7c54fb3066aa))
* prevent arrow group rebuild from disrupting drag-tracking ([adf012a](https://github.com/steffenkoenig/sketchgit/commit/adf012a6541aab5e975d29c8edac2a647c4b5fb9))
* prevent infinite arrow rebuild loop when attaching arrows to shapes post-creation ([f02e88a](https://github.com/steffenkoenig/sketchgit/commit/f02e88a80ee13f22ccc947c5459dfa05fe72daa8))
* prevent infinite arrow rebuild loop when attaching arrows to shapes post-creation ([1f4df65](https://github.com/steffenkoenig/sketchgit/commit/1f4df65754ef68bf3bdcea7ccb97543387fef3d1))
* Prevent new shape creation when clicking on existing object ([#91](https://github.com/steffenkoenig/sketchgit/issues/91)) ([1ec5560](https://github.com/steffenkoenig/sketchgit/commit/1ec5560f1bb4962604dc59a2c9056907f56ac6c5))
* prevent TOCTOU race in websocket invitation handling (BUG-004) ([1ea2962](https://github.com/steffenkoenig/sketchgit/commit/1ea29620eeb12dd887dccdee594c7344d2ab6074))
* resolve process not defined in components/errors/ErrorFallback.tsx ([01bf514](https://github.com/steffenkoenig/sketchgit/commit/01bf5144203d9ef41abe95245563c48ca174ed76))
* resolve process undefined error in ErrorFallback ([7112ac0](https://github.com/steffenkoenig/sketchgit/commit/7112ac02f68df460efaf636c9ec5beceb86f58e6))
* resolve process undefined error in ErrorFallback ([fe7a11d](https://github.com/steffenkoenig/sketchgit/commit/fe7a11dba3129db925df595e8f12d3875cadca04))
* restore allowedOrigins extraction lost during conflict resolution ([ae3572a](https://github.com/steffenkoenig/sketchgit/commit/ae3572ae7edc9cff45d3026ae8e16a974c58edd7))
* Stop presenter mode and clear UI state on destroy ([#106](https://github.com/steffenkoenig/sketchgit/issues/106)) ([c8a9ff2](https://github.com/steffenkoenig/sketchgit/commit/c8a9ff216d44d1d49476db6bc1206e8f77e10b83))
* **test:** cast Path mock correctly to fix TS2339 type errors in CI ([9c3e545](https://github.com/steffenkoenig/sketchgit/commit/9c3e545a8840dcf20f41d5b4581a1c5a8d5c71d9))
* trigger object:modified for programmatic canvas object changes ([64e9337](https://github.com/steffenkoenig/sketchgit/commit/64e933731c8faa966d1fc37b1bfe7ced3a4ed69a))
* trigger object:modified for programmatic canvas object changes ([6c30b9a](https://github.com/steffenkoenig/sketchgit/commit/6c30b9a1d6eaea601ad020bb06faa79efda53b23))


### Refactoring

* **auth:** create useAuthForm hook ([0357eb6](https://github.com/steffenkoenig/sketchgit/commit/0357eb6dbd862737b126d43ecf6414be812a6584))
* extract RegisterForm logic to useRegister hook ([7feae1a](https://github.com/steffenkoenig/sketchgit/commit/7feae1a13e46553c0d30ebc6accbfbd594c0c67c))
* **user-repo:** remove leftover instructional comment ([fab5c7b](https://github.com/steffenkoenig/sketchgit/commit/fab5c7bd964f1a75d26b68660017d256bc5dc8b9))


### Documentation

* add implementation plans and fix lint errors ([361e07e](https://github.com/steffenkoenig/sketchgit/commit/361e07e1e0f08025b66188759a5ff8d0af8c1872))
* add implementation plans and fix lint errors ([3b02c44](https://github.com/steffenkoenig/sketchgit/commit/3b02c44f32eb1cca2b4e8e177d3bca31da83cf38))
* add implementation plans for critical next steps ([1d4949f](https://github.com/steffenkoenig/sketchgit/commit/1d4949ff185c286f00136c55d664e334c9036e50))
* add implementation plans for platform improvements ([9d2f9e0](https://github.com/steffenkoenig/sketchgit/commit/9d2f9e069fb455160a543983b2631972003f8e9c))
* add plans and fix lint warnings in tests and canvas engine ([771d592](https://github.com/steffenkoenig/sketchgit/commit/771d5922e36068547911521fd30251cf9da77acd))
* add plans and fix lint warnings in tests and canvas engine ([86f8e86](https://github.com/steffenkoenig/sketchgit/commit/86f8e86a33e1daa4ff687db4cb8b33f9a6238589))
* fix linting errors for unused vars in tests and canvas engine ([d4ebf4b](https://github.com/steffenkoenig/sketchgit/commit/d4ebf4bcd9abdfe547a290765279f96dd778e359))
* fix linting errors for unused vars in tests and canvas engine ([9d2b367](https://github.com/steffenkoenig/sketchgit/commit/9d2b367cbf4c69d9ceda3e3f5dfd1287ed3e845f))
* fix linting errors for unused vars in tests and canvas engine ([894e200](https://github.com/steffenkoenig/sketchgit/commit/894e2001cb05e7fa54da871a6993949db5a10970))
* **plan:** address review comment on license check script ([9f25a70](https://github.com/steffenkoenig/sketchgit/commit/9f25a70ca20d832a701849fae3f8609b6ab865bb))
* **proposals:** address PR review comments ([018c5d0](https://github.com/steffenkoenig/sketchgit/commit/018c5d0d66798957fc45ea586ee49f980f203c47))

## [0.3.0](https://github.com/steffenkoenig/sketchgit/compare/sketchgit-next-v0.2.0...sketchgit-next-v0.3.0) (2026-03-14)


### Features

* **collab:** generate random UUID room ID for first-time visitors ([fe3964d](https://github.com/steffenkoenig/sketchgit/commit/fe3964deee505f47d4945a1943d79c17586a3697))
* export dropdown, locale dropdown, topbar SVG icons ([fee444a](https://github.com/steffenkoenig/sketchgit/commit/fee444ad1a094f2037d04c8da48ebb9ea2c352db))
* generate random UUID room ID for first-time visitors + fix TS build ([413a701](https://github.com/steffenkoenig/sketchgit/commit/413a7018ca02cd4f7236f4f03d3e405f48a5883a))
* Topbar export dropdown, language dropdown, and SVG icons — with portal fix for canvas overlap ([27082ef](https://github.com/steffenkoenig/sketchgit/commit/27082efca0133fcbca2647aa96066ae1c25c8806))


### Bug Fixes

* add loadLastRoomId to userPreferences mock in app.test.ts ([f0171f5](https://github.com/steffenkoenig/sketchgit/commit/f0171f5f6f82ff2a76c364beb0061bffe4ee8199))
* address PR review - uuid in deps, loadLastRoomId helper, test fixes ([25056ed](https://github.com/steffenkoenig/sketchgit/commit/25056edfae6d06cb8b8f30cc3b0f570bc7d4dae0))
* **deps:** add @types/uuid to resolve TypeScript build error ([f9f5f66](https://github.com/steffenkoenig/sketchgit/commit/f9f5f66abd39164269684870cc3544da34ccdbd1))
* localeDropdown ARIA + keyboard nav + localize all auth pages ([b0d3d22](https://github.com/steffenkoenig/sketchgit/commit/b0d3d225716ec1f172df40a72a7f97901e5d5eab))
* render topbar dropdowns via React portal so they appear above canvas ([0301268](https://github.com/steffenkoenig/sketchgit/commit/0301268bb1cf5211618a0c61dd1a3c1c75865e72))

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
