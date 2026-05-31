/**
 * mergeEngine – pure 3-way merge for Fabric.js canvas snapshots.
 *
 * This module is completely pure: no DOM, no Fabric.js, no side-effects.
 * Every function takes explicit inputs and returns explicit outputs,
 * making them straightforward to unit-test.
 */

import { Commit, MergeConflict, MergeResult, MermaidLineConflict } from '../types';
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
    const commit = commits[sha];
    if (commit) commit.parents.forEach(walkA);
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
    const commit = commits[sha];
    if (commit) commit.parents.forEach((parent) => queue.push(parent));
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
 * Delegates to `computeMermaidLineMergeDetails` to avoid duplicating the
 * line-iteration logic.
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

  const { partialLines, lineConflicts } = computeMermaidLineMergeDetails(base, ours, theirs);
  if (lineConflicts.length > 0) return null;
  // No conflicts: partialLines contains no nulls, so the cast is safe.
  return (partialLines as string[]).join('\n');
}

/**
 * Compute line-level merge details for `_mermaidCode` when the overall merge
 * cannot be auto-resolved (i.e. `mergeTextLineByLine` returned `null`).
 *
 * Returns two parallel pieces of data:
 *  - `partialLines` – the already-resolved merged lines, with `null` at each
 *    position that has a true line-level conflict requiring user choice.
 *  - `lineConflicts` – the conflicting line entries, in order.  The number of
 *    `null` entries in `partialLines` equals `lineConflicts.length`.
 *
 * Exported for unit testing only – treat as internal.
 */
export function computeMermaidLineMergeDetails(
  base: string,
  ours: string,
  theirs: string,
): { partialLines: (string | null)[]; lineConflicts: MermaidLineConflict[] } {
  const baseLines = base === '' ? [] : base.split('\n');
  const oursLines = ours === '' ? [] : ours.split('\n');
  const theirsLines = theirs === '' ? [] : theirs.split('\n');
  const maxLen = Math.max(baseLines.length, oursLines.length, theirsLines.length);

  const partialLines: (string | null)[] = [];
  const lineConflicts: MermaidLineConflict[] = [];

  for (let i = 0; i < maxLen; i++) {
    const baseLine = i < baseLines.length ? baseLines[i] : undefined;
    const oursLine = i < oursLines.length ? oursLines[i] : undefined;
    const theirsLine = i < theirsLines.length ? theirsLines[i] : undefined;

    const oursChangedLine = oursLine !== baseLine;
    const theirsChangedLine = theirsLine !== baseLine;

    if (!oursChangedLine && !theirsChangedLine) {
      if (baseLine !== undefined) partialLines.push(baseLine);
    } else if (oursChangedLine && !theirsChangedLine) {
      if (oursLine !== undefined) partialLines.push(oursLine);
    } else if (!oursChangedLine && theirsChangedLine) {
      if (theirsLine !== undefined) partialLines.push(theirsLine);
    } else {
      // Both changed this position
      if (oursLine === theirsLine) {
        if (oursLine !== undefined) partialLines.push(oursLine);
      } else if (oursLine === undefined && theirsLine === undefined) {
        // Both deleted the line – skip it
      } else if (baseLine === undefined) {
        // Both appended different content – include both (deterministic order)
        if (oursLine !== undefined) partialLines.push(oursLine);
        if (theirsLine !== undefined) partialLines.push(theirsLine);
      } else {
        // True line-level conflict – record a placeholder and a conflict entry
        lineConflicts.push({ lineNumber: i + 1, base: baseLine, ours: oursLine, theirs: theirsLine, chosen: 'ours' });
        partialLines.push(null);
      }
    }
  }

  return { partialLines, lineConflicts };
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

  const baseParsed = JSON.parse(baseData) as Record<string, unknown>;
  const oursParsed = JSON.parse(oursData) as Record<string, unknown>;
  const theirsParsed = JSON.parse(theirsData) as Record<string, unknown>;

  const mergedCanvasProps = mergeCanvasProperties(baseParsed, oursParsed, theirsParsed);

  const allIds = new Set([
    ...Object.keys(baseMap),
    ...Object.keys(oursMap),
    ...Object.keys(theirsMap),
  ]);

  const resultObjects: (Record<string, unknown> | null)[] = [];
  const conflicts: MergeConflict[] = [];

  for (const id of allIds) {
    mergeSingleObject(id, baseMap[id], oursMap[id], theirsMap[id], resultObjects, conflicts);
  }

  if (conflicts.length === 0) {
    mergedCanvasProps.objects = resultObjects;
    return { result: JSON.stringify(mergedCanvasProps), autoMerged: true };
  }

  return { conflicts, cleanObjects: resultObjects, baseData, oursData, theirsData, mergedCanvasProps };
}


