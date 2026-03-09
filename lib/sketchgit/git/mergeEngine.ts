/**
 * mergeEngine – pure 3-way merge for Fabric.js canvas snapshots.
 *
 * This module is completely pure: no DOM, no Fabric.js, no side-effects.
 * Every function takes explicit inputs and returns explicit outputs,
 * making them straightforward to unit-test.
 */

import { Commit, MergeConflict, MergeResult } from '../types';
import { buildObjMap, extractProps, propsEqual } from './objectIdTracker';

// ─── Lowest Common Ancestor ───────────────────────────────────────────────────

/**
 * Find the lowest common ancestor (LCA) of two commits in the commit graph.
 * Accepts the full commits map as a parameter so this function is stateless.
 */
export function findLCA(
  shaA: string,
  shaB: string,
  commits: Record<string, Commit>,
): string | null {
  // Collect all ancestors of A (DFS)
  const ancestorsA = new Set<string>();
  function walkA(sha: string | null) {
    if (!sha || ancestorsA.has(sha)) return;
    ancestorsA.add(sha);
    const c = commits[sha];
    if (c) c.parents.forEach(walkA);
  }
  walkA(shaA);

  // BFS from B, stop at first ancestor of A
  const queue: string[] = [shaB];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const sha = queue.shift()!;
    if (!sha || visited.has(sha)) continue;
    visited.add(sha);
    if (ancestorsA.has(sha)) return sha;
    const c = commits[sha];
    if (c) c.parents.forEach((p) => queue.push(p));
  }
  return null;
}

// ─── Object labelling ────────────────────────────────────────────────────────

const OBJ_TYPE_LABELS: Record<string, string> = {
  rect: '▭ Rectangle',
  ellipse: '○ Ellipse',
  circle: '○ Circle',
  line: '― Line',
  path: '✏ Path',
  'i-text': 'T Text',
  text: 'T Text',
  group: '⊞ Group',
  polygon: '⬡ Polygon',
};

export function getObjLabel(obj: Record<string, unknown> | null | undefined): string {
  if (!obj) return 'Object';
  const type = (obj.type as string) || 'object';
  const base = OBJ_TYPE_LABELS[type] ?? type;
  const id = obj._id ? (obj._id as string).slice(4, 10) : '?';
  return `${base} #${id}`;
}

// ─── 3-way merge ─────────────────────────────────────────────────────────────

/**
 * Perform a 3-way merge on Fabric.js canvas JSON snapshots.
 *
 * Returns:
 *  - `{ result, autoMerged: true }` on a clean merge.
 *  - `{ conflicts, cleanObjects, … }` when there are property-level conflicts
 *    that require user resolution.
 */
export function threeWayMerge(
  baseData: string,
  oursData: string,
  theirsData: string,
): MergeResult {
  const baseMap = buildObjMap(baseData);
  const oursMap = buildObjMap(oursData);
  const theirsMap = buildObjMap(theirsData);

  const allIds = new Set([
    ...Object.keys(baseMap),
    ...Object.keys(oursMap),
    ...Object.keys(theirsMap),
  ]);

  const resultObjects: (Record<string, unknown> | null)[] = [];
  const conflicts: MergeConflict[] = [];

  for (const id of allIds) {
    const base = baseMap[id];
    const ours = oursMap[id];
    const theirs = theirsMap[id];

    const baseProps = base ? extractProps(base) : null;
    const oursProps = ours ? extractProps(ours) : null;
    const theirsProps = theirs ? extractProps(theirs) : null;

    // ── Deleted in both → skip
    if (!ours && !theirs) continue;

    // ── Only in one side → take it (prefer keeping over deletion)
    if (ours && !theirs) { resultObjects.push(ours); continue; }
    if (!ours && theirs) { resultObjects.push(theirs); continue; }

    // ── Present in both
    const oursChanged = base ? !propsEqual(baseProps!, oursProps!) : true;
    const theirsChanged = base ? !propsEqual(baseProps!, theirsProps!) : false;

    if (!oursChanged && !theirsChanged) { resultObjects.push(ours!); continue; }
    if (oursChanged && !theirsChanged) { resultObjects.push(ours!); continue; }
    if (!oursChanged && theirsChanged) { resultObjects.push(theirs!); continue; }

    // ── Both changed → check for property-level conflicts
    const propConflicts: MergeConflict['propConflicts'] = [];
    const mergedObj: Record<string, unknown> = { ...ours! };

    const allPropKeys = new Set([
      ...Object.keys(oursProps ?? {}),
      ...Object.keys(theirsProps ?? {}),
    ]);

    for (const prop of allPropKeys) {
      const bVal = baseProps ? baseProps[prop] : undefined;
      const oVal = oursProps ? oursProps[prop] : undefined;
      const tVal = theirsProps ? theirsProps[prop] : undefined;

      const oursChangedProp = JSON.stringify(bVal) !== JSON.stringify(oVal);
      const theirsChangedProp = JSON.stringify(bVal) !== JSON.stringify(tVal);

      if (oursChangedProp && theirsChangedProp && JSON.stringify(oVal) !== JSON.stringify(tVal)) {
        // True conflict on this property
        propConflicts.push({ prop, base: bVal, ours: oVal, theirs: tVal, chosen: 'ours' });
      }
    }

    if (propConflicts.length === 0) {
      // Changes don't overlap at property level → auto-merge (apply theirs on ours)
      for (const prop of allPropKeys) {
        const bVal = baseProps ? baseProps[prop] : undefined;
        const tVal = theirsProps ? theirsProps[prop] : undefined;
        if (JSON.stringify(bVal) !== JSON.stringify(tVal)) {
          mergedObj[prop] = tVal;
        }
      }
      resultObjects.push(mergedObj);
    } else {
      // Need user resolution
      conflicts.push({
        id,
        label: getObjLabel(ours ?? theirs),
        oursObj: ours!,
        theirsObj: theirs!,
        propConflicts,
        mergedObj,
      });
      resultObjects.push(null); // placeholder, filled after resolution
    }
  }

  if (conflicts.length === 0) {
    const baseParsed = JSON.parse(baseData) as Record<string, unknown>;
    baseParsed.objects = resultObjects;
    return { result: JSON.stringify(baseParsed), autoMerged: true };
  }

  return { conflicts, cleanObjects: resultObjects, baseData, oursData, theirsData };
}
