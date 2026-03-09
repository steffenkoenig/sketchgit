import { describe, it, expect, vi } from 'vitest';
import { GitModel } from './gitModel';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyCanvas(): string {
  return JSON.stringify({ version: '5.3.1', objects: [], background: '#0a0a0f' });
}

function canvasWithColor(bg: string): string {
  return JSON.stringify({ version: '5.3.1', objects: [], background: bg });
}

function newModel(): GitModel {
  return new GitModel(vi.fn());
}

// ─── init ─────────────────────────────────────────────────────────────────────

describe('GitModel.init', () => {
  it('creates an initial commit on main branch', () => {
    const git = newModel();
    const sha = git.init(emptyCanvas());
    expect(sha).toBeTruthy();
    expect(git.commits[sha]).toBeDefined();
    expect(git.commits[sha].message).toBe('Initial commit');
    expect(git.branches['main']).toBe(sha);
    expect(git.HEAD).toBe('main');
    expect(git.detached).toBeNull();
  });

  it('stores the canvas data in the initial commit', () => {
    const git = newModel();
    const data = emptyCanvas();
    const sha = git.init(data);
    expect(git.commits[sha].canvas).toBe(data);
  });

  it('sets parent to null and parents to [] for initial commit', () => {
    const git = newModel();
    const sha = git.init(emptyCanvas());
    expect(git.commits[sha].parent).toBeNull();
    expect(git.commits[sha].parents).toEqual([]);
  });
});

// ─── currentSHA ───────────────────────────────────────────────────────────────

describe('GitModel.currentSHA', () => {
  it('returns branch tip SHA when not detached', () => {
    const git = newModel();
    const sha = git.init(emptyCanvas());
    expect(git.currentSHA()).toBe(sha);
  });

  it('returns detached SHA when in detached HEAD state', () => {
    const git = newModel();
    const sha = git.init(emptyCanvas());
    git.checkoutCommit(sha);
    expect(git.currentSHA()).toBe(sha);
  });

  it('returns null before any commits', () => {
    const git = newModel();
    expect(git.currentSHA()).toBeNull();
  });
});

// ─── commit ───────────────────────────────────────────────────────────────────

