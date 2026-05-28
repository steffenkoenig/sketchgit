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
