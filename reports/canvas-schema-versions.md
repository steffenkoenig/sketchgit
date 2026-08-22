# Canvas JSON Schema Version Compatibility Matrix

Tracks every `schemaVersion` bump of the `canvasJson` envelope stored on
`Commit` rows (`{ schemaVersion, version, objects, ... }`), the Fabric.js
version range and custom properties each was written under, and the
migration function that upgrades a payload from the previous version.

The current version is `CANVAS_JSON_SCHEMA_VERSION` in
`lib/sketchgit/git/canvasSchemaVersion.ts`. Migrations live in
`lib/sketchgit/git/canvasSchemaMigrations.ts`.

**Policy:** any change to the Fabric.js object shape, a custom property, or
the envelope itself that would make an existing commit fail to load
correctly requires a `schemaVersion` bump and a corresponding migration
function — never a silent, unversioned format change.

## Version History

| Version | Fabric.js version | Custom properties | Migration from previous |
|---------|--------------------|--------------------|--------------------------|
| 0 (legacy/unversioned) | 5.x–7.x (no single fixed range — this is every commit created before P085) | `_isArrow`, `_id`, `_link`, `_fillPattern`, `_fillColor`, `_arrowHeadStart`, `_arrowHeadEnd`, `_arrowType`, `_sloppiness`, `_origGeom`, `_attachedFrom`, `_attachedTo`, `_attachedFromAnchorX/Y`, `_attachedToAnchorX/Y`, `_x1/y1/x2/y2`, `_isMermaid`, `_mermaidCode` | — (sentinel: no `schemaVersion` field present) |
| 1 (current) | 7.4.0 | Same custom properties as version 0 | Stamps `schemaVersion: 1` on the payload; no structural change to `objects` was needed for this bump — it exists purely to establish the versioning mechanism itself, so every future structural change has somewhere to record its migration. |

## How Versioning Works

- **Write path**: `canvasEngine.ts`'s `getCanvasData()` stamps the current
  `CANVAS_JSON_SCHEMA_VERSION` on every serialization. Server-side,
  `roomRepository.ts`'s `saveCommit()`/`saveCommitWithDelta()` call
  `migrateCanvasJson()` before persisting, which also **rejects** (throws
  `SchemaVersionTooNewError`) a payload whose `schemaVersion` is *newer* than
  this server build understands — there's no way to safely downgrade a
  payload from a future format.
- **Read path**: `canvasEngine.ts`'s `loadCanvasData()` (the single funnel
  for all externally-sourced canvas state — git checkout, merge, peer sync)
  and `roomRepository.ts`'s `resolveCommitCanvas()` both call
  `migrateCanvasJson()`, which treats a payload with no `schemaVersion` field
  as version 0 and applies every migration up to the current version in
  order.
- **Delta commits (P033)**: `CanvasDelta` (`{ added, modified, removed }`)
  is an operations list applied onto a base SNAPSHOT during replay
  (`canvasDelta.ts`'s `replayCanvasDelta()`), which spreads the base
  envelope's other fields — including `schemaVersion` — into the result. A
  DELTA row therefore does not need (and must not carry) its own
  `schemaVersion`; it always inherits the version of the SNAPSHOT its chain
  replays against.
- **Backfill**: `scripts/backfill-canvas-schema-version.mjs` stamps
  `schemaVersion: 1` on legacy SNAPSHOT rows directly in the database. This
  is **not required for correctness** (the read path already migrates
  transparently) — it exists so an operator can confirm zero legacy rows
  remain, and so every future read of an old commit skips the migration
  step. Run with `npm run db:backfill-canvas-schema-version` (add
  `-- --dry-run` to preview without writing). Safe to re-run; it only
  updates SNAPSHOT rows still missing the field.

## Adding a New Version

1. Bump `CANVAS_JSON_SCHEMA_VERSION` in `canvasSchemaVersion.ts`.
2. Add a migration function to the `migrations` registry in
   `canvasSchemaMigrations.ts`, keyed by the version it upgrades *from*.
   Never remove or rewrite an old migration — a commit made years ago must
   still replay through every intermediate step.
3. Add a row to the table above documenting what changed and why.
4. Add a test case to `canvasSchemaMigrations.test.ts` covering the new
   migration.
5. Consider whether a backfill script is worth writing for the new version —
   only if the migration is nontrivial enough that skipping it repeatedly at
   read time would be a real cost.
