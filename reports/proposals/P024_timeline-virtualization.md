# P024 – Timeline Virtualization for Large Commit Histories

## Title
Virtualize the Commit Timeline SVG to Support Large Commit Histories Without Performance Degradation

## Brief Summary
The commit timeline renderer in `timelineRenderer.ts` renders all commits unconditionally in a single SVG. For a canvas with 500 commits, this produces 500 circles, 500 labels, and hundreds of path edges in the DOM simultaneously, making the timeline slow to render and sluggish to interact with. Applying viewport-based virtualization—rendering only the commits visible in the current scroll window plus a small overscan buffer—keeps the DOM element count constant regardless of how many commits exist, maintaining smooth performance even for projects with thousands of commits.

## Current Situation
`lib/sketchgit/ui/timelineRenderer.ts` (196 lines) renders all commits in a single pass:

```typescript
// timelineRenderer.ts – renders everything unconditionally
const commits = Object.values(git.commits).sort(/* by position */);

// SVG dimensions grow with commit count
const svgW = TL.PAD_X * 2 + maxCol * TL.COL_W;
const svgH = TL.PAD_Y * 2 + maxRow * TL.ROW_H;

svg.setAttribute('height', String(svgH)); // grows unboundedly
svg.replaceChildren();                     // clears and re-renders all commits

// Draw all edges (one <path> per parent-child relationship)
for (const c of commits) { ... }  // O(N) DOM insertions

// Draw all commit nodes (one <g> per commit, containing <circle> + <text> + optional ring)
for (const c of commits) { ... }  // O(N) DOM insertions

// Draw all branch labels
for (const [name, sha] of branchEntries) { ... }  // O(branches) DOM insertions
```

For a project with 500 commits across 10 branches, this creates:
- 500 `<g>` groups (one per commit)
- 500 `<circle>` elements
- 500 `<text>` elements for labels
- ~500 `<path>` elements for edges
- ~10 branch name labels
- **Total: ~2,000 SVG DOM elements**

The timeline container has a fixed height and is scrolled using `element.scrollLeft`. Scrolling is smooth for small histories but degrades for large ones because all 2,000 elements must be re-painted by the browser on every scroll event.

The current auto-scroll to HEAD (`element.scrollLeft = ...`) also reflows the entire SVG on checkout.

## Problem with Current Situation
1. **DOM size scaling**: SVG DOM element count grows linearly with commit count. At 1,000 commits, ~4,000 DOM nodes are held in memory and repainted on every interaction.
2. **Initial render time**: On a room with 500+ commits, the timeline re-renders (via `svg.replaceChildren()`) on every checkout and commit. For 500 commits, the full re-render takes 50–200 ms depending on device—perceptible as a UI freeze.
3. **Scroll jank**: Large SVG repaints on scroll cause frame drops below 60 fps, making the timeline feel sluggish.
4. **Memory**: Each SVG `<text>` node with a commit SHA label and message holds ~200 bytes in the DOM; 1,000 commits × 200 bytes = ~200 KB of DOM memory just for timeline labels.
5. **No incremental update**: `svg.replaceChildren()` tears down and rebuilds the entire SVG on every render, even when only one commit was added. There is no diffing or incremental update.

## Goal to Achieve
1. Render only the commits visible within the timeline's current scroll window, plus an overscan buffer of ~5 commits on each side.
2. Keep the total number of SVG elements constant (~50–80) regardless of total commit count.
3. Reduce initial render time to < 5 ms for any commit count.
4. Support smooth 60 fps scrolling regardless of history size.
5. Maintain correct auto-scroll to HEAD after checkout and commit operations.

## What Needs to Be Done

### 1. Compute all commit positions without rendering them
Separate the layout computation from the DOM rendering:
```typescript
interface CommitLayout {
  sha:    string;
  x:      number;
  y:      number;
  color:  string;
  isHead: boolean;
  label:  string;
  parents: string[];
}

function computeLayout(git: GitState): CommitLayout[] {
  // Compute x,y positions for all commits
  // (existing shaCol / branchRow logic, no DOM operations)
  return commits.map(c => ({
    sha: c.sha,
    x: computeX(c.sha),
    y: computeY(c.sha),
    color: git.branchColor(c.branch),
    isHead: c.sha === git.HEAD,
    label: c.message,
    parents: c.parents,
  }));
}
```

