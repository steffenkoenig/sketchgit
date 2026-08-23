# P096 - Canvas Minimap / Radar View

## Goal
To implement a minimap (radar view) UI component for the SketchGit canvas, providing users with a high-level overview of the entire board and enabling rapid spatial navigation across large whiteboards.

## Problem
As whiteboards become increasingly complex and expansive, users frequently lose track of where specific diagrams or ideas are located. Scrolling and zooming out to find content is tedious and interrupts the workflow. Currently, SketchGit lacks a holistic navigational tool that allows users to instantly grasp the spatial layout of the board and quickly jump to different sections.

## Proposed Changes
1. **Minimap Component UI**: Create a small, collapsible minimap overlay situated in the corner of the canvas interface.
2. **Viewport Representation**: Display a scaled-down, simplified visualization of all canvas objects within the minimap.
3. **Active Viewport Indicator**: Render a highlighted rectangle on the minimap representing the user's current view port (zoom level and pan position).
4. **Interactive Navigation**: Allow users to click or drag the viewport indicator within the minimap to instantly pan the main canvas to that corresponding location.
5. **Real-time Synchronization**: Ensure the minimap updates efficiently as new objects are drawn, modified, or when the user pans/zooms the main canvas.

## Future Press Release
Navigate your biggest ideas with ease using SketchGit’s new Canvas Minimap! As your whiteboards grow into sprawling landscapes of creativity and collaboration, it can be tough to keep track of everything. Our new Minimap gives you a convenient radar view of your entire workspace at a glance. See the big picture, spot where your teammates are working, and instantly jump to any section of the board with a single click. Say goodbye to endless scrolling and getting lost on infinite canvases—the Minimap puts the whole project right at your fingertips!

## Definitions of Done

### Implementation
- Minimap UI component developed and styled as a floating overlay on the canvas.
- Logic implemented to calculate the bounding box of all objects and scale them to fit within the minimap dimensions.
- Viewport indicator implemented, accurately reflecting the main canvas's pan and zoom state.
- Bi-directional synchronization implemented: panning/zooming updates the minimap, and clicking/dragging the minimap pans the main canvas.
- Performance optimization applied (e.g., debouncing updates, utilizing simplified shapes for rendering) to ensure the minimap does not lag during active drawing.

### Testing
- Unit tests written for the spatial transformation logic (converting coordinates between the main canvas and the minimap).
- End-to-end (E2E) tests simulating user interaction with the minimap to verify accurate panning of the main canvas.
- Performance tests ensuring the minimap rendering remains smooth with hundreds of objects on the board.
- Coverage remains at or above the required project threshold.

### Documentation
- User documentation updated to explain the minimap feature and how to use it for navigation.
- Developer documentation updated detailing the architecture and performance considerations of the minimap synchronization loop.

### Security
- Ensure the minimap rendering logic safely handles malformed object coordinates or extreme zoom levels without throwing exceptions or causing Denial of Service (DoS) conditions on the client.

### Reliability
- The minimap must gracefully handle edge cases, such as an entirely empty canvas or a single object placed extremely far from the origin.
- The component must not cause memory leaks through orphaned event listeners attached to the main Fabric.js canvas.

### Accessibility
- Provide a keyboard shortcut to toggle the visibility of the minimap.
- Ensure the minimap component can be navigated and utilized via keyboard controls, allowing users to pan the canvas in predefined increments.
- Add ARIA labels to describe the current position and context of the viewport indicator.

### GDPR compliance
- The minimap operates entirely client-side based on data already present in the user's session; no new personal data collection is introduced.
- Existing data protection policies adequately cover this functional enhancement.

## Implementation Notes

Purely client-side — no schema, API, or server changes. Built on top of
existing CanvasEngine/Fabric.js primitives rather than introducing anything
new.

**What was built:**
- `CanvasEngine.getMinimapData()` — returns the union bounding box of all
  canvas objects (via Fabric v7's `getBoundingRect()`, which per its own
  JSDoc returns coordinates "in the scene plane," i.e. already unaffected by
  pan/zoom — the same primitive `renderShapeTemplateThumbnail()` (P095) uses
  for template thumbnails) plus the current viewport rectangle, read from
  Fabric's own `canvas.vptCoords` (recomputed on every render). Guards
  against a degenerate zero-size bounding box (single point object) so
  downstream scale math never divides by zero.
