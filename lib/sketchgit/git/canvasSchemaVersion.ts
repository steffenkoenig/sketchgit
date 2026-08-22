/**
 * P085 – Canvas JSON schema versioning.
 *
 * Every canvasJson envelope (`{ schemaVersion, version, objects, ... }`) saved
 * to a commit, and every payload the client submits for a new commit, carries
 * this version. Bump it whenever a change to the Fabric.js object shape, a
 * custom property, or the envelope itself would make an old payload
 * unloadable without a migration step — then add the migration function to
 * `canvasSchemaMigrations.ts` and document the change in
 * `reports/canvas-schema-versions.md`.
 */
export const CANVAS_JSON_SCHEMA_VERSION = 1;

/**
 * Thrown when a canvas payload declares a schemaVersion newer than this
 * server/client understands — e.g. an old server received a commit from a
 * newer client after a partial rollout, or an old client tries to load a
 * commit a newer client created. There is no way to safely downgrade, so
 * this must surface as an error rather than being silently ignored.
 */
export class SchemaVersionTooNewError extends Error {
  constructor(public readonly foundVersion: number) {
    super(
      `canvasJson schemaVersion ${foundVersion} is newer than the version this build understands (${CANVAS_JSON_SCHEMA_VERSION})`,
    );
    this.name = "SchemaVersionTooNewError";
  }
}
