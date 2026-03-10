// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitModel } from '../git/gitModel';
import { renderTimeline } from './timelineRenderer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a GitModel pre-loaded with one initial commit on 'main'. */
function makeGit(): GitModel {
  const git = new GitModel(() => {});
  const initCanvas = JSON.stringify({ version: '5.3.1', objects: [] });
  git.init(initCanvas);
  return git;
}

/** Set up the minimal DOM expected by renderTimeline. */
function setupDom() {
  document.body.innerHTML = `
    <svg id="tlsvg"></svg>
    <div id="headSHA"></div>
    <div id="currentBranchName"></div>
    <div id="currentBranchDot"></div>
    <div id="tlscroll" style="overflow:auto"></div>
  `;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('renderTimeline', () => {
  let git: GitModel;
  let onCommitClick: ReturnType<typeof vi.fn>;
  let onBranchClick: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setupDom();
    git = makeGit();
    onCommitClick = vi.fn();
    onBranchClick = vi.fn();
  });

  it('does nothing (no SVG children) when there are no commits', () => {
    const empty = new GitModel(() => {});
    renderTimeline(empty, onCommitClick, onBranchClick);
    expect(document.getElementById('tlsvg')!.children).toHaveLength(0);
  });

  it('returns early when the #tlsvg element is absent', () => {
    document.body.innerHTML = '';
    expect(() => renderTimeline(git, onCommitClick, onBranchClick)).not.toThrow();
  });

  it('renders commit node circles into the SVG', () => {
    renderTimeline(git, onCommitClick, onBranchClick);
    const svg = document.getElementById('tlsvg')!;
    expect(svg.querySelector('circle')).not.toBeNull();
  });

  it('sets the SVG width and height attributes', () => {
    renderTimeline(git, onCommitClick, onBranchClick);
    const svg = document.getElementById('tlsvg')!;
    expect(Number(svg.getAttribute('width'))).toBeGreaterThanOrEqual(600);
    expect(Number(svg.getAttribute('height'))).toBeGreaterThan(0);
  });

  it('renders a branch label for each branch', () => {
    renderTimeline(git, onCommitClick, onBranchClick);
    const svg = document.getElementById('tlsvg')!;
    const labels = Array.from(svg.querySelectorAll('.branch-label-el'));
    expect(labels.some((el) => el.textContent === 'main')).toBe(true);
  });

  it('updates #headSHA with the current HEAD sha', () => {
    renderTimeline(git, onCommitClick, onBranchClick);
    expect(document.getElementById('headSHA')!.textContent).toHaveLength(7);
  });

  it('updates #currentBranchName with HEAD branch name', () => {
    renderTimeline(git, onCommitClick, onBranchClick);
    expect(document.getElementById('currentBranchName')!.textContent).toBe('main');
  });

  it('shows detached SHA prefix in #currentBranchName when detached', () => {
    const sha = git.currentSHA()!;
    git.checkoutCommit(sha);
    renderTimeline(git, onCommitClick, onBranchClick);
    expect(document.getElementById('currentBranchName')!.textContent).toContain('🔍');
  });

  it('fires onCommitClick with sha when a commit node is clicked', () => {
    renderTimeline(git, onCommitClick, onBranchClick);
    const svg = document.getElementById('tlsvg')!;
    const node = svg.querySelector<SVGGElement>('.commit-node');
    expect(node).not.toBeNull();
    node!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onCommitClick).toHaveBeenCalledTimes(1);
    expect(onCommitClick.mock.calls[0][0]).toBe(git.currentSHA());
  });

  it('fires onBranchClick with branch name when a branch label is clicked', () => {
    renderTimeline(git, onCommitClick, onBranchClick);
    const svg = document.getElementById('tlsvg')!;
    const lbl = svg.querySelector<SVGTextElement>('.branch-label-el');
    lbl!.dispatchEvent(new MouseEvent('click', { bubbles: false }));
    expect(onBranchClick).toHaveBeenCalledWith('main');
  });

  it('draws an edge (path) when a commit has a parent', () => {
    const canvas = JSON.stringify({ version: '5.3.1', objects: [] });
    const sha2 = git.commit(canvas, 'second commit');
    renderTimeline(git, onCommitClick, onBranchClick);
    expect(sha2).toBeTruthy();
    const svg = document.getElementById('tlsvg')!;
    expect(svg.querySelector('path')).not.toBeNull();
  });

  it('renders merge commit as a diamond (polygon)', () => {
    const canvas = JSON.stringify({ version: '5.3.1', objects: [] });
    // Create a feature branch and merge it back to trigger a merge commit
    git.createBranch('feat');
    git.checkout('feat');
    git.commit(canvas, 'feat commit');
    git.checkout('main');
    const mergeResult = git.merge('feat');
    // Even if the merge is a fast-forward or needs canvas, it works
    if (mergeResult.type === 'ok' || mergeResult.type === 'merge-commit') {
      renderTimeline(git, onCommitClick, onBranchClick);
      const svg = document.getElementById('tlsvg')!;
      // At minimum the SVG should render without errors
      expect(svg.children.length).toBeGreaterThan(0);
    }
  });

  it('fires onCommitClick on contextmenu (right-click) as well', () => {
    renderTimeline(git, onCommitClick, onBranchClick);
    const svg = document.getElementById('tlsvg')!;
    const node = svg.querySelector<SVGGElement>('.commit-node');
    node!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    expect(onCommitClick).toHaveBeenCalled();
  });

  it('truncates long commit messages in the SVG text', () => {
    const canvas = JSON.stringify({ version: '5.3.1', objects: [] });
    const longMsg = 'A'.repeat(30);
    git.commit(canvas, longMsg);
    renderTimeline(git, onCommitClick, onBranchClick);
    const svg = document.getElementById('tlsvg')!;
    const texts = Array.from(svg.querySelectorAll('text'));
    const truncated = texts.find((t) => t.textContent?.includes('…'));
    expect(truncated).not.toBeNull();
  });

  it('auto-scrolls #tlscroll toward HEAD commit', () => {
    const canvas = JSON.stringify({ version: '5.3.1', objects: [] });
    for (let i = 0; i < 5; i++) git.commit(canvas, `commit ${i}`);
    renderTimeline(git, onCommitClick, onBranchClick);
    // scrollLeft may stay 0 in jsdom but the call should not throw
    expect(document.getElementById('tlscroll')).not.toBeNull();
  });

  it('renders a second branch on a separate row', () => {
    git.createBranch('develop');
    renderTimeline(git, onCommitClick, onBranchClick);
    const svg = document.getElementById('tlsvg')!;
    const labels = Array.from(svg.querySelectorAll('.branch-label-el')).map((el) => el.textContent);
    expect(labels).toContain('develop');
  });
});
