# P011 – Database Performance Optimization

## Title
Database Performance Optimization: JSONB Storage, Missing Indices, and Query Improvements

## Brief Summary
The database layer stores canvas snapshots as plain `TEXT`, lacks indices on the most frequently queried foreign-key columns, and performs several queries in a way that could trigger N+1 patterns under load. Switching to `JSONB`, adding targeted indices, and refining queries will reduce storage requirements, lower query latency, and improve overall database health.

## Current Situation
The `Commit` model stores the full Fabric.js canvas serialization in a `canvasJson String @db.Text` column. Every commit—including every merge commit—holds a complete copy of the canvas state, which can easily reach 50–200 KB per row for canvases with many objects. There are no database indices beyond the primary keys and the unique slug on `Room`. The server-side code in `server.mjs` queries commits and branches through the Prisma client without batching related data.

### Relevant schema excerpt
```prisma
model Commit {
  sha        String   @id
  roomId     String            // no index
  parentSha  String?
  parents    String[]
  branch     String
  message    String
  canvasJson String   @db.Text // plain TEXT, no native JSON operators
  isMerge    Boolean  @default(false)
  authorId   String?           // no index
  createdAt  DateTime @default(now())
}

model Branch {
  roomId  String              // no index (composite PK only)
  name    String
  headSha String
  @@id([roomId, name])
}
```

## Problem with Current Situation
1. **TEXT vs JSONB**: PostgreSQL's `JSONB` type compresses and parses JSON at write time. Using plain `TEXT` means the database cannot apply JSON-level operators, cannot index individual JSON paths, and stores the raw string character-by-character without binary optimization.
2. **No index on `Commit.roomId`**: Every request to load a room's commit history performs a full sequential scan of the `Commit` table, which will degrade linearly as commits accumulate across all rooms.
3. **No index on `Commit.authorId`**: User profile pages or audit queries that group commits by author suffer the same full-scan penalty.
4. **No index on `Commit.createdAt`**: Range queries for recent activity or paginated history lists cannot use an index.
5. **No index on `RoomMembership.userId`**: The membership check executed on every authenticated API request (`roomRepository.ts`) scans memberships by `userId` without an index.
6. **Growing storage**: Storing complete snapshots for every commit means a 10-commit branch on a 100-object canvas can consume 1–20 MB in the `Commit` table for a single room. Popular rooms will exhaust storage quickly.
7. **Commit load without pagination**: `dbLoadSnapshot()` in `server.mjs` fetches all commits for a room at startup without any limit, transferring potentially megabytes of JSON over the database connection.

## Goal to Achieve
1. Reduce average query time for per-room commit lookups by an order of magnitude through proper indexing.
2. Enable native PostgreSQL JSON path queries on canvas data for potential future filtering (e.g., "which commits contain a red rectangle?").
3. Reduce total database storage size for canvas snapshots by 20–40% through JSONB binary encoding and optional column-level compression.
4. Prevent unbounded memory usage by adding pagination to the commit history loader.
5. Establish a pattern for adding future indices via Prisma migrations rather than ad-hoc SQL.

## What Needs to Be Done

### 1. Change `canvasJson` to JSONB
Update the Prisma schema to use native JSON type:
```prisma
canvasJson Json   // Prisma maps this to JSONB in PostgreSQL
```
Update all read/write sites to use `Prisma.JsonValue` instead of `string`. Prisma's `Json` type accepts and returns native JavaScript objects directly—no manual `JSON.stringify()` or `JSON.parse()` is needed. Existing code that already passes a parsed object to Prisma will work without changes; code that currently passes a raw JSON string must be updated to pass a parsed object instead.

### 2. Add missing database indices
```prisma
model Commit {
  ...
  @@index([roomId])
  @@index([authorId])
  @@index([roomId, createdAt])
}

model RoomMembership {
  ...
  @@index([userId])
}
```
Generate and apply a new Prisma migration:
```
npx prisma migrate dev --name add-missing-indices
```

### 3. Paginate the commit history loader
In `server.mjs`, replace the unconstrained `findMany` for commits with a cursor-based paginated fetch:
```js
// Load most recent N commits first; client requests older pages on demand
const commits = await prisma.commit.findMany({
  where: { roomId },
  orderBy: { createdAt: 'desc' },
  take: 100,
});
```
Expose a REST endpoint (e.g., `GET /api/rooms/:roomId/commits?cursor=<sha>`) for the client to load older pages as the user scrolls back through history.

### 4. Batch membership and branch queries
In the WebSocket upgrade handler in `server.mjs`, membership and branch data are fetched as separate queries. Combine them using Prisma's `include` to avoid round-trips:
```js
const room = await prisma.room.findUnique({
  where: { id: roomId },
  include: { branches: true, memberships: true },
});
```

### 5. Consider delta storage for large canvases
As a longer-term improvement (separate migration), store only the JSON diff between consecutive commits instead of the full snapshot. Apply diffs forward to reconstruct any commit. This could reduce per-commit storage by 80–95% for incremental edits.

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `prisma/schema.prisma` | Change `canvasJson` to `Json`; add `@@index` annotations |
| `prisma/migrations/` | New migration file(s) for schema changes |
| `server.mjs` | Update `dbSaveCommit()`, `dbLoadSnapshot()` for JSONB; add pagination |
| `lib/db/roomRepository.ts` | Update membership query to use index-friendly patterns |
| `app/api/rooms/[id]/commits/route.ts` | New paginated commit-history endpoint (to be created) |

## Additional Considerations

### Migration safety
The `TEXT → JSONB` migration is a **breaking change** for code that currently passes raw JSON strings to Prisma. After changing the schema:

- **Before** (current code, `canvasJson` as `String`): `{ canvasJson: JSON.stringify(canvasObject) }` — Prisma stores the string as-is.
- **After** (`canvasJson` as `Json`): `{ canvasJson: canvasObject }` — Prisma accepts a JavaScript object and handles serialization internally. Passing a string will cause a type error.

All write sites in `server.mjs` must be updated to remove the `JSON.stringify()` call, and all read sites must be updated to remove the corresponding `JSON.parse()` call.

The underlying PostgreSQL migration requires a `USING` cast in the raw SQL. Prisma does not generate this automatically; a custom migration file must be written:
```sql
ALTER TABLE "Commit" ALTER COLUMN "canvasJson" TYPE jsonb USING "canvasJson"::jsonb;
```
Data should be validated before applying (all rows must contain valid JSON).

### Compression alternative
If switching to `JSONB` is deferred, PostgreSQL's `TOAST` mechanism already compresses large `TEXT` values. Adding explicit `SET STORAGE EXTERNAL` forces out-of-line storage and keeps heap pages small, which benefits index scans on other columns.

### Monitoring
After deploying indices, run `EXPLAIN ANALYZE` on the top-10 most frequent queries (identifiable via `pg_stat_statements`) to confirm index usage. Set up a weekly `pg_stat_user_tables` check to catch future missing-index candidates.