describe('GitModel.commit', () => {
  it('creates a new commit on the current branch', () => {
    const git = newModel();
    const initSha = git.init(emptyCanvas());
    const c2 = git.commit(emptyCanvas(), 'second');
    expect(c2).toBeTruthy();
    expect(git.branches['main']).toBe(c2!);
    expect(git.commits[c2!].parent).toBe(initSha);
    expect(git.commits[c2!].parents).toEqual([initSha]);
  });

  it('advances the branch pointer', () => {
    const git = newModel();
    git.init(emptyCanvas());
    const sha2 = git.commit(emptyCanvas(), 'b');
    expect(git.branches[git.HEAD]).toBe(sha2);
  });

  it('returns null when in detached HEAD state and calls onError', () => {
    const onError = vi.fn();
    const git = new GitModel(onError);
    const sha = git.init(emptyCanvas());
    git.checkoutCommit(sha);
    const result = git.commit(emptyCanvas(), 'should fail');
    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('records isMerge as false for regular commits', () => {
    const git = newModel();
    git.init(emptyCanvas());
    const sha = git.commit(emptyCanvas(), 'regular');
    expect(git.commits[sha!].isMerge).toBe(false);
  });
});

// ─── createBranch ─────────────────────────────────────────────────────────────

describe('GitModel.createBranch', () => {
  it('creates a branch at the current HEAD by default', () => {
    const git = newModel();
    const sha = git.init(emptyCanvas());
    const ok = git.createBranch('feature');
    expect(ok).toBe(true);
    expect(git.branches['feature']).toBe(sha);
  });

  it('creates a branch at a specific SHA', () => {
    const git = newModel();
    const sha1 = git.init(emptyCanvas());
    git.commit(emptyCanvas(), 'second');
    const ok = git.createBranch('old-feature', sha1);
    expect(ok).toBe(true);
    expect(git.branches['old-feature']).toBe(sha1);
  });

  it('returns false and calls onError when branch already exists', () => {
    const onError = vi.fn();
    const git = new GitModel(onError);
    git.init(emptyCanvas());
    git.createBranch('dupe');
    const ok = git.createBranch('dupe');
    expect(ok).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
  });
});

// ─── checkout ─────────────────────────────────────────────────────────────────

describe('GitModel.checkout', () => {
  it('switches HEAD to an existing branch', () => {
    const git = newModel();
    git.init(emptyCanvas());
    git.createBranch('feature');
    const sha = git.checkout('feature');
    expect(sha).toBe(git.branches['feature']);
    expect(git.HEAD).toBe('feature');
    expect(git.detached).toBeNull();
  });

  it('enters detached HEAD when given a known commit SHA', () => {
    const git = newModel();
    const sha = git.init(emptyCanvas());
    const result = git.checkout(sha);
    expect(result).toBe(sha);
    expect(git.detached).toBe(sha);
  });

  it('returns null for unknown branch/SHA', () => {
    const git = newModel();
    git.init(emptyCanvas());
    expect(git.checkout('nonexistent')).toBeNull();
  });
});

// ─── merge (clean) ────────────────────────────────────────────────────────────

describe('GitModel.merge – clean merge', () => {
  it('performs a fast-forward-style merge when feature only adds an object', () => {
    const git = newModel();
    const initSha = git.init(emptyCanvas());
    git.createBranch('feature');
    git.checkout('feature');
    const featureSha = git.commit(
      canvasWithColor('#111'),
      'feature commit',
    );

    git.checkout('main');
    const result = git.merge('feature');
    expect(result).not.toBeNull();
    expect('done' in result!).toBe(true);
    if (result && 'done' in result) {
      expect(result.done).toBe(true);
      // Merge commit has both parents
      const mergeSha = result.sha;
      expect(git.commits[mergeSha].parents).toContain(initSha);
      expect(git.commits[mergeSha].parents).toContain(featureSha);
      expect(git.commits[mergeSha].isMerge).toBe(true);
    }
  });

  it('returns null when source branch does not exist', () => {
    const onError = vi.fn();
    const git = new GitModel(onError);
    git.init(emptyCanvas());
    expect(git.merge('nonexistent')).toBeNull();
    expect(onError).toHaveBeenCalled();
  });

  it('returns null in detached HEAD state', () => {
    const onError = vi.fn();
    const git = new GitModel(onError);
    const sha = git.init(emptyCanvas());
    git.checkoutCommit(sha);
    expect(git.merge('main')).toBeNull();
    expect(onError).toHaveBeenCalled();
  });

  it('returns null when source and target are already the same SHA', () => {
    const onError = vi.fn();
    const git = new GitModel(onError);
    git.init(emptyCanvas());
    git.createBranch('same');
    expect(git.merge('same')).toBeNull();
    expect(onError).toHaveBeenCalled();
  });
});

// ─── merge (conflict) ─────────────────────────────────────────────────────────

describe('GitModel.merge – conflicts', () => {
  it('returns conflicts when both sides change the same property', () => {
    const git = newModel();
    // Common base: one object
    const baseObj = { type: 'rect', _id: 'obj_test', fill: '#f00' };
    git.init(
      JSON.stringify({ version: '5.3.1', objects: [baseObj], background: '#000' }),
    );

    // feature branch: change fill to blue
    git.createBranch('feature');
    git.checkout('feature');
    git.commit(
      JSON.stringify({ version: '5.3.1', objects: [{ ...baseObj, fill: '#00f' }], background: '#000' }),
      'feature fill',
    );

    // main branch: change fill to green
    git.checkout('main');
    git.commit(
      JSON.stringify({ version: '5.3.1', objects: [{ ...baseObj, fill: '#0f0' }], background: '#000' }),
      'main fill',
    );

    const result = git.merge('feature');
    expect(result).not.toBeNull();
    expect('conflicts' in result!).toBe(true);
  });
});

// ─── branchColor ──────────────────────────────────────────────────────────────

describe('GitModel.branchColor', () => {
  it('returns a hex color string', () => {
    const git = newModel();
    git.init(emptyCanvas());
    const color = git.branchColor('main');
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('returns consistent colors for the same branch', () => {
    const git = newModel();
    git.init(emptyCanvas());
    expect(git.branchColor('main')).toBe(git.branchColor('main'));
  });
});
