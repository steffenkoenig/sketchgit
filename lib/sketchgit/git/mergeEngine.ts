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
  // Mermaid diagrams are stored as FabricImage (type='image') but have a
  // specific label that distinguishes them from generic images.
  const base = obj._isMermaid
    ? '◇ Mermaid'
    : (OBJ_TYPE_LABELS[type] ?? type);
  const id = obj._id ? (obj._id as string).slice(4, 10) : '?';
  return `${base} #${id}`;
}

// ─── Line-by-line text merge ─────────────────────────────────────────────────

/**
 * Perform a 3-way merge of multi-line text content (e.g. mermaid diagram code),
 * operating line by line rather than treating the whole string as one unit.
 *
 * This enables automatic merging when both branches changed *different* lines
 * (no line-level conflict), while still flagging conflicts when the same line
 * was modified differently on both sides.
 *
 * @returns The merged string when all line-level changes are non-overlapping.
 *          Returns `null` when a line was modified differently on both sides
 *          (a true line-level conflict that requires user resolution).
 */
export function mergeTextLineByLine(
  base: string,
  ours: string,
  theirs: string,
): string | null {
  // Fast paths: nothing to merge
  if (ours === theirs) return ours;
  if (ours === base) return theirs;
  if (theirs === base) return ours;

  const baseLines = base.split('\n');
  const oursLines = ours.split('\n');
  const theirsLines = theirs.split('\n');
  const maxLen = Math.max(baseLines.length, oursLines.length, theirsLines.length);

  const result: string[] = [];

  for (let i = 0; i < maxLen; i++) {
    const b = i < baseLines.length ? baseLines[i] : undefined;
    const o = i < oursLines.length ? oursLines[i] : undefined;
    const t = i < theirsLines.length ? theirsLines[i] : undefined;

    const oursChangedLine = o !== b;
    const theirsChangedLine = t !== b;

    if (!oursChangedLine && !theirsChangedLine) {
      // Unchanged on both sides – keep the base line
      if (b !== undefined) result.push(b);
    } else if (oursChangedLine && !theirsChangedLine) {
      // Only ours changed – take ours (undefined means deleted)
      if (o !== undefined) result.push(o);
    } else if (!oursChangedLine && theirsChangedLine) {
      // Only theirs changed – take theirs (undefined means deleted)
      if (t !== undefined) result.push(t);
    } else {
      // Both changed this position
      if (o === t) {
        // Both made the same change – keep it
        if (o !== undefined) result.push(o);
      } else if (o === undefined && t === undefined) {
        // Both deleted the line – skip it
      } else if (b === undefined) {
        // Both appended new (different) content at the same position beyond the
        // base.  There is no canonical order, so include both in a deterministic
        // order (ours first) so neither side's addition is lost.
        if (o !== undefined) result.push(o);
        if (t !== undefined) result.push(t);
      } else {
        // True line-level conflict: same existing position, different content
        return null;
      }
    }
  }

  return result.join('\n');
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
    // Track properties that were auto-merged at the line level (for mermaid code).
    const lineMergedProps = new Map<string, unknown>();

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
        // For mermaid code: attempt a line-by-line merge before reporting a conflict.
        // This allows auto-merging when both sides edited *different* lines.
        if (
          prop === '_mermaidCode' &&
          typeof bVal === 'string' &&
          typeof oVal === 'string' &&
          typeof tVal === 'string'
        ) {
          const lineMerged = mergeTextLineByLine(bVal, oVal, tVal);
          if (lineMerged !== null) {
            // Line-level merge succeeded – record the merged value and skip the conflict.
            lineMergedProps.set(prop, lineMerged);
            continue;
          }
        }
        // True conflict on this property
        propConflicts.push({ prop, base: bVal, ours: oVal, theirs: tVal, chosen: 'ours' });
      }
    }

    if (propConflicts.length === 0) {
      // Changes don't overlap at property level → auto-merge (apply theirs on ours)
      for (const prop of allPropKeys) {
        const bVal = baseProps ? baseProps[prop] : undefined;
        const tVal = theirsProps ? theirsProps[prop] : undefined;
        if (lineMergedProps.has(prop)) {
          mergedObj[prop] = lineMergedProps.get(prop);
        } else if (JSON.stringify(bVal) !== JSON.stringify(tVal)) {
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
    const oursParsed = JSON.parse(oursData) as Record<string, unknown>;
    oursParsed.objects = resultObjects;
    return { result: JSON.stringify(oursParsed), autoMerged: true };
  }

  return { conflicts, cleanObjects: resultObjects, baseData, oursData, theirsData };
}
