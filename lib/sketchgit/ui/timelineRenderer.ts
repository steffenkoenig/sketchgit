/**
 * timelineRenderer – renders the SVG git commit graph in the timeline panel.
 *
 * P024 – Layout computation is now separated from DOM rendering.
 * A virtual scroll window renders only commits visible within the current
 * scroll viewport plus an overscan buffer, keeping the SVG DOM element count
 * constant regardless of total commit count.
 *
 * Public API:
 *  - computeLayout(git) → CommitLayout[]    (pure, no DOM)
 *  - getVisibleCommits(layouts, scrollLeft, viewportWidth, overscan?) → CommitLayout[]
 *  - renderTimeline(git, onCommitClick, onBranchClick, scrollLeft?, viewportWidth?)
 */

import { GitModel } from '../git/gitModel';

export const TL = { ROW_H: 36, COL_W: 80, PAD_X: 20, PAD_Y: 18, R: 9 } as const;
const NS = 'http://www.w3.org/2000/svg';

// ─── Layout types ─────────────────────────────────────────────────────────────

/** Pre-computed screen-space position for a single commit. */
export interface CommitLayout {
  sha: string;
  x: number;
  y: number;
  color: string;
  isHead: boolean;
  isMerge: boolean;
  message: string;
  parents: string[];
  branch: string;
}

// ─── Pure layout computation ──────────────────────────────────────────────────

/**
 * Compute the screen-space (x, y) position of every commit without touching
 * the DOM.  This is the hot path called before every render and on scroll.
 */
export function computeLayout(git: GitModel): CommitLayout[] {
  const commits = Object.values(git.commits).sort((a, b) => a.ts - b.ts);
  if (commits.length === 0) return [];

  // Assign each branch a fixed row index
  const branchRow: Record<string, number> = {};
  let rowIdx = 0;
  for (const b of Object.keys(git.branches)) {
    if (branchRow[b] === undefined) branchRow[b] = rowIdx++;
  }

  // Assign each commit a column index
  const shaCol: Record<string, number> = {};
  commits.forEach((c, i) => { shaCol[c.sha] = i; });

  const headSHA = git.currentSHA();

  return commits.map((c) => {
    const col = shaCol[c.sha] ?? 0;
    const row = branchRow[c.branch] ?? 0;
    const x = TL.PAD_X + col * TL.COL_W + TL.COL_W / 2;
    const y = TL.PAD_Y + row * TL.ROW_H + TL.ROW_H / 2;
    return {
      sha: c.sha,
      x,
      y,
      color: git.branchColor(c.branch),
      isHead: c.sha === headSHA,
      isMerge: c.isMerge,
      message: c.message,
      parents: c.parents,
      branch: c.branch,
    };
  });
}

/**
 * Return only the commits whose x-coordinate falls within the current scroll
 * viewport, extended by `overscan` commit-widths on each side.
 *
 * @param layouts       - Output of computeLayout().
 * @param scrollLeft    - Current horizontal scroll offset of the container (px).
 * @param viewportWidth - Visible width of the scroll container (px).
 * @param overscan      - Extra commits to include beyond the visible edge.
 */
