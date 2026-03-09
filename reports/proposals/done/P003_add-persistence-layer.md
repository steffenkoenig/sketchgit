# P003 – Add a Persistence Layer

## Title
Add a Persistence Layer (PostgreSQL + Prisma)

## Brief Summary
All application state—commit history, branches, canvas snapshots, and room membership—is held exclusively in server and browser memory. A server restart or a browser navigation wipes everything permanently. Introducing a PostgreSQL database managed through the Prisma ORM will ensure that work is durable, rooms can be resumed, and the system can recover gracefully from failures.

## Technology Decision
**Database**: PostgreSQL  
**ORM / Data Access**: Prisma (schema-first, type-safe, migration-capable)

PostgreSQL provides full ACID guarantees, native JSON column support (useful for canvas snapshots), horizontal scalability, and a mature ecosystem. Prisma adds a declarative schema, auto-generated TypeScript client, and a managed migration workflow that fits well with the Next.js / TypeScript stack already in use.

## Current Situation
The server (`server.mjs`) maintains an in-memory `Map` of rooms. Each room holds socket references but no stored history. The client-side Git state (commits, branches, HEAD) is built up in JavaScript variables within the browser tab and is never written to any durable medium.

The README acknowledges this explicitly: "Project state is currently in memory only."

## Problem with Current Situation
- **Total data loss on server restart**: Every active session and all commit history disappear when the server process restarts, whether due to a crash, deployment, or scheduled maintenance.
- **Inability to resume work**: Users cannot close the browser tab and return to their work later. There is no concept of "save" or "load."
- **No collaboration resumption**: If the WebSocket connection drops, a returning user finds an empty board rather than the last known state.
- **Single point of failure**: The server holds the only copy of room state, so a crash is unrecoverable.
- **Unusable for real projects**: Any creative or educational work done with the tool is permanently at risk.

## Goal to Achieve
Provide durable storage of room state so that:
1. A server restart does not destroy any user's work.
2. Users can close and reopen the browser and find their canvas and commit history intact.
3. New users joining an existing room receive the persisted history, not just a blank slate.
4. The system can be deployed to a production environment reliably.
5. The data model is type-safe end-to-end through Prisma's generated client.

## What Needs to Be Done

### 1. Install Prisma and configure the database connection

```bash
npm install prisma @prisma/client
npx prisma init
```

`prisma init` creates:
- `prisma/schema.prisma` – the canonical schema file.
- `.env` – with a `DATABASE_URL` placeholder (gitignored).

Set the provider to `postgresql` in `schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 2. Define the Prisma schema

Create the full data model in `prisma/schema.prisma`. This schema covers both the persistence (P003) and authentication (P007) needs so that the database is set up holistically:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── User accounts (optional – see P007) ────────────────────────────────────

model User {
  id            String   @id @default(cuid())
  email         String?  @unique
  displayName   String
  passwordHash  String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  ownedRooms    Room[]           @relation("RoomOwner")
  memberships   RoomMembership[]
  sessions      Session[]
  commits       Commit[]
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

// ─── Rooms ───────────────────────────────────────────────────────────────────

model Room {
  id           String   @id @default(cuid())
  slug         String?  @unique  // human-friendly alias, optional
  ownerId      String?           // NULL for anonymous-created rooms
  isPublic     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  owner        User?            @relation("RoomOwner", fields: [ownerId], references: [id], onDelete: SetNull)
  memberships  RoomMembership[]
  commits      Commit[]
  branches     Branch[]
  roomState    RoomState?
}

model RoomMembership {
  roomId    String
  userId    String
  role      MemberRole @default(EDITOR)
  joinedAt  DateTime   @default(now())

  room      Room       @relation(fields: [roomId], references: [id], onDelete: Cascade)
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([roomId, userId])
}

enum MemberRole {
  OWNER
  EDITOR
  VIEWER
}

// ─── Git model ───────────────────────────────────────────────────────────────

model Commit {
  sha          String   @id
  roomId       String
  parentSha    String?            // NULL for the initial commit
  branch       String
  message      String
  canvasJson   Json               // Fabric.js canvas snapshot (PostgreSQL JSONB)
  authorId     String?            // NULL for anonymous commits
  createdAt    DateTime @default(now())

  room         Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  author       User?    @relation(fields: [authorId], references: [id], onDelete: SetNull)
  parent       Commit?  @relation("CommitParent", fields: [parentSha], references: [sha])
  children     Commit[] @relation("CommitParent")
}

model Branch {
  roomId    String
  name      String
  headSha   String

  room      Room   @relation(fields: [roomId], references: [id], onDelete: Cascade)

  @@id([roomId, name])
}

model RoomState {
  roomId      String   @id
  headSha     String?
  headBranch  String?
  isDetached  Boolean  @default(false)
  updatedAt   DateTime @updatedAt

  room        Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
}
```

Key design choices:
- `canvasJson` uses the PostgreSQL `Json` type (stored as `JSONB` – binary JSON with indexing support), which avoids double-serialization and supports future JSON-path queries.
- `authorId` and `ownerId` are nullable to support fully anonymous use.
- The `Commit` self-relation (`CommitParent`) models the parent-child commit chain directly.

### 3. Generate the Prisma client and create the first migration

```bash
npx prisma migrate dev --name init
npx prisma generate
```

