# SketchGit

[![CI](https://github.com/steffenkoenig/sketchgit/actions/workflows/ci.yml/badge.svg)](https://github.com/steffenkoenig/sketchgit/actions/workflows/ci.yml)

SketchGit is a Next.js 16 collaborative whiteboard that feels like a lightweight Git client for drawings.
It combines freeform sketching with version control concepts such as commits, branches, checkout, rollback, and merges — all persisted to a PostgreSQL database and synchronized in real time via WebSockets.

## What It Does

- Draw on a shared canvas with pen, lines, arrows, rectangles, ellipses, text, and eraser tools.
- Stroke width, stroke color, and fill color are individually configurable.
- Create commits from your drawing state with a custom commit message.
- Create and switch branches to explore ideas without losing previous work.
- Visualize history in a virtualized timeline with branch labels and merge nodes.
- Checkout old commits in detached HEAD mode and branch from any point in history.
- Roll back a branch to any previous commit.
- Merge branches using a 3-way merge engine with per-property conflict resolution.
- Collaborate live with multiple users: presence indicators, live cursor tracking, real-time draw-delta sync, and server-authoritative full-state sync on connect.
- Invite collaborators via single-use signed invitation tokens.
- Export the current canvas as PNG, SVG, or PDF.
- Undo and redo drawing actions (Ctrl+Z / Ctrl+Y), broadcast to collaborators.
- Soft-lock individual objects to prevent concurrent edits by other users.
- Follow a presenter's viewport in real time (presenter follow mode).
- User preferences (display name, last branch) are persisted across sessions.
- Dashboard view listing all rooms owned or shared with the signed-in user.
- Room activity feed (audit log) tracking commits, checkouts, rollbacks, and member join/leave events.
- Light and dark theme toggle, persisted in a cookie.
- Internationalisation: English and German UI.
- Mobile-optimized layout with pinch-to-zoom support on touch devices.

## Tech Stack

- **Next.js 16** (App Router) — React 19
- **Custom Node.js server** (`server.ts`) combining Next.js HTTP and a `ws` WebSocket server
- **Fabric.js 7** (npm) for canvas rendering and object editing
- **PostgreSQL** via **Prisma 7** for persistent storage (commits, branches, rooms, users)
- **Redis** pub/sub for multi-instance presence and cross-server message relay
- **NextAuth v5** for anonymous-first authentication (credentials, GitHub OAuth, password reset)
- **Zod 4** for runtime validation of API requests and WebSocket messages
- **Pino** for structured server-side logging
- **next-intl** for i18n (EN / DE)
- **Tailwind CSS 4** + shadcn/ui components
- **Vitest** for unit tests, **Playwright** for E2E tests

## Project Structure

```
app/
  api/             # Next.js route handlers (auth, rooms, commits, export, docs, invitations)
  auth/            # Sign-in, register, forgot/reset-password pages
  dashboard/       # User drawing collection page
  layout.tsx       # Root layout (viewport, CSP nonce, theme, i18n)
  page.tsx         # Main canvas page
components/
  sketchgit/       # AppTopbar, LeftToolbar
  auth/            # Auth forms and buttons
  dashboard/       # Room rename button
  ui/              # shadcn/ui primitives
lib/
  sketchgit/       # Browser-side canvas engine, git model, coordinators, real-time
  db/              # Prisma repositories (roomRepository, userRepository)
  server/          # Server-only helpers (CSP, sanitizers, invitation tokens)
  api/             # Zod schemas, validate(), apiError(), cache headers, OpenAPI
  auth.ts          # NextAuth v5 configuration
  env.ts           # Environment variable validation (Zod)
  redis.ts         # Redis client (standalone / sentinel / cluster)
server.ts          # Combined Next.js + WebSocket server entrypoint
proxy.ts           # Next.js middleware (rate limiting, CSP nonce, auth redirects, origin validation)
prisma/schema.prisma
```

## Requirements

- **Node.js ≥ 22**
- **PostgreSQL 14+**
- **Redis 7+** (optional — required only for multi-instance deployments)

## Run Locally

1. Copy the example environment file and fill in the required values:

```bash
cp .env.example .env
```

Required variables: `DATABASE_URL`, `AUTH_SECRET` (≥ 32 chars), `NEXTAUTH_URL`.

2. Start the database (and optional Redis) using Docker Compose:

```bash
docker compose up -d db redis
```

3. Install dependencies and apply database migrations:

```bash
npm install
npm run db:migrate
```

4. Start the development server:

```bash
npm run dev
```

5. Open http://localhost:3000 in your browser.

6. Share a room by adding `?room=my-session` to the URL, or create an invitation link from the collaboration panel.

## Run with Docker

Build and start the full stack (app + PostgreSQL + Redis) in one command:

```bash
docker compose up --build
```

Migrations are applied automatically on container startup.

## Typical Workflow

1. Open the canvas (no account required).
2. Draw or edit objects using the left toolbar.
3. Click **Commit** to save a snapshot with a message.
4. Click **Branch** to create a new branch for an experiment.
5. Continue drawing and commit on the new branch.
6. Click **Merge** to merge the branch back; resolve any per-property conflicts in the conflict modal.
7. Use the timeline to inspect history, checkout any commit, or roll back a branch.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `S` | Select tool |
| `P` | Pen tool |
| `L` | Line tool |
| `A` | Arrow tool |
| `R` | Rectangle tool |
| `E` | Ellipse tool |
| `T` | Text tool |
| `X` | Eraser tool |
| `+` | Zoom in |
| `-` | Zoom out |
| `0` | Reset zoom |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Delete` / `Backspace` | Remove selected object |

## API

All REST endpoints follow the pattern documented in the interactive OpenAPI reference at `/api/docs` (Scalar UI). The machine-readable spec is available at `/api/docs/openapi.json`.

Key endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/register` | Create a credentials account |
| `POST` | `/api/auth/forgot-password` | Request a password-reset email |
| `POST` | `/api/auth/reset-password` | Consume a reset token and set a new password |
| `DELETE` | `/api/auth/account` | Delete the authenticated user's account (GDPR) |
| `GET` | `/api/rooms/[roomId]/commits` | Paginated commit history (cursor-based) |
| `GET` | `/api/rooms/[roomId]/export?format=png\|svg\|pdf` | Export canvas as image or document |
| `GET` | `/api/rooms/[roomId]/events` | Room activity feed (audit log) |
| `POST` | `/api/rooms/[roomId]/invitations` | Create a signed invitation token |
| `DELETE` | `/api/rooms/[roomId]/invitations` | Revoke an invitation token |
| `GET` | `/api/invitations/[token]` | Validate an invitation token and join a room |
| `GET` | `/api/health` | Liveness probe |
| `GET` | `/api/ready` | Readiness probe |

## Live Collaboration Model

- Every client connects to `/ws` and joins a room identified by `?room=<id>`.
- The server broadcasts presence, cursor positions, draw-delta updates, commits, branch switches, and rollbacks to all room members.
- New clients receive a full server-authoritative canvas state sync on connect.
- Messages are batched via `queueMicrotask` to reduce WebSocket frame overhead.
- Per-message zlib compression is enabled for payloads above 1 KB (configurable via `WS_COMPRESSION_THRESHOLD`).
- Room capacity is enforced server-side (`MAX_CLIENTS_PER_ROOM`, default 50).
- For multi-instance deployments, Redis pub/sub relays messages across instances.

## Merge Model

SketchGit tracks canvas objects with stable internal IDs.
During a merge, it compares base, target, and source snapshots (3-way merge):

- Objects added or removed only on one side are applied automatically.
- Conflicting property changes on the same object are presented in a conflict modal.
- You choose per property whether to keep `ours` or `theirs`.

## Authentication

- **Anonymous-first**: users can draw without an account.
- **Credentials**: email + password (argon2id hashing). Password reset via email (Resend).
- **GitHub OAuth**: sign in with a GitHub account.
- **GDPR account deletion**: users can permanently delete their account and all associated data from the dashboard.
- Room access control supports three roles: `OWNER`, `EDITOR`, `VIEWER`.

## Security

- Content-Security-Policy with per-request nonces (no `'unsafe-inline'`).
- WebSocket origin validation to prevent cross-site WebSocket hijacking.
- Per-IP rate limiting on authentication endpoints (configurable via `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW`).
- Signed, expiring invitation tokens (HMAC-SHA256).
- Docker images pinned to SHA256 digests; Trivy vulnerability scanning in CI.
- See [SECURITY.md](SECURITY.md) for the vulnerability reporting policy.

## Environment Variables

All variables are validated at startup via `lib/env.ts`. Copy `.env.example` for a full reference with descriptions. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection URL |
| `AUTH_SECRET` | ✅ | NextAuth signing secret (≥ 32 chars) |
| `NEXTAUTH_URL` | ✅ | Canonical deployment URL |
| `REDIS_URL` | — | Redis URL (required for multi-instance) |
| `REDIS_MODE` | — | `standalone` (default), `sentinel`, or `cluster` |
| `GITHUB_ID` / `GITHUB_SECRET` | — | GitHub OAuth credentials |
| `RESEND_API_KEY` / `EMAIL_FROM` | — | Email sending for password reset |
| `MAX_CLIENTS_PER_ROOM` | — | Max WebSocket clients per room (default: 50) |
| `INVITATION_SECRET` | — | HMAC secret for invitation tokens |
| `ROOM_EVENT_RETENTION_DAYS` | — | Activity feed retention in days (default: 90) |
| `SLOW_QUERY_MS` | — | Prisma slow-query log threshold in ms (default: 500) |
| `PORT` | — | HTTP/WS listen port (default: 3000) |

## Development

```bash
npm test              # Run Vitest unit tests
npm run test:coverage # Unit tests with coverage report
npm run test:e2e      # Playwright end-to-end tests
npm run lint          # ESLint
npm run build         # Production build
npm run db:migrate:dev # Create a new Prisma migration
npm run db:studio     # Open Prisma Studio
```

Coverage thresholds: 70% lines / functions / statements, 69% branches.

## Project Goal

SketchGit makes version-control ideas tangible for visual work.
It is a fully functional collaborative drawing application and a reference implementation of Git-like workflows (commits, branches, merges, detached HEAD, rollback) applied to a shared canvas.
