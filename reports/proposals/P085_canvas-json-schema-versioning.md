# P085 – Canvas JSON Schema Versioning and Migration

## Status
Not Started

## Dimensions
Reliability · Maintainability · Performance

## Problem

The `Commit.canvasJson` column stores the serialised Fabric.js canvas state as a JSONB
blob. Currently there is **no versioning** on this payload. As the application evolves:

| Risk | Description |
|------|-------------|
| **Fabric.js upgrades** | A Fabric.js major version may change object property names (e.g. `strokeWidth` → `stroke-width`) rendering old commits unloadable. |
| **Custom property additions** | New features (object locking from P067, presenter mode from P080) add custom properties to Fabric objects. Old clients do not know how to handle them. |
| **Property removal** | Removing a property from the canvas model silently produces `undefined` values when loading old commits. |
| **Delta storage format (P033)** | Delta commits encode a diff structure. If the diff format changes, replaying old deltas breaks timeline checkout. |
| **No migration path** | Without a version field there is no way to detect stale payloads or run data migrations. |

No existing proposal covers this data-layer concern.

## Proposed Solution

### 1. Add a `schemaVersion` field to every `canvasJson` payload

Every object saved into `canvasJson` (whether SNAPSHOT or DELTA) carries a top-level
`schemaVersion` integer:

```json
{
  "schemaVersion": 1,
  "version": "6.0.0",
  "objects": [ … ]
}
```

For delta commits (P033), the delta envelope also carries `schemaVersion`:

```json
{
  "schemaVersion": 1,
  "baseSnapshotSha": "abc123",
  "ops": [ … ]
}
```

### 2. Current version constant

Define `CANVAS_JSON_SCHEMA_VERSION = 1` in
`lib/sketchgit/git/canvasSchemaVersion.ts`. All write paths reference this constant.
Any read path that encounters a lower version runs the appropriate migration.

### 3. Migration runner

Create `lib/sketchgit/git/canvasSchemaMigrations.ts` with a registry of migration
functions:

```typescript
type MigrationFn = (payload: unknown) => unknown;

const migrations: Record<number, MigrationFn> = {
  // version 0 → 1: add schemaVersion field to legacy payloads
  0: (p) => ({ schemaVersion: 1, ...(p as object) }),
};
```

The `migrateCanvasJson(raw: unknown): VersionedCanvasJson` function:
1. Parses the JSON (if string) or uses the raw object.
2. Reads `schemaVersion` (defaults to `0` if absent, meaning legacy data).
3. Applies migrations sequentially up to `CANVAS_JSON_SCHEMA_VERSION`.
4. Returns the upgraded payload.

All read paths in `canvasEngine.ts`, `gitModel.ts`, `canvasDelta.ts`, and the
`/api/rooms/[roomId]/export` route must pass raw `canvasJson` through
`migrateCanvasJson` before use.

### 4. Write-path enforcement

Add a `validateCanvasJsonVersion` Zod schema check in `lib/api/wsSchemas.ts` for
the `commit` WebSocket message. The server rejects any payload where
`canvasJson.schemaVersion` does not equal `CANVAS_JSON_SCHEMA_VERSION`.

This prevents old clients from persisting stale-format data after a server upgrade.

### 5. Database back-fill migration (Prisma)

Create a Prisma migration script (not an automatic migration — must be run as a
one-time admin task) that:
1. Selects all commits where `canvasJson->>'schemaVersion' IS NULL`.
2. Updates them to add `schemaVersion: 0` (marking them as legacy pre-versioning).
3. Logs the count of updated rows.

This migration is idempotent (safe to re-run). The `schemaVersion: 0` sentinel value
means "unversioned" and is converted to version 1 by the migration runner at read time.

### 6. Compatibility matrix documentation

Create `reports/canvas-schema-versions.md` documenting:
- Version number → Fabric.js version range.
- Version number → custom property additions.
- Migration function for each version bump.
- Policy: breaking changes require a version increment.

## Code Structure

