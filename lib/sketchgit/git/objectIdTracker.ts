/**
 * objectIdTracker – assigns and tracks stable UUIDs on canvas objects,
 * and provides helpers for extracting/comparing mergeable properties.
 *
 * This module is pure: no DOM access, no Fabric.js import, no side-effects.
 */

import { MERGE_PROPS } from '../types';

/** Assign a stable UUID to a canvas object if it doesn't already have one. */
export function ensureObjId(obj: object): string {
  const o = obj as Record<string, unknown>;
  if (!o._id) {
    o._id = 'obj_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  }
  return o._id as string;
}

const MAX_DEPTH = 10;

/**
 * Build an id → object map from a Fabric.js canvas JSON snapshot.
 * Only objects that carry a `_id` field are included.
 */
export function buildObjMap(
  canvasJSON: string | Record<string, unknown>,
  currentDepth = 0
): Record<string, Record<string, unknown>> {
  if (currentDepth > MAX_DEPTH) {
    return {};
  }
  const parsed =
    typeof canvasJSON === 'string'
      ? (JSON.parse(canvasJSON) as Record<string, unknown>)
      : canvasJSON;

  const map: Record<string, Record<string, unknown>> = {};
  const objects = (parsed.objects as Record<string, unknown>[] | undefined) ?? [];
  for (const obj of objects) {
    if (obj._id) {
      map[obj._id as string] = obj;
    }
    // Deep search for groups
    if (obj.objects && Array.isArray(obj.objects)) {
      const nested = buildObjMap({ objects: obj.objects }, currentDepth + 1);
      Object.assign(map, nested);
    }
  }
  return map;
}

/** Extract only the properties relevant to merge conflict detection. */
export function extractProps(obj: Record<string, unknown>, currentDepth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of MERGE_PROPS) {
    if (obj[p] !== undefined) out[p] = obj[p];
  }
  // The 'type' property is needed by the tests, even if it's not strictly a MERGE_PROP
  if (obj.type !== undefined) out.type = obj.type;

  // For groups (arrows), capture sub-object state too
  if (obj.objects !== undefined) {
    if (currentDepth > MAX_DEPTH) {
      // Discard heavily nested children to prevent DoS
      out._groupObjects = "[]";
    } else if (Array.isArray(obj.objects)) {
      const nested = obj.objects.map(child => extractProps(child, currentDepth + 1));
      out._groupObjects = JSON.stringify(nested);
    }
  }
  return out;
}

/** Deep-equality check via JSON serialization (sufficient for canvas props). */
export function propsEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
