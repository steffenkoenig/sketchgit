/**
 * P085 – Canvas JSON schema migration runner.
 *
 * Isomorphic (used both client-side, e.g. canvasEngine.ts's loadCanvasData,
 * and server-side, e.g. roomRepository.ts's saveCommit/resolveCommitCanvas) —
 * no browser- or Node-only APIs.
 */
import { CANVAS_JSON_SCHEMA_VERSION, SchemaVersionTooNewError } from "./canvasSchemaVersion";

export interface VersionedCanvasJson {
  schemaVersion: number;
  [key: string]: unknown;
}

type MigrationFn = (payload: Record<string, unknown>) => Record<string, unknown>;

/**
 * Keyed by the version a payload arrives at; the function upgrades it to
 * that key + 1. Add an entry here whenever CANVAS_JSON_SCHEMA_VERSION is
 * bumped — do not remove old entries; a commit made years ago must still
 * replay through every intermediate migration.
 */
const migrations: Record<number, MigrationFn> = {
  // version 0 (no schemaVersion field — every commit created before P085) → 1:
  // just stamp the field. No structural change to `objects` was needed for
  // this bump; it exists purely to establish the versioning mechanism itself.
  0: (p) => ({ ...p, schemaVersion: 1 }),
};

/**
 * Upgrades a canvas JSON payload (parsed object or JSON string) to
 * `CANVAS_JSON_SCHEMA_VERSION`, applying each intermediate migration in order.
 *
 * Payloads with no `schemaVersion` field are treated as version 0 (every
 * commit created before P085 — the "legacy, unversioned" sentinel).
 *
 * @throws {SchemaVersionTooNewError} if the payload's version is newer than
 *   this build understands — there is no way to safely downgrade.
 */
export function migrateCanvasJson(raw: unknown): VersionedCanvasJson {
  const payload: Record<string, unknown> =
    typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : { ...(raw as Record<string, unknown>) };

  let version = typeof payload.schemaVersion === "number" ? payload.schemaVersion : 0;

  if (version > CANVAS_JSON_SCHEMA_VERSION) {
    throw new SchemaVersionTooNewError(version);
  }

  let current = payload;
  while (version < CANVAS_JSON_SCHEMA_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      // No migration registered for this version — this should never happen
      // for a version < CANVAS_JSON_SCHEMA_VERSION; every intermediate step
      // must have a migration entry. Stamp the current version defensively
      // rather than looping forever or silently returning stale data.
      current = { ...current, schemaVersion: CANVAS_JSON_SCHEMA_VERSION };
      break;
    }
    current = migrate(current);
    version = typeof current.schemaVersion === "number" ? current.schemaVersion : version + 1;
  }

  return current as VersionedCanvasJson;
}
