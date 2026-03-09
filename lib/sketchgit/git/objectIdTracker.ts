/**
 * objectIdTracker – assigns and tracks stable UUIDs on canvas objects,
 * and provides helpers for extracting/comparing mergeable properties.
 *
 * This module is pure: no DOM access, no Fabric.js import, no side-effects.
 */

import { MERGE_PROPS } from '../types';

/** Assign a stable UUID to a canvas object if it doesn't already have one. */
export function ensureObjId(obj: Record<string, unknown>): string {
  if (!obj._id) {
    obj._id = 'obj_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  }
  return obj._id as string;
}

/**
 * Build an id → object map from a Fabric.js canvas JSON snapshot.
 * Only objects that carry a `_id` field are included.
 */
export function buildObjMap(
  canvasJSON: string | Record<string, unknown>,
): Record<string, Record<string, unknown>> {
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
  }
  return map;
}

/** Extract only the properties relevant to merge conflict detection. */
export function extractProps(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of MERGE_PROPS) {
    if (obj[p] !== undefined) out[p] = obj[p];
  }
  // For groups (arrows), capture sub-object state too
  if (obj.objects !== undefined) {
    out._groupObjects = JSON.stringify(obj.objects);
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
