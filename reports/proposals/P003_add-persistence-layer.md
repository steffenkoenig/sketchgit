# P003 – Add a Persistence Layer

## Title
Add a Persistence Layer

## Brief Summary
All application state—commit history, branches, canvas snapshots, and room membership—is held exclusively in server and browser memory. A server restart or a browser navigation wipes everything permanently. Introducing a persistence layer will ensure that work is durable, rooms can be resumed, and the system can recover gracefully from failures.

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

## What Needs to Be Done

### 1. Choose a storage backend

#### Option A – SQLite (recommended for low-complexity deployment)
- Single file database, zero infrastructure.
- Sufficient for single-server deployments and development.
- Library: `better-sqlite3` (synchronous API, ideal for Node.js).

#### Option B – PostgreSQL (recommended for production/multi-server)
- Full relational database with ACID guarantees.
- Enables horizontal scaling when combined with a message broker (see P006).
- Library: `pg` or an ORM such as Drizzle or Prisma.

#### Option C – Redis (for session/ephemeral state only)
- Very fast but not durable by default (persistence config required).
- Suitable as a complement to a relational database for caching active room state.

**Recommended path**: Start with SQLite for development and testing; migrate to PostgreSQL for production.

### 2. Define the data schema

```sql
-- Stores the full serialized state of every room
CREATE TABLE rooms (
  id          TEXT PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Stores individual commits in the commit graph
CREATE TABLE commits (
  sha         TEXT PRIMARY KEY,
  room_id     TEXT NOT NULL REFERENCES rooms(id),
  parent_sha  TEXT,             -- NULL for initial commit
  branch      TEXT NOT NULL,
  message     TEXT NOT NULL,
  canvas_json TEXT NOT NULL,   -- serialized Fabric.js canvas state
  created_at  INTEGER NOT NULL
);

-- Stores branch pointers
CREATE TABLE branches (
  room_id     TEXT NOT NULL REFERENCES rooms(id),
  name        TEXT NOT NULL,
  head_sha    TEXT NOT NULL REFERENCES commits(sha),
  PRIMARY KEY (room_id, name)
);

-- Stores the current HEAD for a room
CREATE TABLE room_state (
  room_id      TEXT PRIMARY KEY REFERENCES rooms(id),
  head_sha     TEXT,
  head_branch  TEXT,
  is_detached  INTEGER NOT NULL DEFAULT 0
);
```

### 3. Add a data access layer to the server
Create a `lib/db/` directory (server-side) with:
- `db.ts` – connection and migration setup.
- `roomRepository.ts` – CRUD for rooms, commits, branches, room state.

### 4. Integrate persistence into the server message handlers
Update `server.mjs` to:
- On `commit` message: write the commit record and updated branch pointer to the database.
- On `fullsync-request` message: read from the database rather than (only) from the in-memory state of other connected clients.
- On room creation: insert a rooms record.
- On server startup: load active room states from the database into memory as a warm cache.

### 5. Handle client-side reconnection
When a client reconnects to a room (e.g., after network drop or page refresh):
- Request a full state sync as usual.
- The server satisfies the sync from the database if no other client is currently connected.

### 6. Add client-side persistence (optional, secondary)
Use the browser's `localStorage` or `IndexedDB` to persist a lightweight snapshot of the current session locally:
- Acts as an offline fallback when the server is unreachable.
- Allows single-user work without a server connection.
- Sync to server when reconnected.

### 7. Data retention policy
Define a cleanup job (scheduled task or on-demand) to purge rooms that have been inactive for a configurable period (e.g., 30 days) to manage database growth.

## What Components Are Affected
| Component | Impact |
|-----------|--------|
| `server.mjs` | Add DB calls on commit, sync, and room events; load warm state on startup |
| New `lib/db/` | New server-side data access layer |
| `package.json` | Add `better-sqlite3` or `pg` as a dependency |
| WebSocket message protocol | No changes to message shape required; server handles persistence transparently |
| `components/SketchGitApp.tsx` | No changes needed; client behaviour is unchanged |

## Additional Considerations

### Migration from in-memory
Because the current system has no persisted data, there is no migration of existing data—the schema can be created fresh.

### Environment configuration
The database connection string (or SQLite file path) should be configurable via environment variable (e.g., `DATABASE_URL`), following 12-factor app principles.

### Backup
For SQLite, regular file-level backups (e.g., via cron + cloud storage) are straightforward and sufficient. For PostgreSQL, use WAL archiving or a managed backup service.

### Performance note
Canvas JSON snapshots can be large (tens of KB per commit for complex drawings). Consider compressing the `canvas_json` field with zlib/gzip before storing to reduce storage footprint, especially for long-lived rooms with many commits.

### Relationship to other proposals
- **P004 (WebSocket reliability)** benefits significantly from this proposal: reconnecting clients can recover state from the database instead of depending on another connected peer.
- **P006 (Horizontal scaling)** requires moving from in-memory room state to a shared database, making this proposal a prerequisite.
