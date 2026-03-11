# P033 – Delta-Based Canvas Commit Storage

## Title
Store Incremental Canvas Diffs Instead of Full Snapshots per Commit to Reduce Database Storage by 80–95%

## Brief Summary
Every commit currently stores a complete serialization of the entire Fabric.js canvas in the `canvasJson` JSONB column — potentially 50–200 KB per commit. For rooms with incremental workflows (small edits followed by frequent commits), consecutive commits are nearly identical, yet the database holds duplicate full copies. Switching to a delta-based storage model — persisting only the diff of added, modified, and removed objects relative to the parent commit — can reduce storage by 80–95% for typical usage patterns while keeping the existing commit SHA chain and branch model completely unchanged.

## Current Situation
Each `Commit` row stores `canvasJson` as a full JSONB snapshot:
```json
{
  "version": "6.0.0",
  "objects": [
    { "_id": "obj_abc123", "type": "rect", "left": 100, "top": 200, … },
    { "_id": "obj_def456", "type": "ellipse", "left": 300, "top": 100, … },
    … (potentially hundreds of objects)
  ]
}
```
After a user makes a single small change (moves one rectangle) and commits, the next row stores an almost-identical object array differing by two numbers. The unchanged objects are fully duplicated in the new row.

The draw-delta protocol (P006) already computes per-object diffs at the network level (added/modified/removed keyed by `_id`). The same diff data is available at commit time but discarded — the server reconstructs the full canvas from client state and saves it wholesale.

### Storage estimation (typical usage)
| Scenario | Commits per room | Canvas size | Full snapshots | Delta storage |
|----------|-----------------|-------------|----------------|---------------|
| Tutorial room (10 objects) | 20 | 5 KB | 100 KB | ~8 KB |
| Active project (200 objects) | 100 | 80 KB | 8 MB | ~200 KB |
| Long-lived room (500 objects) | 500 | 200 KB | 100 MB | ~1 MB |

## Problem with Current Situation
1. **Storage amplification**: A 200-object canvas committed 100 times stores ≈ 8 MB for data that would fit in ≈ 200 KB with delta encoding.
2. **Slow commit list queries**: Even with indexes, scanning the `canvasJson` JSONB column for timeline operations incurs significant I/O for large rooms. PostgreSQL must deserialize each row's JSONB to respond to JSON-path queries.
3. **Expensive full-syncs**: When the server sends `fullsync` to a new client, it must transmit `commits` containing up to 100 full canvas snapshots. The actual canvas state needed by the client is only the latest HEAD — the historical snapshots are used solely for checkout and merge operations.
4. **Merge complexity at storage layer**: The 3-way merge algorithm reconstructs full snapshots for base, ours, and theirs from the `canvasJson` field. With delta storage, reconstruction requires replaying a short chain of deltas, but the merge algorithm itself is unchanged.

## Goal to Achieve
1. Store `canvasJson` as a delta object `{ added: [...], modified: [...], removed: [...] }` for all commits except the initial commit of a branch (which must be stored as a full snapshot — there is no parent to diff against).
2. Provide a `reconstructCanvas(sha, commits)` function that replays deltas from the nearest full-snapshot ancestor to produce the full canvas for any commit.
3. Keep the external API contract (`CommitRecord.canvas` as a JSON string) unchanged so that the git model, merge engine, and coordinators require no modification.
4. Migrate existing full-snapshot rows to deltas as a background job or as an optional one-time migration.
5. Reduce average per-commit storage by ≥ 80 % for rooms with ≥ 5 commits.

## What Needs to Be Done

### 1. Extend the database schema
Add a `storageType` discriminator to the `Commit` model:
```prisma
model Commit {
  …
  canvasJson   Json
  storageType  CommitStorageType @default(SNAPSHOT)
  …
}

enum CommitStorageType {
  SNAPSHOT  // canvasJson is a full Fabric.js canvas
  DELTA     // canvasJson is { added, modified, removed }
}
```
Generate a new migration:
```
npx prisma migrate dev --name add-commit-storage-type
```

### 2. Implement `computeCanvasDelta` in `lib/sketchgit/git/canvasDelta.ts`
A pure function (no DOM, no Fabric.js dependency) that computes the diff between two canvas JSON strings:
```typescript
export interface CanvasDelta {
  added:    Record<string, unknown>[];
  modified: Record<string, unknown>[];
  removed:  string[]; // object IDs
}

export function computeCanvasDelta(
  prevJson: string,
  nextJson: string,
): CanvasDelta { … }
```
Algorithm:
1. Build `_id → object` maps for both snapshots using `buildObjMap` (already in `objectIdTracker.ts`).
2. Objects in `next` but not in `prev` → `added`.
3. Objects in both but different (use `JSON.stringify` comparison) → `modified` (store full new object).
4. Objects in `prev` but not in `next` → `removed` (store only the `_id`).

