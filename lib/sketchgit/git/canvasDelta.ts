import { buildObjMap } from "./objectIdTracker";

export interface CanvasDelta {
  added: Record<string, unknown>[];
  modified: Record<string, unknown>[];
  removed: string[];
}

export interface CanvasData {
  version?: string;
  objects: Record<string, unknown>[];
  [key: string]: unknown;
}

export function computeCanvasDelta(
  prevJson: string,
  nextJson: string,
): CanvasDelta {
  const prev = buildObjMap(prevJson);
  const next = buildObjMap(nextJson);

  const added: Record<string, unknown>[] = [];
  const modified: Record<string, unknown>[] = [];
  const removed: string[] = [];

  for (const [id, obj] of Object.entries(next)) {
    if (!(id in prev)) {
      added.push(obj);
    } else if (JSON.stringify(prev[id]) !== JSON.stringify(obj)) {
      modified.push(obj);
    }
  }

  for (const id of Object.keys(prev)) {
    if (!(id in next)) {
      removed.push(id);
    }
  }

  return { added, modified, removed };
}

export function replayCanvasDelta(baseJson: string, delta: CanvasDelta): string {
  let parsed: CanvasData;
  try {
    parsed = JSON.parse(baseJson) as CanvasData;
  } catch {
    parsed = { objects: [] };
  }

  const objects = [...(parsed.objects ?? [])];
  const removedSet = new Set(delta.removed);
  const afterRemove = objects.filter((o) => !removedSet.has(o._id as string));

  const modifiedMap = new Map(delta.modified.map((o) => [o._id as string, o]));
  const afterModify = afterRemove.map((o) => modifiedMap.get(o._id as string) ?? o);

  const result = [...afterModify, ...delta.added];

  return JSON.stringify({ ...parsed, objects: result });
}
