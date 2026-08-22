import { describe, it, expect } from "vitest";
import { migrateCanvasJson } from "./canvasSchemaMigrations";
import { CANVAS_JSON_SCHEMA_VERSION, SchemaVersionTooNewError } from "./canvasSchemaVersion";

describe("migrateCanvasJson", () => {
  it("stamps schemaVersion 1 on a legacy payload with no schemaVersion field", () => {
    const legacy = { version: "6.0.0", objects: [{ type: "rect" }] };
    const result = migrateCanvasJson(legacy);
    expect(result.schemaVersion).toBe(CANVAS_JSON_SCHEMA_VERSION);
    expect(result.objects).toEqual(legacy.objects);
    expect(result.version).toBe("6.0.0");
  });

  it("accepts a JSON string and parses it before migrating", () => {
    const raw = JSON.stringify({ objects: [] });
    const result = migrateCanvasJson(raw);
    expect(result.schemaVersion).toBe(CANVAS_JSON_SCHEMA_VERSION);
    expect(result.objects).toEqual([]);
  });

  it("is a no-op when the payload is already at the current version", () => {
    const current = { schemaVersion: CANVAS_JSON_SCHEMA_VERSION, objects: [{ type: "circle" }] };
    const result = migrateCanvasJson(current);
    expect(result).toEqual(current);
  });

  it("throws SchemaVersionTooNewError when schemaVersion exceeds the current version", () => {
    const fromTheFuture = { schemaVersion: CANVAS_JSON_SCHEMA_VERSION + 1, objects: [] };
    expect(() => migrateCanvasJson(fromTheFuture)).toThrow(SchemaVersionTooNewError);
  });

  it("does not mutate the input object", () => {
    const legacy = { objects: [] };
    migrateCanvasJson(legacy);
    expect(legacy).not.toHaveProperty("schemaVersion");
  });
});
