/**
 * timelineRenderer – renders the SVG git commit graph in the timeline panel.
 *
 * Receives a GitModel instance plus callbacks for commit-click actions so that
 * it has no direct dependency on canvas or collaboration code.
 */

import { GitModel } from '../git/gitModel';

const TL = { ROW_H: 36, COL_W: 80, PAD_X: 20, PAD_Y: 18, R: 9 } as const;
const NS = 'http://www.w3.org/2000/svg';

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

/**
 * Re-render the timeline SVG from the current GitModel state.
 *
 * @param git             - The live GitModel instance.
 * @param onCommitClick   - Called when the user clicks a commit node.
 * @param onBranchClick   - Called when the user clicks a branch label.
 */
export function renderTimeline(
  git: GitModel,
  onCommitClick: (sha: string, screenX: number, screenY: number) => void,
  onBranchClick: (branchName: string) => void,
): void {
  const commits = Object.values(git.commits).sort((a, b) => a.ts - b.ts);
  if (commits.length === 0) return;

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
  const rows = rowIdx || 1;
  const cols = commits.length;

  const svgW = Math.max(TL.PAD_X * 2 + cols * TL.COL_W, 600);
  const svgH = TL.PAD_Y * 2 + rows * TL.ROW_H;

  const svg = document.getElementById('tlsvg');
  if (!svg) return;
  svg.setAttribute('width', String(svgW));
  svg.setAttribute('height', String(svgH));
  svg.replaceChildren();

  function cx(sha: string): number {
    return TL.PAD_X + (shaCol[sha] ?? 0) * TL.COL_W + TL.COL_W / 2;
  }
  function cy(sha: string): number {
    const c = git.commits[sha];
    if (!c) return TL.PAD_Y + TL.ROW_H / 2;
    const r = branchRow[c.branch] ?? 0;
    return TL.PAD_Y + r * TL.ROW_H + TL.ROW_H / 2;
  }

  // Draw edges
  for (const c of commits) {
    c.parents.forEach((p, pi) => {
      const color = git.branchColor(c.branch);
      const x1 = cx(p), y1 = cy(p), x2 = cx(c.sha), y2 = cy(c.sha);
      let d: string;
      if (Math.abs(y1 - y2) < 1) {
        d = `M${x1},${y1} L${x2},${y2}`;
      } else {
        const mx = (x1 + x2) / 2;
        d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
      }
      svgEl('path', {
        d, stroke: color,
        'stroke-width': '2', fill: 'none', 'stroke-linecap': 'round',
        'stroke-dasharray': pi > 0 ? '4,3' : '',
      }, svg);
    });
  }

  // Draw commit nodes
  for (const c of commits) {
    const x = cx(c.sha), y = cy(c.sha);
    const color = git.branchColor(c.branch);
    const isHead = c.sha === headSHA;

    const g = svgEl('g', { class: 'commit-node', 'data-sha': c.sha }, svg) as SVGGElement;
    g.style.cursor = 'pointer';

    if (isHead) {
      svgEl('circle', {
        cx: x, cy: y, r: TL.R + 5, fill: 'none',
        stroke: color, 'stroke-width': '1.5', opacity: '.35', class: 'head-ring',
      }, g);
    }

    if (c.isMerge) {
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

  // Draw branch labels
  for (const [name, sha] of Object.entries(git.branches)) {
    if (!sha || !git.commits[sha]) continue;
    const color = git.branchColor(name);
    const x = cx(sha), y = cy(sha);
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

  // Update header indicators
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

  // Auto-scroll to HEAD
  if (headSHA) {
    const x = TL.PAD_X + (shaCol[headSHA] ?? 0) * TL.COL_W;
    const tlscroll = document.getElementById('tlscroll');
    if (tlscroll) tlscroll.scrollLeft = Math.max(0, x - 100);
  }
}
