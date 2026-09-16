# SketchGit New Feature Implementation Plans

## 1. Sticky Notes

### Goal
Provide users with a quick and recognizable "Sticky Note" tool to capture ideas, feedback, and annotations directly on the canvas without manual formatting.

### Problem
Currently, users wanting to leave notes must create a rectangle, color it, create a text box, place it over the rectangle, and group them. This multi-step process is tedious for brainstorming sessions where users want to rapidly jot down ideas. The lack of a dedicated Sticky Note tool slows down ideation and reduces the platform's effectiveness for agile ceremonies or unstructured brainstorming.

### Proposed Changes
- **Canvas Engine**: Introduce a new custom Fabric.js object, `StickyNote`, which encapsulates both a background shape (typically a square with a slight drop shadow) and a text area that automatically resizes or wraps text to fit within the note.
- **Frontend UI**:
  - Add a "Sticky Note" tool icon to the primary drawing toolbar.
  - Clicking the tool and then the canvas places a default sticky note and automatically focuses the text input.
  - Allow users to quickly cycle through a predefined palette of pastel sticky note colors (yellow, pink, blue, green, etc.).
- **Git Model Integration**: Update the merge engine (`mergeEngine.ts`) to handle the serialization, deserialization, and conflict resolution of the new `StickyNote` object type.

### Definitions of Done
- **Documentation**: Update `/docs/customer` on how to use the Sticky Note tool. Update `/docs/technical` with the JSON schema of the `StickyNote` object.
- **Testing**: Playwright E2E tests for placing a sticky note, typing text, and changing its color. Vitest unit tests to ensure `StickyNote` objects are merged correctly during a 3-way merge without losing text.
- **Security**: Text input within the sticky note must be sanitized to prevent XSS vulnerabilities, ensuring no executable scripts are rendered on the canvas.
- **Reliability**: Sticky notes must render efficiently. The text wrapping logic should not block the main thread, maintaining smooth 60fps performance even with hundreds of notes on the canvas.
- **Accessibility**: The Sticky Note tool must be selectable via keyboard shortcuts. Text within sticky notes should be readable by screen readers when navigating canvas objects.
- **GDPR**: Sticky note content is treated as standard user-generated canvas data and is subject to the existing data retention and deletion policies.

### Future Press Release
**Brainstorm Faster with SketchGit Sticky Notes**
Great ideas often come in quick bursts, and your tools shouldn't slow you down. Today, we're introducing Sticky Notes to SketchGit, designed to make brainstorming and agile ceremonies smoother than ever. Forget about manually creating shapes and text boxes; just select the Sticky Note tool, click anywhere on the canvas, and start typing. Choose from a variety of classic pastel colors to organize your thoughts, group concepts, or assign tasks. Whether you're running a sprint retrospective or mapping out a new architecture, Sticky Notes let you capture ideas at the speed of thought. Jump into your canvas and start sticking!

---

## 2. Smart Connectors

### Goal
Implement "Smart Connectors" that automatically snap and route lines between canvas objects, maintaining the connection dynamically as objects are moved.

### Problem
SketchGit users frequently draw architectures, flowcharts, and mind maps. Currently, connecting two shapes requires drawing a static line. If either shape is moved, the line breaks, and the user must manually adjust the line's endpoints to re-establish the connection. This manual adjustment is extremely frustrating and time-consuming, hindering the creation of complex node-based diagrams.

### Proposed Changes
- **Canvas Engine**:
  - Add connection anchor points to standard objects (rectangles, ellipses, text, sticky notes).
  - Create a new `SmartConnector` object type that references a `sourceObjectId` and a `targetObjectId`, along with their respective anchor points.
  - Implement a routing algorithm (e.g., orthogonal or bezier) that recalculates the path of the line whenever the source or target object moves.
- **Frontend UI**:
  - Add a "Smart Connector" line tool to the toolbar.
  - When drawing a line, highlight snap-to anchor points on nearby objects.