function mergeCanvasProperties(
  baseParsed: Record<string, unknown>,
  oursParsed: Record<string, unknown>,
  theirsParsed: Record<string, unknown>
): Record<string, unknown> {
  const mergedCanvasProps: Record<string, unknown> = { ...oursParsed };
  delete mergedCanvasProps.objects;

  const allCanvasKeys = new Set([
    ...Object.keys(baseParsed),
    ...Object.keys(oursParsed),
    ...Object.keys(theirsParsed),
  ]);

  for (const key of allCanvasKeys) {
    if (key === 'objects') continue;
    const baseValue = baseParsed[key];
    const oursValue = oursParsed[key];
    const theirsValue = theirsParsed[key];

    const oursChangedProp = JSON.stringify(baseValue) !== JSON.stringify(oursValue);
    const theirsChangedProp = JSON.stringify(baseValue) !== JSON.stringify(theirsValue);

    if (theirsChangedProp && !oursChangedProp) {
      mergedCanvasProps[key] = theirsValue;
    }
  }
  return mergedCanvasProps;
}

function mergeSingleObject(
  id: string,
  base: Record<string, unknown> | undefined,
  ours: Record<string, unknown> | undefined,
  theirs: Record<string, unknown> | undefined,
  resultObjects: (Record<string, unknown> | null)[],
  conflicts: MergeConflict[]
): void {
  const baseProps = base ? extractProps(base) : null;
  const oursProps = ours ? extractProps(ours) : null;
  const theirsProps = theirs ? extractProps(theirs) : null;

  // ── Deleted in both → skip
  if (!ours && !theirs) return;

  // ── Only in one side → take it (prefer keeping over deletion)
  if (ours && !theirs) { resultObjects.push(ours); return; }
  if (!ours && theirs) { resultObjects.push(theirs); return; }

  // ── Present in both
  const oursChanged = base ? !propsEqual(baseProps!, oursProps!) : true;
  const theirsChanged = base ? !propsEqual(baseProps!, theirsProps!) : false;

  if (!oursChanged && !theirsChanged) { resultObjects.push(ours!); return; }
  if (oursChanged && !theirsChanged) { resultObjects.push(ours!); return; }
  if (!oursChanged && theirsChanged) { resultObjects.push(theirs!); return; }

  // ── Both changed → check for property-level conflicts
  const propConflicts: MergeConflict['propConflicts'] = [];
  const mergedObj: Record<string, unknown> = { ...ours! };
  const lineMergedProps = new Map<string, unknown>();

  const allPropKeys = new Set([
    ...Object.keys(oursProps ?? {}),
    ...Object.keys(theirsProps ?? {}),
  ]);

  for (const prop of allPropKeys) {
    const baseValue = baseProps ? baseProps[prop] : undefined;
    const oursValue = oursProps ? oursProps[prop] : undefined;
    const theirsValue = theirsProps ? theirsProps[prop] : undefined;

    const oursChangedProp = JSON.stringify(baseValue) !== JSON.stringify(oursValue);
    const theirsChangedProp = JSON.stringify(baseValue) !== JSON.stringify(theirsValue);

    if (oursChangedProp && theirsChangedProp && JSON.stringify(oursValue) !== JSON.stringify(theirsValue)) {
      if (
        prop === '_mermaidCode' &&
        typeof baseValue === 'string' &&
        typeof oursValue === 'string' &&
        typeof theirsValue === 'string'
      ) {
        const lineMerged = mergeTextLineByLine(baseValue, oursValue, theirsValue);
        if (lineMerged !== null) {
          lineMergedProps.set(prop, lineMerged);
          continue;
        }
        const { partialLines, lineConflicts } = computeMermaidLineMergeDetails(baseValue, oursValue, theirsValue);
        propConflicts.push({
          prop, base: baseValue, ours: oursValue, theirs: theirsValue, chosen: 'ours',
          mermaidLineConflicts: lineConflicts,
          mermaidPartialLines: partialLines,
        });
        continue;
      }
      propConflicts.push({ prop, base: baseValue, ours: oursValue, theirs: theirsValue, chosen: 'ours' });
    }
  }

  if (propConflicts.length === 0) {
    for (const prop of allPropKeys) {
      const baseValue = baseProps ? baseProps[prop] : undefined;
      const theirsValue = theirsProps ? theirsProps[prop] : undefined;
      if (lineMergedProps.has(prop)) {
        mergedObj[prop] = lineMergedProps.get(prop);
      } else if (JSON.stringify(baseValue) !== JSON.stringify(theirsValue)) {
        mergedObj[prop] = theirsValue;
      }
    }
    resultObjects.push(mergedObj);
  } else {
    conflicts.push({
      id,
      label: getObjLabel(ours ?? theirs),
      oursObj: ours!,
      theirsObj: theirs!,
      propConflicts,
      mergedObj,
    });
    resultObjects.push(null);
  }
}