```
lib/sketchgit/git/
  canvasSchemaVersion.ts         ← CANVAS_JSON_SCHEMA_VERSION constant + types
  canvasSchemaMigrations.ts      ← migration registry + migrateCanvasJson()
  canvasSchemaMigrations.test.ts ← unit tests for each migration

prisma/
  migrations/
    YYYYMMDDHHMMSS_backfill_canvas_schema_version/
      migration.sql              ← one-time back-fill script

reports/
  canvas-schema-versions.md     ← compatibility matrix
```

## Type Requirements

- `VersionedCanvasJson` is a discriminated union on `schemaVersion`:

```typescript
type VersionedCanvasJson =
  | { schemaVersion: 0; objects: unknown[] }         // legacy
  | { schemaVersion: 1; version: string; objects: FabricObject[] };
```

- `migrateCanvasJson` must return `VersionedCanvasJson` with the current version.
  TypeScript will error if the return type is stale after adding a new version branch.
- The Zod schema for `canvasJson` in `wsSchemas.ts` uses `z.object({ schemaVersion: z.literal(CANVAS_JSON_SCHEMA_VERSION) })` so the server always rejects out-of-date clients.

## Linting Requirements

No new ESLint rules required. The existing `@typescript-eslint/no-explicit-any` rule
forces migration functions to use `unknown` instead of `any`, keeping them type-safe.

## Test Requirements

| Test | File |
|------|------|
| `migrateCanvasJson` with `schemaVersion: 0` (legacy) produces `schemaVersion: 1` | `canvasSchemaMigrations.test.ts` |
| `migrateCanvasJson` with current version is a no-op | `canvasSchemaMigrations.test.ts` |
| `migrateCanvasJson` with `schemaVersion > CURRENT` throws `SchemaVersionTooNew` | `canvasSchemaMigrations.test.ts` |
| Delta envelope migration is independent of snapshot migration | `canvasSchemaMigrations.test.ts` |
| WS `commit` message with wrong `schemaVersion` is rejected | `wsSchemas.test.ts` |
| Export route returns 422 when `canvasJson` has `schemaVersion > CURRENT` | `app/api/rooms/[roomId]/export/route.test.ts` |

## Database / Data Impact

- One-time Prisma migration adds `schemaVersion: 0` to all existing `canvasJson`
  objects that lack the field. This is a partial update (JSON column patch), not a
  schema change.
- No new Prisma model columns are required — the version is stored **inside** the
  existing JSONB `canvasJson` field.
- The back-fill script should be run before deploying the new application version.

## Repository Structure

- New files in `lib/sketchgit/git/`.
- New Prisma migration script.
- New `reports/canvas-schema-versions.md`.
- Update `lib/api/wsSchemas.ts` to enforce schema version on `commit` messages.
- Update all read paths in `canvasEngine.ts`, `gitModel.ts`, `canvasDelta.ts`.

## GitHub Copilot Agents and Skills

- The `canvas-schema-versions.md` compatibility matrix gives Copilot Chat precise
  context when asked to help migrate a canvas payload from one version to another.
- A custom Copilot skill can generate a new migration function stub when given the
  changed property names between two Fabric.js versions.
- Copilot's `#codebase` context will surface `CANVAS_JSON_SCHEMA_VERSION` as a
  single authoritative constant to update when making canvas model changes.

## Implementation Order

1. Create `canvasSchemaVersion.ts` with constant and types.
2. Create `canvasSchemaMigrations.ts` with the version-0 → version-1 migration.
3. Write unit tests.
4. Update `wsSchemas.ts` to enforce `schemaVersion`.
5. Update read paths in `canvasEngine.ts`, `gitModel.ts`, `canvasDelta.ts`.
6. Write and test the Prisma back-fill migration.
7. Create `reports/canvas-schema-versions.md`.

## Effort Estimate
Medium (2–3 days). The migration runner is simple; the main effort is auditing all
read paths and writing the Prisma back-fill.

## Dependencies
- P011 ✅ (JSONB `canvasJson` column established)
- P033 ✅ (delta storage — delta envelope also needs versioning)
- P031 ✅ (WS payload validation — schema version check added here)
- P039 ✅ (canvas export route — must run migration before export)