- **Git Model & Database**: Update the history and state management to correctly track and merge `SmartConnector` objects. If a connected object is deleted, the connector should gracefully degrade into a standard line or be removed based on user preference.

### Definitions of Done
- **Documentation**: Update `/docs/customer` to explain how to draw and edit smart connectors. Update `/docs/technical` detailing the pathfinding algorithm and the connector object schema.
- **Testing**: Vitest unit tests for the path recalculation algorithm. Playwright E2E tests verifying that connecting two objects and moving one of them successfully updates the connecting line visually.
- **Security**: The pathfinding algorithm must have cycle detection and complexity limits to prevent denial-of-service via computationally expensive routing tasks.
- **Reliability**: The dynamic recalculation of connector paths must be highly optimized (e.g., debounced during drag) to prevent canvas lag during real-time collaboration.
- **Accessibility**: The Smart Connector tool can be selected via keyboard. The connections between objects should be semantically described for screen reader users traversing the diagram.
- **GDPR**: Smart Connectors do not involve any new personal data. Standard diagram data policies apply.

### Future Press Release
**Connect the Dots Effortlessly with Smart Connectors**
Building flowcharts and architectural diagrams in SketchGit just got a massive upgrade with the launch of Smart Connectors. We know the pain of meticulously drawing lines between nodes, only to have them break the moment you reorganize your layout. Now, you can draw a line that smartly snaps to your shapes. Move the shape, and the line follows automatically, recalculating its path to keep your diagram looking clean and professional. Spend less time adjusting endpoints and more time designing your system's architecture. Try Smart Connectors today and experience a more fluid diagramming workflow!

---

## 3. Personal Scratchpad

### Goal
Provide users with a private, un-synced "Personal Scratchpad" overlay on their canvas where they can draft ideas, paste reference material, or take private notes before committing them to the shared room.

### Problem
When collaborating in a shared room, every stroke is broadcast in real time. Sometimes, users want to experiment with a rough idea, write down a quick thought, or stage complex components before sharing them with the group. Currently, they have to create a new branch, work there, and merge it back, which can be overly formal for minor drafts, or they work in a completely separate tool, breaking their workflow.

### Proposed Changes
- **Canvas UI**: Add a toggleable "Personal Scratchpad" side panel or floating overlay. This overlay uses its own isolated Fabric.js canvas instance.
- **Data Persistence**: Scratchpad data is stored exclusively on the client side using `IndexedDB` or `localStorage`, keyed by the `userId` and `roomId`. It is never broadcast via WebSockets or saved to the server.
- **Interactivity**: Allow users to drag and drop or copy/paste objects between the Personal Scratchpad and the main shared canvas seamlessly.

### Definitions of Done
- **Documentation**: Update `/docs/customer` explaining the privacy guarantees of the Scratchpad and how to move objects to the main canvas.
- **Testing**: Playwright E2E tests to verify that drawing in the scratchpad does not trigger WebSocket broadcasts to other clients, and that copy/pasting from the scratchpad to the main canvas works correctly.
- **Security**: Ensure that no scratchpad data is inadvertently included in network payloads or commit histories.
- **Reliability**: The secondary canvas must not significantly impact memory usage or rendering performance of the primary canvas.
- **Accessibility**: The scratchpad toggle must be keyboard accessible. Focus management should handle switching between the main canvas and the scratchpad seamlessly for screen reader users.
- **GDPR**: Scratchpad data is purely local. It is immune to server-side breaches and can be completely wiped by the user clearing their browser data, fully aligning with user privacy control.

### Future Press Release
**Draft in Private with the Personal Scratchpad**
Collaboration is great, but sometimes you need a moment to think before you share. We are excited to announce the Personal Scratchpad for SketchGit. This new feature provides you with a private, un-synced overlay right inside your collaborative room. Use it to draft rough ideas, hold reference images, or compose complex diagrams out of the public eye. Once your concept is ready, simply drag it onto the main canvas for everyone to see. The Scratchpad is completely local to your browser, ensuring your private drafts remain truly private. Take control of your creative process with the new Personal Scratchpad!