`migrate dev` creates a timestamped SQL migration file in `prisma/migrations/`, applies it to the development database, and regenerates the Prisma client. This becomes the authoritative migration history.

For CI and production:
```bash
npx prisma migrate deploy   # applies pending migrations without prompts
```

### 4. Create the data access layer

Create `lib/db/` with the following files:

**`lib/db/prisma.ts`** – singleton Prisma client (prevents connection pool exhaustion in Next.js dev mode):
```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ['warn', 'error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

**`lib/db/roomRepository.ts`** – all room/commit/branch operations:
- `getOrCreateRoom(id)` – upsert a room record on first join.
- `saveCommit(commit)` – insert a commit and update the branch pointer in a transaction.
- `getFullRoomState(roomId)` – fetch all commits and branches for a room (used for `fullsync`).
- `updateRoomState(roomId, headSha, headBranch, isDetached)` – update HEAD pointer.
- `pruneInactiveRooms(olderThanDays)` – delete rooms with no activity.

**`lib/db/userRepository.ts`** (for P007):
- `createUser(email, displayName, passwordHash)`.
- `findUserByEmail(email)`.
- `createSession(userId)` – generates token, sets expiry.
- `validateSession(token)` – returns user if token is valid and not expired.

### 5. Integrate persistence into the server message handlers

Update `server.mjs` to call the repository functions at the right points:

| Event | Action |
|-------|--------|
| First client joins a room | `roomRepository.getOrCreateRoom(roomId)` |
| `commit` message received | `roomRepository.saveCommit(...)` inside a Prisma transaction |
| `fullsync-request` with no active peers | `roomRepository.getFullRoomState(roomId)` to serve from DB |
| Server startup | Optional: warm in-memory cache from recently active rooms |
| Room reaches 0 clients | Record last-active timestamp for cleanup job |

### 6. Add client-side persistence (secondary, optional)
Use the browser's `localStorage` or `IndexedDB` to persist a lightweight snapshot of the current session locally:
- Acts as an offline fallback when the server is unreachable.
- Allows single-user work without a server connection.
- Sync to server when reconnected.

### 7. Data retention policy
Define a periodic cleanup job to purge rooms that have been inactive for a configurable period (default: 30 days):
- Run as a scheduled Node.js script, a cron job, or a Next.js API route triggered by a cron service.
- Deletes room, cascade-deletes all commits and branches via the foreign key `onDelete: Cascade`.
- Log deletions for auditing purposes.

### 8. Environment and infrastructure

**Development**: Run a local PostgreSQL instance via Docker Compose:
```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: sketchgit
      POSTGRES_USER: sketchgit
      POSTGRES_PASSWORD: dev_password
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

**Production**: Use a managed PostgreSQL service (e.g., Neon, Supabase, Railway, AWS RDS, or Render). Set `DATABASE_URL` as an environment variable following 12-factor app principles.

## What Components Are Affected
| Component | Impact |
|-----------|--------|
| `prisma/schema.prisma` | New canonical schema file (source of truth for DB structure) |
| `prisma/migrations/` | Auto-generated SQL migrations created by `prisma migrate dev` |
| `lib/db/prisma.ts` | New Prisma client singleton |
| `lib/db/roomRepository.ts` | New data access layer for rooms, commits, branches |
| `lib/db/userRepository.ts` | New data access layer for users and sessions (P007) |
| `server.mjs` | Add DB calls on commit, sync, and room events |
| `package.json` | Add `prisma` and `@prisma/client` as dependencies |
| `.env` / `.env.example` | Add `DATABASE_URL` variable |
| `docker-compose.yml` | New file for local PostgreSQL development setup |
| WebSocket message protocol | No changes required; server handles persistence transparently |
| `components/SketchGitApp.tsx` | No changes needed; client behaviour is unchanged |

## Additional Considerations

### Migration from in-memory
Because the current system has no persisted data, there is no migration of existing data—the schema can be created fresh with `prisma migrate dev --name init`.

### Prisma migrations in CI/CD
Add `npx prisma migrate deploy` as a step in the deployment pipeline before the server starts. This ensures pending migrations are always applied before the new server code runs.

### PostgreSQL JSONB for canvas snapshots
Using the `Json` Prisma type maps to `JSONB` in PostgreSQL. This allows:
- GIN indexes on canvas JSON for future querying (e.g., "find all rooms containing a red rectangle").
- Native JSON diff operations in PostgreSQL.
- Efficient partial updates using `jsonb_set()`.

### Backup
Use PostgreSQL WAL archiving combined with a managed backup service (e.g., pgBackRest, Barman, or the managed service's built-in backups). Target RPO ≤ 5 minutes and RTO ≤ 30 minutes.

### Performance: connection pooling
Next.js development mode re-initialises modules on every hot reload, which would exhaust the PostgreSQL connection limit without the global singleton pattern in `lib/db/prisma.ts`. For production with serverless deployment, use **PgBouncer** or Prisma's connection URL with `?connection_limit=1` (for serverless) or `?pool_timeout=20` (for long-running Node processes).

### Relationship to other proposals
- **P004 (WebSocket reliability)**: Reconnecting clients can recover state from the database instead of depending on another connected peer.
- **P006 (Throughput optimization)**: The server can cache the latest compressed full-sync payload per room using the database, removing the need to relay through peers.
- **P007 (Authentication)**: The `User`, `Session`, and `RoomMembership` models in the Prisma schema are already defined here, making P007 a database-ready extension.