### 3. Implement `replayCanvasDelta` in `lib/sketchgit/git/canvasDelta.ts`
```typescript
export function replayCanvasDelta(
  baseJson: string,
  delta: CanvasDelta,
): string { … }
```
1. Parse `baseJson` to get the objects array.
2. Apply `removed` (filter out by `_id`).
3. Apply `modified` (replace existing objects by `_id`).
4. Apply `added` (append to objects array).
5. Return the resulting canvas JSON string.

### 4. Implement `reconstructCanvas` in `lib/db/roomRepository.ts`
For commits with `storageType === DELTA`, replay deltas from the nearest `SNAPSHOT` ancestor:
```typescript
export async function reconstructCanvas(
  sha: string,
  roomId: string,
): Promise<string>
```
Algorithm:
1. Walk the parent chain until a `SNAPSHOT` commit is found.
2. Replay deltas in chronological order.
3. Cache the result (integrates with P030 cache).

### 5. Update `dbSaveCommit` in `server.ts`
After resolving the parent commit:
- If no parent → store as `SNAPSHOT`.
- If parent exists → compute delta, store as `DELTA` with `storageType: DELTA`.

### 6. Update `dbLoadSnapshot` in `server.ts`
When building `commitsMap` for `fullsync`, populate `canvas` using `reconstructCanvas` for `DELTA` commits, or direct `JSON.stringify` for `SNAPSHOT` commits.

### 7. One-time backfill migration (optional, recommended)
A separate migration script (not a Prisma migration) that:
- Loads rooms in batches.
- For each SNAPSHOT commit (except initial), computes the delta from its parent and replaces `canvasJson` with the delta object.
- Updates `storageType` to `DELTA`.
This can be run offline or as a background job — it does not require downtime.

### 8. Tests in `lib/sketchgit/git/canvasDelta.test.ts`
- `computeCanvasDelta`: empty prev → all objects are `added`.
- `computeCanvasDelta`: no changes → empty delta.
- `computeCanvasDelta`: one removed, one modified, one added simultaneously.
- `replayCanvasDelta`: round-trip: `apply(prev, compute(prev, next)) === next`.
- `replayCanvasDelta`: applying an empty delta is a no-op.

## Components Affected
| Component | Change |
|-----------|--------|
| `prisma/schema.prisma` | Add `storageType CommitStorageType` field and enum |
| `prisma/migrations/…` | New migration for `storageType` column |
| `lib/sketchgit/git/canvasDelta.ts` | **New file** – `computeCanvasDelta`, `replayCanvasDelta` |
| `lib/sketchgit/git/canvasDelta.test.ts` | **New file** – pure unit tests |
| `lib/db/roomRepository.ts` | Add `reconstructCanvas`; update `loadRoomSnapshot` |
| `server.ts` | Update `dbSaveCommit` to store deltas; update `dbLoadSnapshot` to reconstruct |

## Data & Database Model
### Schema change
```prisma
enum CommitStorageType {
  SNAPSHOT
  DELTA
}
model Commit {
  …
  storageType  CommitStorageType @default(SNAPSHOT)
  …
}
```
### Backward compatibility
All existing rows have `storageType = SNAPSHOT` (default). No data migration is required for correctness; the backfill migration is optional and can run incrementally.

## Testing Requirements
- Pure unit tests for `computeCanvasDelta` and `replayCanvasDelta` (no DB required).
- Round-trip property test: for any pair of canvas snapshots, `replayCanvasDelta(base, computeCanvasDelta(base, next)) === next`.
- Integration test: save three consecutive commits; verify storage size is smaller than three full snapshots.
- Reconstruction test: `reconstructCanvas` returns the correct canvas for a commit reached via a 5-delta chain.

## Linting and Type Requirements
- `CanvasDelta` interface exported from `canvasDelta.ts` for use by server and future REST API.
- `storageType` enum from Prisma client imported by `roomRepository.ts`; no magic strings.
- All reconstruction paths handle `SNAPSHOT` and `DELTA` discriminants exhaustively (TypeScript `never` guard in `switch`).

## Dependency Map
- Depends on: P011 ✅ (JSONB column can store both snapshots and delta objects), P001 ✅ (`buildObjMap` and `extractProps` are available as pure helpers)
- Benefits from: P029 (paginated load makes chain replay bounded), P030 (cache stores reconstructed snapshots, amortising replay cost)
- Orthogonal to: P006 ✅ (draw-delta is a real-time protocol; this is a storage encoding — they share the same diff concept but are independent)
