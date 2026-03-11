/**
 * Tests for the P024 layout + virtualization helpers in timelineRenderer.ts.
 *
 * These tests focus on the two new pure functions:
 *  - computeLayout()        – converts GitModel state to screen-space positions
 *  - getVisibleCommits()    – filters layouts to the current scroll viewport
 *
 * They do not require a DOM (no `@vitest-environment jsdom`) and run in Node.
 * The existing renderTimeline tests in timelineRenderer.test.ts cover the DOM layer.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GitModel } from '../git/gitModel';
import { computeLayout, getVisibleCommits, TL } from './timelineRenderer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGit(numExtraCommits = 0): GitModel {
  const git = new GitModel(() => {});
  const canvas = JSON.stringify({ version: '5.3.1', objects: [] });
  git.init(canvas);
  for (let i = 0; i < numExtraCommits; i++) {
    git.commit(canvas, `commit ${i + 1}`);
  }
  return git;
}

// ─── computeLayout() ──────────────────────────────────────────────────────────

describe('computeLayout()', () => {
  it('returns an empty array when there are no commits', () => {
    const git = new GitModel(() => {});
    expect(computeLayout(git)).toEqual([]);
  });

  it('returns one layout entry per commit', () => {
    const git = makeGit(4); // init + 4 extra = 5 commits
    expect(computeLayout(git)).toHaveLength(5);
  });

  it('assigns x positions starting at PAD_X + COL_W/2 for the first commit', () => {
    const git = makeGit(0);
    const layouts = computeLayout(git);
    const expectedX = TL.PAD_X + TL.COL_W / 2;
    expect(layouts[0].x).toBe(expectedX);
  });

  it('increments x by COL_W for each subsequent commit', () => {
    const git = makeGit(2);
    const layouts = computeLayout(git);
    expect(layouts[1].x - layouts[0].x).toBe(TL.COL_W);
    expect(layouts[2].x - layouts[1].x).toBe(TL.COL_W);
  });

  it('assigns y positions based on the branch row', () => {
    const git = makeGit(0);
    const layouts = computeLayout(git);
    const expectedY = TL.PAD_Y + TL.ROW_H / 2; // first branch row
    expect(layouts[0].y).toBe(expectedY);
  });

  it('places commits on different branches at different y positions', () => {
    const git = makeGit(0);
    const canvas = JSON.stringify({ version: '5.3.1', objects: [] });
    git.createBranch('feature');
    git.checkout('feature');
    git.commit(canvas, 'feature commit');

    const layouts = computeLayout(git);
    const mainY    = layouts.find((l) => l.branch === 'main')!.y;
    const featureY = layouts.find((l) => l.branch === 'feature')!.y;
    expect(mainY).not.toBe(featureY);
    expect(Math.abs(mainY - featureY)).toBe(TL.ROW_H);
  });

  it('marks the HEAD commit as isHead = true', () => {
    const git = makeGit(2);
    const headSha = git.currentSHA();
    const layouts = computeLayout(git);
    const headLayout = layouts.find((l) => l.sha === headSha);
    expect(headLayout).toBeDefined();
    expect(headLayout!.isHead).toBe(true);
  });

  it('marks non-HEAD commits as isHead = false', () => {
    const git = makeGit(2);
    const headSha = git.currentSHA();
    const layouts = computeLayout(git);
    const nonHeadLayouts = layouts.filter((l) => l.sha !== headSha);
    expect(nonHeadLayouts.every((l) => !l.isHead)).toBe(true);
  });

  it('exposes the branch color for each commit', () => {
    const git = makeGit(0);
    const layouts = computeLayout(git);
    expect(typeof layouts[0].color).toBe('string');
    expect(layouts[0].color).toMatch(/^#/);
  });

  it('exposes parent sha links', () => {
    const git = makeGit(1);
    const layouts = computeLayout(git);
    const second = layouts[1];
    expect(second.parents).toHaveLength(1);
    expect(second.parents[0]).toBe(layouts[0].sha);
  });
});

// ─── getVisibleCommits() ──────────────────────────────────────────────────────

describe('getVisibleCommits()', () => {
  let layouts: ReturnType<typeof computeLayout>;

  beforeEach(() => {
    const git = makeGit(19); // 20 total commits spread across x
    layouts = computeLayout(git);
  });

  it('returns all commits when the viewport covers the full width', () => {
    const totalWidth = layouts[layouts.length - 1].x + TL.COL_W;
    const visible = getVisibleCommits(layouts, 0, totalWidth, 0);
    expect(visible).toHaveLength(layouts.length);
  });

  it('returns fewer commits when the viewport is narrow (no overscan)', () => {
    const visible = getVisibleCommits(layouts, 0, TL.COL_W * 3, 0);
    expect(visible.length).toBeLessThan(layouts.length);
  });

  it('includes overscan commits beyond the right edge', () => {
    const noOverscan  = getVisibleCommits(layouts, 0, TL.COL_W, 0);
    const withOverscan = getVisibleCommits(layouts, 0, TL.COL_W, 5);
    expect(withOverscan.length).toBeGreaterThan(noOverscan.length);
  });

  it('includes overscan commits before the left edge when scrolled', () => {
    const scrollLeft = layouts[10].x; // scroll to commit 10
    const noOverscan  = getVisibleCommits(layouts, scrollLeft, TL.COL_W, 0);
    const withOverscan = getVisibleCommits(layouts, scrollLeft, TL.COL_W, 5);
    expect(withOverscan.length).toBeGreaterThanOrEqual(noOverscan.length);
  });

  it('returns an empty array when the scroll position is beyond all commits', () => {
    const visible = getVisibleCommits(layouts, 999999, TL.COL_W, 0);
    expect(visible).toHaveLength(0);
  });

  it('returns an empty array for empty layouts', () => {
    expect(getVisibleCommits([], 0, 800)).toHaveLength(0);
  });

  it('maintains consistent ordering (same order as input layouts)', () => {
    const visible = getVisibleCommits(layouts, 0, TL.COL_W * 5, 0);
    for (let i = 1; i < visible.length; i++) {
      expect(visible[i].x).toBeGreaterThanOrEqual(visible[i - 1].x);
    }
  });
});
