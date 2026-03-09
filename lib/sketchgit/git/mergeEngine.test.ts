import { describe, it, expect } from 'vitest';
import { findLCA, getObjLabel, threeWayMerge } from './mergeEngine';
import { Commit } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCommit(
  sha: string,
  parents: string[],
  canvas = emptyCanvas(),
): Commit {
  return {
    sha,
    parent: parents[0] ?? null,
    parents,
    message: `commit ${sha}`,
    ts: Date.now(),
    canvas,
    branch: 'main',
    isMerge: parents.length > 1,
  };
}

function emptyCanvas(objects: Record<string, unknown>[] = []): string {
  return JSON.stringify({ version: '5.3.1', objects, background: '#0a0a0f' });
}

function canvasWithObjects(objects: Record<string, unknown>[]): string {
  return emptyCanvas(objects);
}

// ─── findLCA ──────────────────────────────────────────────────────────────────

describe('findLCA', () => {
  it('returns the direct parent when one branch is a direct ancestor', () => {
    // A → B → C (main)
    //       ↘ D  (feature)
    const commits: Record<string, Commit> = {
      A: makeCommit('A', []),
      B: makeCommit('B', ['A']),
      C: makeCommit('C', ['B']),
      D: makeCommit('D', ['B']),
    };
    expect(findLCA('C', 'D', commits)).toBe('B');
  });

  it('returns the common ancestor in a diverged history', () => {
    // A → B → C → E
    //     ↘ D → F
    const commits: Record<string, Commit> = {
      A: makeCommit('A', []),
      B: makeCommit('B', ['A']),
      C: makeCommit('C', ['B']),
      D: makeCommit('D', ['B']),
      E: makeCommit('E', ['C']),
      F: makeCommit('F', ['D']),
    };
    expect(findLCA('E', 'F', commits)).toBe('B');
  });

  it('returns the SHA itself when one arg is an ancestor of the other', () => {
    const commits: Record<string, Commit> = {
      A: makeCommit('A', []),
      B: makeCommit('B', ['A']),
      C: makeCommit('C', ['B']),
    };
    // C's ancestors include B, and B is a parent of C → LCA(C, B) = B
    expect(findLCA('C', 'B', commits)).toBe('B');
  });

  it('returns null when commits have no common ancestor', () => {
    const commits: Record<string, Commit> = {
      A: makeCommit('A', []),
      B: makeCommit('B', []),
    };
    expect(findLCA('A', 'B', commits)).toBeNull();
  });

  it('returns the same SHA when both args are the same commit', () => {
    const commits: Record<string, Commit> = {
      A: makeCommit('A', []),
    };
    expect(findLCA('A', 'A', commits)).toBe('A');
  });
});

// ─── getObjLabel ──────────────────────────────────────────────────────────────

describe('getObjLabel', () => {
  it('returns type label with id fragment', () => {
    const label = getObjLabel({ type: 'rect', _id: 'obj_abcdef' });
    expect(label).toContain('Rectangle');
    expect(label).toContain('#');
  });

  it('uses raw type for unknown types', () => {
    const label = getObjLabel({ type: 'star', _id: 'obj_xyz123' });
    expect(label).toContain('star');
  });

  it('returns fallback for null input', () => {
    expect(getObjLabel(null)).toBe('Object');
  });

  it('returns fallback for undefined input', () => {
    expect(getObjLabel(undefined)).toBe('Object');
  });

  it('uses ? for id when _id is absent', () => {
    const label = getObjLabel({ type: 'rect' });
    expect(label).toContain('#?');
  });
});

// ─── threeWayMerge ────────────────────────────────────────────────────────────