### 2. Implement a virtual scroll window
When the timeline scroll position changes, compute which commits fall within the visible viewport:
```typescript
function getVisibleCommits(
  layouts: CommitLayout[],
  scrollLeft: number,
  viewportWidth: number,
  overscan = 5,
): CommitLayout[] {
  const xMin = scrollLeft - overscan * TL.COL_W;
  const xMax = scrollLeft + viewportWidth + overscan * TL.COL_W;
  return layouts.filter(c => c.x >= xMin && c.x <= xMax);
}
```

### 3. Render only visible commits and relevant edges
```typescript
function render(git: GitState, scrollLeft: number, viewportWidth: number): void {
  const allLayouts = computeLayout(git);
  const visible    = getVisibleCommits(allLayouts, scrollLeft, viewportWidth);
  const visibleSet = new Set(visible.map(c => c.sha));

  svg.replaceChildren();

  // Only draw edges where at least one endpoint is visible
  for (const c of visible) {
    for (const parentSha of c.parents) {
      if (allLayouts.find(l => l.sha === parentSha)) {
        drawEdge(svg, c, allLayouts, allLayouts.find(l => l.sha === parentSha)!);
      }
    }
  }

  // Draw only visible commit nodes
  for (const c of visible) {
    drawCommitNode(svg, c);
  }
}
```

### 4. Update on scroll events (debounced)
```typescript
timelineEl.addEventListener('scroll', debounce(() => {
  render(git, timelineEl.scrollLeft, timelineEl.clientWidth);
}, 16)); // ~60 fps debounce
```

### 5. Set SVG width to total layout width but render partial content
The SVG's `width` attribute remains the full computed width (so the scrollbar is correct), but only a fraction of the elements are rendered:
```typescript
svg.setAttribute('width',  String(totalLayoutWidth));
svg.setAttribute('height', String(totalLayoutHeight));
// But only O(viewport / COL_W) elements are in the DOM
```

### 6. Incremental update instead of full re-render
When only one commit is added (the common case), update only the new node and its edge rather than calling `svg.replaceChildren()`:
```typescript
function addCommitNode(sha: string): void {
  const layout = computeSingleLayout(sha);
  drawCommitNode(svg, layout);
  drawEdges(svg, layout); // only new commit's edges
}
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `lib/sketchgit/ui/timelineRenderer.ts` | Add `computeLayout()` separation; implement virtual scroll window; add incremental update mode |
| `lib/sketchgit/app.ts` | Pass scroll position and viewport width to `renderTimeline()`; add scroll event listener |

## Additional Considerations

### SVG vs. Canvas for the timeline
For very large histories (5,000+ commits), even virtualized SVG may be insufficient due to SVG's per-element overhead. Rendering the timeline on a `<canvas>` element using 2D API directly (as Fabric.js does for the drawing canvas) eliminates per-element DOM overhead entirely and scales to hundreds of thousands of commits. This is a more invasive change but provides the ultimate scalability ceiling.

### React-based timeline (future)
If the UI is migrated to React (complementary to P008 and P021), a React-based timeline can use established virtualization libraries such as `@tanstack/react-virtual` or `react-window` to handle windowing automatically without custom scroll tracking.

### Interaction preservation
After virtualization, commit click handlers must continue to work for off-screen commits (e.g., clicking a commit SHA in the commit popup should scroll to it in the timeline). Store all layout data in memory and scroll to the correct position before rendering the clicked commit's node.

### Testing
Add unit tests for `computeLayout()` (pure function, no DOM) asserting correct x/y positions for linear and branching histories. Add tests for `getVisibleCommits()` asserting correct filtering at scroll boundaries.
