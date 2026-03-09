/**
 * GitModel – encapsulates the in-memory commit graph, branch map, and HEAD pointer.
 *
 * Merge logic delegates to mergeEngine (imported below) so that both are
 * independently testable.
 */

import { Commit, MergeResult, BRANCH_COLORS } from '../types';
import { findLCA, threeWayMerge } from './mergeEngine';

// Result shapes returned by merge()
export type CleanMergeReturn = { done: true; sha: string; mergedData: string };
export type ConflictMergeReturn = { conflicts: import('../types').ConflictMergeResult };

export class GitModel {
  commits: Record<string, Commit> = {};
  branches: Record<string, string> = {};
  HEAD = 'main';
  detached: string | null = null;

  /** Called with a user-facing error string when an operation cannot proceed. */
  private readonly onError: (msg: string) => void;

  constructor(onError: (msg: string) => void) {
    this.onError = onError;
  }

  /** Generate a random short SHA using crypto.randomUUID(). */
  generateSha(): string {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }

  /** @deprecated Use generateSha() instead. */
  _sha(): string {
    return this.generateSha();
  }

  /** Create the initial commit for a fresh canvas. */
  init(canvasJson: string): string {
    const sha = this._sha();
    this.commits[sha] = {
      sha,
      parent: null,
      parents: [],
      message: 'Initial commit',
      ts: Date.now(),
      canvas: canvasJson,
      branch: 'main',
      isMerge: false,
    };
    this.branches['main'] = sha;
    this.HEAD = 'main';
    this.detached = null;
    return sha;
  }

  /** Return the SHA currently pointed to by HEAD (branch tip or detached SHA). */
  currentSHA(): string | null {
    if (this.detached) return this.detached;
    return this.branches[this.HEAD] ?? null;
  }

  /** Record a new commit on the current branch. Returns null on failure. */
  commit(canvasJson: string, message: string): string | null {
    if (this.detached) {
      this.onError('⚠ Detached HEAD — create a branch first!');
      return null;
    }
    const parent = this.currentSHA();
    const sha = this._sha();
    this.commits[sha] = {
      sha,
      parent,
      parents: parent ? [parent] : [],
      message,
      ts: Date.now(),
      canvas: canvasJson,
      branch: this.HEAD,
      isMerge: false,
    };
    this.branches[this.HEAD] = sha;
    return sha;
  }

  /** Create a new branch, optionally from a specific SHA. Returns false if it already exists. */
  createBranch(name: string, fromSHA?: string | null): boolean {
    if (this.branches[name] !== undefined) {
      this.onError('Branch already exists');
      return false;
    }
    this.branches[name] = fromSHA ?? this.currentSHA() ?? '';
    return true;
  }

  /** Checkout a branch by name or a commit by SHA. Returns the target SHA or null. */
  checkout(branchOrSHA: string): string | null {
    if (this.branches[branchOrSHA] !== undefined) {
      this.HEAD = branchOrSHA;
      this.detached = null;
      return this.branches[branchOrSHA];
    }
    if (this.commits[branchOrSHA]) {
      this.detached = branchOrSHA;
      return branchOrSHA;
    }
    return null;
  }

  /** Enter detached HEAD state at the given SHA. */
  checkoutCommit(sha: string): string {
    this.detached = sha;
    return sha;
  }

  /**
   * Perform a 3-way merge of `sourceBranch` into the current branch.
   * Returns `{ done, sha, mergedData }` on success or `{ conflicts }` when
   * user resolution is needed.
   */
  merge(
    sourceBranch: string,
  ): CleanMergeReturn | ConflictMergeReturn | null {
    if (this.detached) {
      this.onError('⚠ Cannot merge in detached HEAD');
      return null;
    }

    const targetBranch = this.HEAD;
    const targetSHA = this.branches[targetBranch];
    const sourceSHA = this.branches[sourceBranch];

    if (!sourceSHA) { this.onError('Source branch not found'); return null; }
    if (targetSHA === sourceSHA) { this.onError('Already up to date'); return null; }

    const lcaSHA = findLCA(targetSHA, sourceSHA, this.commits);
    const baseData = lcaSHA
      ? this.commits[lcaSHA].canvas
      : JSON.stringify({ version: '5.3.1', objects: [], background: '#0a0a0f' });
    const oursData = this.commits[targetSHA].canvas;
    const theirsData = this.commits[sourceSHA].canvas;

    const mergeResult = threeWayMerge(baseData, oursData, theirsData);

    if ('result' in mergeResult) {
      // Clean merge – create the merge commit now
      const sha = this._sha();
      this.commits[sha] = {
        sha,
        parent: targetSHA,
        parents: [targetSHA, sourceSHA],
        message: `Merge '${sourceBranch}' into '${targetBranch}'`,
        ts: Date.now(),
        canvas: mergeResult.result,
        branch: targetBranch,
        isMerge: true,
      };
      this.branches[targetBranch] = sha;
      return { done: true, sha, mergedData: mergeResult.result };
    }

    // Conflicts – caller must resolve, then call applyMergeResolution
    (mergeResult as ConflictMergeResult).branchNames = {
      ours: targetBranch,
      theirs: sourceBranch,
      targetBranch,
      sourceBranch,
      targetSHA,
      sourceSHA,
    };
    return { conflicts: mergeResult as ConflictMergeResult };
  }

  /** Return the display color for a branch by its position in the branch map. */
  branchColor(name: string): string {
    const names = Object.keys(this.branches);
    const idx = names.indexOf(name);
    return BRANCH_COLORS[idx % BRANCH_COLORS.length];
  }
}

// ── Helper type alias used in merge() return type ────────────────────────────
type ConflictMergeResult = import('../types').ConflictMergeResult;