describe('threeWayMerge', () => {
  describe('clean merges (no conflicts)', () => {
    it('returns autoMerged:true when nothing changed on either side', () => {
      const base = emptyCanvas();
      const result = threeWayMerge(base, base, base);
      expect('result' in result).toBe(true);
      if ('result' in result) {
        expect(result.autoMerged).toBe(true);
      }
    });

    it('fast-forward: takes their new object when ours is unchanged', () => {
      const base = emptyCanvas();
      const ours = emptyCanvas();
      const theirs = canvasWithObjects([{ type: 'rect', _id: 'obj_aaa', fill: '#f00' }]);
      const result = threeWayMerge(base, ours, theirs);
      expect('result' in result).toBe(true);
      if ('result' in result) {
        const parsed = JSON.parse(result.result) as { objects: Record<string, unknown>[] };
        expect(parsed.objects).toHaveLength(1);
        expect(parsed.objects[0]._id).toBe('obj_aaa');
      }
    });

    it('keeps our new object when theirs is unchanged', () => {
      const base = emptyCanvas();
      const ours = canvasWithObjects([{ type: 'ellipse', _id: 'obj_bbb', fill: '#00f' }]);
      const theirs = emptyCanvas();
      const result = threeWayMerge(base, ours, theirs);
      expect('result' in result).toBe(true);
      if ('result' in result) {
        const parsed = JSON.parse(result.result) as { objects: Record<string, unknown>[] };
        expect(parsed.objects).toHaveLength(1);
        expect(parsed.objects[0]._id).toBe('obj_bbb');
      }
    });

    it('auto-merges non-overlapping property changes', () => {
      // base has obj_aaa with fill red and left 10
      const baseObj = { type: 'rect', _id: 'obj_aaa', fill: '#f00', left: 10 };
      const base = canvasWithObjects([baseObj]);
      // ours changed fill to blue
      const oursObj = { ...baseObj, fill: '#00f' };
      const ours = canvasWithObjects([oursObj]);
      // theirs changed left to 50
      const theirsObj = { ...baseObj, left: 50 };
      const theirs = canvasWithObjects([theirsObj]);

      const result = threeWayMerge(base, ours, theirs);
      expect('result' in result).toBe(true);
      if ('result' in result) {
        const parsed = JSON.parse(result.result) as { objects: Record<string, unknown>[] };
        const merged = parsed.objects[0];
        expect(merged.fill).toBe('#00f');
        expect(merged.left).toBe(50);
      }
    });

    it('excludes objects deleted on both sides', () => {
      const obj = { type: 'rect', _id: 'obj_del' };
      const base = canvasWithObjects([obj]);
      const ours = emptyCanvas();
      const theirs = emptyCanvas();
      const result = threeWayMerge(base, ours, theirs);
      if ('result' in result) {
        const parsed = JSON.parse(result.result) as { objects: Record<string, unknown>[] };
        expect(parsed.objects).toHaveLength(0);
      }
    });
  });

  describe('conflict detection', () => {
    it('reports a conflict when both sides change the same property differently', () => {
      const baseObj = { type: 'rect', _id: 'obj_ccc', fill: '#f00' };
      const base = canvasWithObjects([baseObj]);
      const ours = canvasWithObjects([{ ...baseObj, fill: '#00f' }]);
      const theirs = canvasWithObjects([{ ...baseObj, fill: '#0f0' }]);

      const result = threeWayMerge(base, ours, theirs);
      expect('conflicts' in result).toBe(true);
      if ('conflicts' in result) {
        expect(result.conflicts).toHaveLength(1);
        expect(result.conflicts[0].propConflicts).toHaveLength(1);
        expect(result.conflicts[0].propConflicts[0].prop).toBe('fill');
        expect(result.conflicts[0].propConflicts[0].ours).toBe('#00f');
        expect(result.conflicts[0].propConflicts[0].theirs).toBe('#0f0');
      }
    });

    it('defaults chosen to "ours" for each conflict', () => {
      const baseObj = { type: 'rect', _id: 'obj_ddd', fill: '#f00' };
      const base = canvasWithObjects([baseObj]);
      const ours = canvasWithObjects([{ ...baseObj, fill: '#aaa' }]);
      const theirs = canvasWithObjects([{ ...baseObj, fill: '#bbb' }]);

      const result = threeWayMerge(base, ours, theirs);
      if ('conflicts' in result) {
        for (const c of result.conflicts) {
          for (const pc of c.propConflicts) {
            expect(pc.chosen).toBe('ours');
          }
        }
      }
    });

    it('places null placeholder in cleanObjects for conflicted objects', () => {
      const baseObj = { type: 'rect', _id: 'obj_eee', fill: '#f00' };
      const cleanObj = { type: 'ellipse', _id: 'obj_fff', left: 5 };
      const base = canvasWithObjects([baseObj, cleanObj]);
      const ours = canvasWithObjects([{ ...baseObj, fill: '#111' }, cleanObj]);
      const theirs = canvasWithObjects([{ ...baseObj, fill: '#222' }, cleanObj]);

      const result = threeWayMerge(base, ours, theirs);
      if ('conflicts' in result) {
        // One null placeholder for conflicted obj, one real object for clean obj
        const nullCount = result.cleanObjects.filter((o) => o === null).length;
        expect(nullCount).toBe(1);
        expect(result.cleanObjects.some((o) => o !== null && o._id === 'obj_fff')).toBe(true);
      }
    });

    it('includes baseData, oursData, theirsData in the conflict result', () => {
      const baseObj = { type: 'rect', _id: 'obj_ggg', fill: '#f00' };
      const base = canvasWithObjects([baseObj]);
      const ours = canvasWithObjects([{ ...baseObj, fill: '#111' }]);
      const theirs = canvasWithObjects([{ ...baseObj, fill: '#222' }]);

      const result = threeWayMerge(base, ours, theirs);
      if ('conflicts' in result) {
        expect(result.baseData).toBe(base);
        expect(result.oursData).toBe(ours);
        expect(result.theirsData).toBe(theirs);
      }
    });
  });
});
