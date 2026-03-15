import { describe, it, expect } from 'vitest';
import { findLCA, getObjLabel, threeWayMerge, mergeTextLineByLine } from './mergeEngine';
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

  it('labels mermaid images as Mermaid (not generic image)', () => {
    const label = getObjLabel({ type: 'image', _isMermaid: true, _id: 'obj_mer001' });
    expect(label).toContain('Mermaid');
    expect(label).not.toContain('image');
  });

  it('labels plain images without _isMermaid as their raw type', () => {
    const label = getObjLabel({ type: 'image', _id: 'obj_img001' });
    expect(label).toContain('image');
    expect(label).not.toContain('Mermaid');
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

    it('preserves canvas-level properties (e.g. background) from ours, not base', () => {
      const baseObj = { type: 'rect', _id: 'obj_bg1', fill: '#f00' };
      const base = JSON.stringify({ version: '5.3.1', objects: [baseObj], background: '#000000' });
      // ours changed background to white
      const ours = JSON.stringify({ version: '5.3.1', objects: [baseObj], background: '#ffffff' });
      // theirs added a new object, did not touch background
      const newObj = { type: 'ellipse', _id: 'obj_bg2', fill: '#0f0' };
      const theirs = JSON.stringify({ version: '5.3.1', objects: [baseObj, newObj], background: '#000000' });

      const result = threeWayMerge(base, ours, theirs);
      expect('result' in result).toBe(true);
      if ('result' in result) {
        const parsed = JSON.parse(result.result) as { objects: Record<string, unknown>[]; background: string };
        expect(parsed.background).toBe('#ffffff'); // must come from ours, not base
        expect(parsed.objects).toHaveLength(2);
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

// ─── mergeTextLineByLine ──────────────────────────────────────────────────────

describe('mergeTextLineByLine', () => {
  it('returns ours when ours equals theirs (no change)', () => {
    const code = 'graph TD\n    A --> B';
    expect(mergeTextLineByLine(code, code, code)).toBe(code);
  });

  it('returns theirs when ours is unchanged from base', () => {
    const base = 'graph TD\n    A --> B';
    const theirs = 'graph TD\n    A --> B\n    B --> C';
    expect(mergeTextLineByLine(base, base, theirs)).toBe(theirs);
  });

  it('returns ours when theirs is unchanged from base', () => {
    const base = 'graph TD\n    A --> B';
    const ours = 'graph TD\n    A --> B\n    B --> C';
    expect(mergeTextLineByLine(base, ours, base)).toBe(ours);
  });

  it('auto-merges when both sides change different lines', () => {
    const base = 'graph TD\n    A --> B\n    C --> D';
    const ours = 'graph TD\n    A --> B\n    C --> E';   // changed line 2
    const theirs = 'graph TD\n    A --> X\n    C --> D'; // changed line 1
    const merged = mergeTextLineByLine(base, ours, theirs);
    expect(merged).toBe('graph TD\n    A --> X\n    C --> E');
  });

  it('auto-merges when ours added a line and theirs changed an existing line', () => {
    const base = 'graph TD\n    A --> B';
    const ours = 'graph TD\n    A --> B\n    B --> C';  // added line
    const theirs = 'graph TD\n    A --> X';              // changed line 1
    // base[0]="graph TD", ours[0]="graph TD" (unchanged), theirs[0]="graph TD" (unchanged)
    // base[1]="    A --> B", ours[1]="    A --> B" (unchanged), theirs[1]="    A --> X" (changed)
    // base[2]=undefined, ours[2]="    B --> C" (changed), theirs[2]=undefined (unchanged)
    const merged = mergeTextLineByLine(base, ours, theirs);
    expect(merged).toBe('graph TD\n    A --> X\n    B --> C');
  });

  it('auto-merges when both sides append different new lines at the end', () => {
    // Both sides extended the base by appending a new line at the same index.
    // The index-based algorithm includes both in a deterministic order (ours first).
    const base = 'graph TD\n    A --> B';
    const ours = 'graph TD\n    A --> B\n    B --> C';   // appended B-->C
    const theirs = 'graph TD\n    A --> B\n    C --> D'; // appended C-->D
    const merged = mergeTextLineByLine(base, ours, theirs);
    expect(merged).toBe('graph TD\n    A --> B\n    B --> C\n    C --> D');
  });

  it('returns null when the same line is modified differently on both sides', () => {
    const base = 'graph TD\n    A --> B';
    const ours = 'graph TD\n    A --> X';   // changed line 1
    const theirs = 'graph TD\n    A --> Y'; // changed line 1 differently
    expect(mergeTextLineByLine(base, ours, theirs)).toBeNull();
  });

  it('handles both sides making the same change (no conflict)', () => {
    const base = 'graph TD\n    A --> B';
    const same = 'graph TD\n    A --> C'; // both changed line 1 to same value
    expect(mergeTextLineByLine(base, same, same)).toBe(same);
  });

  it('handles both sides deleting the same line (no conflict)', () => {
    const base = 'line1\nline2\nline3';
    const ours = 'line1\nline3';   // deleted line2 (index-based: line2 changed from "line2" to "line3")
    const theirs = 'line1\nline3'; // same deletion
    // Both changed line index 1 from "line2" to "line3" and line index 2 from "line3" to undefined
    // → same change, no conflict
    expect(mergeTextLineByLine(base, ours, theirs)).toBe(ours);
  });

  it('handles empty base with non-empty ours', () => {
    expect(mergeTextLineByLine('', 'A --> B', '')).toBe('A --> B');
  });

  it('handles empty base with non-empty theirs', () => {
    expect(mergeTextLineByLine('', '', 'A --> B')).toBe('A --> B');
  });

  it('handles all-empty inputs', () => {
    expect(mergeTextLineByLine('', '', '')).toBe('');
  });

  it('handles empty ours (ours cleared the diagram)', () => {
    const base = 'graph TD\n    A --> B';
    // ours cleared; theirs unchanged → take ours (deletion)
    expect(mergeTextLineByLine(base, '', base)).toBe('');
  });
});

// ─── threeWayMerge – mermaid line-level auto-merge ───────────────────────────

describe('threeWayMerge – mermaid _mermaidCode', () => {
  it('auto-merges when both sides edit different lines of mermaid code', () => {
    const mermaidBase = 'graph TD\n    A --> B\n    C --> D';
    // ours changed line 2, theirs changed line 1
    const mermaidOurs = 'graph TD\n    A --> B\n    C --> E';
    const mermaidTheirs = 'graph TD\n    A --> X\n    C --> D';

    const baseObj = { type: 'image', _id: 'obj_mer1', _isMermaid: true, _mermaidCode: mermaidBase };
    const base = canvasWithObjects([baseObj]);
    const ours = canvasWithObjects([{ ...baseObj, _mermaidCode: mermaidOurs }]);
    const theirs = canvasWithObjects([{ ...baseObj, _mermaidCode: mermaidTheirs }]);

    const result = threeWayMerge(base, ours, theirs);
    expect('result' in result).toBe(true);
    if ('result' in result) {
      const parsed = JSON.parse(result.result) as { objects: Record<string, unknown>[] };
      expect(parsed.objects[0]._mermaidCode).toBe('graph TD\n    A --> X\n    C --> E');
    }
  });

  it('reports a conflict when both sides changed the same mermaid line differently', () => {
    const mermaidBase = 'graph TD\n    A --> B';
    const mermaidOurs = 'graph TD\n    A --> X';
    const mermaidTheirs = 'graph TD\n    A --> Y';

    const baseObj = { type: 'image', _id: 'obj_mer2', _isMermaid: true, _mermaidCode: mermaidBase };
    const base = canvasWithObjects([baseObj]);
    const ours = canvasWithObjects([{ ...baseObj, _mermaidCode: mermaidOurs }]);
    const theirs = canvasWithObjects([{ ...baseObj, _mermaidCode: mermaidTheirs }]);

    const result = threeWayMerge(base, ours, theirs);
    expect('conflicts' in result).toBe(true);
    if ('conflicts' in result) {
      const conflict = result.conflicts.find((c) => c.id === 'obj_mer2');
      expect(conflict).toBeDefined();
      const pc = conflict?.propConflicts.find((p) => p.prop === '_mermaidCode');
      expect(pc).toBeDefined();
      expect(pc?.ours).toBe(mermaidOurs);
      expect(pc?.theirs).toBe(mermaidTheirs);
    }
  });
});