export function getVisibleCommits(
  layouts: CommitLayout[],
  scrollLeft: number,
  viewportWidth: number,
  overscan = 5,
): CommitLayout[] {
  const xMin = scrollLeft - overscan * TL.COL_W;
  const xMax = scrollLeft + viewportWidth + overscan * TL.COL_W;
  return layouts.filter((c) => c.x >= xMin && c.x <= xMax);
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function svgEl(
  tag: string,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElement {
  const e = document.createElementNS(NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) {
    e.setAttribute(k, String(v));
  }
  parent.appendChild(e);
  return e;
}

// ─── Main render function ─────────────────────────────────────────────────────

/**
 * Re-render the timeline SVG from the current GitModel state.
 *
 * When `scrollLeft` and `viewportWidth` are provided the renderer uses
 * viewport-based virtualization: only commits within the visible window
 * (plus overscan) are added to the SVG DOM.  When they are omitted all
 * commits are rendered (legacy behaviour, used by tests).
 *
 * @param git             - The live GitModel instance.
 * @param onCommitClick   - Called when the user clicks a commit node.
 * @param onBranchClick   - Called when the user clicks a branch label.
 * @param scrollLeft      - Current scroll position (optional, enables virtualization).
 * @param viewportWidth   - Visible width of the scroll container (optional).
 */
export function renderTimeline(
  git: GitModel,
  onCommitClick: (sha: string, screenX: number, screenY: number) => void,
  onBranchClick: (branchName: string) => void,
  scrollLeft?: number,
  viewportWidth?: number,
): void {
  const allLayouts = computeLayout(git);
  if (allLayouts.length === 0) return;

  const svg = document.getElementById('tlsvg');
  if (!svg) return;

  // Determine total canvas dimensions from all commits (not just visible ones)
  const maxX = Math.max(...allLayouts.map((l) => l.x));
  const maxY = Math.max(...allLayouts.map((l) => l.y));
  const svgW = Math.max(maxX + TL.PAD_X + TL.COL_W / 2, 600);
  const svgH = maxY + TL.PAD_Y + TL.ROW_H / 2;

  svg.setAttribute('width', String(svgW));
  svg.setAttribute('height', String(svgH));
  svg.replaceChildren();

  // Determine which commits to render in the DOM
  const visible =
    scrollLeft !== undefined && viewportWidth !== undefined
      ? getVisibleCommits(allLayouts, scrollLeft, viewportWidth)
      : allLayouts;

  const visibleSet = new Set(visible.map((l) => l.sha));

  // Build a lookup map from sha → layout for edge drawing
  const layoutBySha = new Map<string, CommitLayout>(allLayouts.map((l) => [l.sha, l]));

  // Draw edges (only when at least one endpoint is visible)
  for (const c of visible) {
    c.parents.forEach((parentSha, pi) => {
      const parent = layoutBySha.get(parentSha);
      if (!parent) return;
      // Include edges even if the parent is off-screen (so lines don't snap in)
      const x1 = parent.x, y1 = parent.y;
      const x2 = c.x, y2 = c.y;
      let d: string;
      if (Math.abs(y1 - y2) < 1) {
        d = `M${x1},${y1} L${x2},${y2}`;
      } else {
        const mx = (x1 + x2) / 2;
        d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
      }
      svgEl('path', {
        d, stroke: c.color,
        'stroke-width': '2', fill: 'none', 'stroke-linecap': 'round',
        'stroke-dasharray': pi > 0 ? '4,3' : '',
      }, svg);
    });
  }

  // Draw visible commit nodes
  for (const c of visible) {
    const { x, y, color, isHead, isMerge } = c;

    const g = svgEl('g', { class: 'commit-node', 'data-sha': c.sha }, svg) as SVGGElement;
    g.style.cursor = 'pointer';

    if (isHead) {
      svgEl('circle', {
        cx: x, cy: y, r: TL.R + 5, fill: 'none',
        stroke: color, 'stroke-width': '1.5', opacity: '.35', class: 'head-ring',
      }, g);
    }

    if (isMerge) {
      const s = TL.R;
      svgEl('polygon', {
        points: `${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`,
        fill: color, stroke: isHead ? 'white' : 'transparent', 'stroke-width': '2',
      }, g);
    } else {
      svgEl('circle', {
        cx: x, cy: y, r: TL.R,
        fill: isHead ? 'white' : color,
        stroke: color, 'stroke-width': isHead ? '3' : '0',
      }, g);
      if (isHead) {
        svgEl('circle', { cx: x, cy: y, r: TL.R - 4, fill: color }, g);
      }
    }

    const msgEl = svgEl('text', {
      x, y: y - TL.R - 5,
      'text-anchor': 'middle', 'font-size': '8',
      'font-family': 'Fira Code, monospace', fill: '#9090b0',
    }, g) as SVGTextElement;
    msgEl.textContent = c.message.length > 18 ? c.message.slice(0, 16) + '…' : c.message;

    const shaEl = svgEl('text', {
      x, y: y + TL.R + 10,
      'text-anchor': 'middle', 'font-size': '7',
      'font-family': 'Fira Code, monospace', fill: '#5a5a7a',
    }, g) as SVGTextElement;
    shaEl.textContent = c.sha.slice(0, 6);

    g.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onCommitClick(c.sha, (ev as MouseEvent).clientX, (ev as MouseEvent).clientY);
    });
    g.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      onCommitClick(c.sha, (ev as MouseEvent).clientX, (ev as MouseEvent).clientY);
    });
  }

  // Draw branch labels for branches whose tip is visible (or always for small histories)
  for (const [name, sha] of Object.entries(git.branches)) {
    if (!sha || !git.commits[sha]) continue;
    const layout = layoutBySha.get(sha);
    if (!layout) continue;
    // Only render the label when the commit is visible or we're rendering all commits
    if (scrollLeft !== undefined && !visibleSet.has(sha)) continue;

    const { x, y, color } = layout;
    const isCurrentBranch = name === git.HEAD;
    const lx = x + TL.R + 4, ly = y - TL.R - 2;

    const bg = svgEl('rect', {
      x: lx - 3, y: ly - 9,
      width: name.length * 6.2 + 6, height: 12,
      fill: color, rx: '4', opacity: isCurrentBranch ? '1' : '.7',
    }, svg);
    bg.setAttribute('style', 'pointer-events:none');

    const lbl = svgEl('text', {
      x: lx, y: ly,
      'font-size': '8', 'font-family': 'Fira Code, monospace',
      fill: 'white', 'font-weight': '600', class: 'branch-label-el',
    }, svg) as SVGTextElement;
    lbl.textContent = name;
    lbl.addEventListener('click', () => onBranchClick(name));
  }

  // Update header indicators (always, regardless of virtualization)
  const headSHA = git.currentSHA();
  const headShaEl = document.getElementById('headSHA');
  if (headShaEl) headShaEl.textContent = headSHA ? headSHA.slice(0, 7) : '';

  const branchNameEl = document.getElementById('currentBranchName');
  if (branchNameEl) {
    branchNameEl.textContent = git.detached
      ? '🔍 ' + git.detached.slice(0, 6)
      : git.HEAD;
  }

  const branchDotEl = document.getElementById('currentBranchDot');
  if (branchDotEl) branchDotEl.style.background = git.branchColor(git.HEAD);

  // Auto-scroll to HEAD (only on initial render / full re-render)
  if (headSHA && scrollLeft === undefined) {
    const headLayout = layoutBySha.get(headSHA);
    if (headLayout) {
      const tlscroll = document.getElementById('tlscroll');
      if (tlscroll) tlscroll.scrollLeft = Math.max(0, headLayout.x - 100);
    }
  }
}