- `CanvasEngine.panToWorldPoint(x, y)` — re-centers the viewport on a world
  coordinate at the current zoom level (the actual navigation mechanism).
- `CanvasEngine.panByScreenDelta(dx, dy)` — wraps Fabric's `relativePan()`
  for keyboard-driven panning in fixed increments.
- `MinimapPanel.tsx` — a floating overlay (bottom-right) showing a scaled
  content-bounds box and viewport-indicator rectangle; click/drag to jump
  to a location, arrow keys to pan by increment when focused, `role`,
  `aria-label` (reporting the current viewport position/size), and a
  visible show/hide toggle button.
- `"n"` keyboard shortcut (added to `CanvasEngine`'s existing
  tool/zoom/action shortcut dispatch chain) toggles visibility, dispatched
  as a `sketchgit:toggleMinimap` custom event — same pattern the app
  already uses for opening modals from canvas-level keyboard/context-menu
  actions, so the engine doesn't need a new constructor callback for pure
  UI state it doesn't own.
- Sync strategy: **polling** (`getMinimapData()` every 200ms while visible)
  rather than hooking every call site that can move the viewport or content
  bounds (zoom in/out, wheel-zoom, pinch-zoom, presenter-follow, draw,
  undo/redo, checkout, merge, remote peer edits — there is no single
  "canvas changed" event covering all of these). This is a deliberate
  trade-off documented in the component's own header comment: simple,
  catches every case uniformly, and — since it attaches no listeners to the
  Fabric canvas itself — avoids the "orphaned event listener" leak the
  proposal's own DoD explicitly calls out as a risk, by construction rather
  than by careful cleanup.

**Deviation — E2E verification could not be completed in this sandbox.**
A real `e2e/minimap.spec.ts` was written (content-appears-after-drawing,
click-to-pan moves the viewport indicator, `"n"` and the show/hide buttons
toggle visibility) and is included, since it is a reasonable, well-formed
test that should pass in a properly functioning CI browser environment
matching how the existing `e2e/*.spec.ts` suite is written. However,
running it in this local sandbox surfaced something more fundamental than
the previously-documented Playwright/Chromium WebSocket-handshake
limitation: instrumenting `SketchGitApp`'s own top-level mount effect with
an unambiguous marker (a plain `window` property, deliberately chosen to be
immune to any DOM/React attribute reconciliation) showed **zero** client
effects ever executing, even after 30+ seconds of real wall-clock waiting
and after dispatching real click events — for the *entire* app tree, not
just the new Minimap code. A drawn stroke never set `canvas.isDirty`, and
clicking "Commit" never actually added the `open` class to `#commitModal`.
The pre-existing `e2e/canvas.spec.ts`'s apparent partial success in this
same sandbox turned out to be a false signal: its commit-modal DOM nodes
are always mounted (for accessibility, per the established
always-mounted-conditionally-classed modal pattern), so Playwright's
actionability checks were satisfied by their nominal CSS visibility even
though the modal was never genuinely opened — the illusion only broke down
at a later, unrelated step (a pointer-interception error on the final
click). In short: this sandbox cannot currently be used to verify *any*
genuine client-side interactivity for this app end-to-end, which is a
sandbox limitation broader than previously known, not a defect introduced
by this proposal. Verification therefore relies on unit tests instead —
see below — and the E2E spec is left in place for CI (or a future working
sandbox) to actually exercise.

**Unit test coverage** (`lib/sketchgit/canvas/canvasEngine.test.ts`, 10 new
tests, all passing): `getMinimapData()`'s empty-canvas case, union bounding
box computation across multiple objects, reading the viewport rectangle
from `vptCoords`, the zero-size degenerate-object guard;
`panToWorldPoint()`'s recentering math (verified against a concrete
zoom/dimension example, not just "was called"), and its no-op when
`viewportTransform` is absent; `panByScreenDelta()`'s delegation to
`relativePan()`; and the `"n"` shortcut's event dispatch plus its
INPUT/TEXTAREA guard. Full suite: 1407 tests passing (up from 1397),
coverage held above the project thresholds (77.64% / 63.57% / 75.58% /
79.86% — statements/branches/functions/lines, thresholds 70/60/70/70).
