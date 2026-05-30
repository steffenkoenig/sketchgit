# SketchGit Improvement Plans

## 1. Object Grouping and Alignment

### Goal
Provide users with the ability to select multiple objects on the canvas, group them together as a single interactive unit, and easily align them relative to each other or the canvas.

### Problem
Currently, users must move objects individually or rely on fragile multi-selection dragging. When creating complex diagrams, such as UI mockups or architectural layouts, users need a way to combine distinct shapes (e.g., a rectangle and a text label) into a unified component. Furthermore, manually aligning shapes by eye is tedious and imprecise, slowing down the diagramming workflow.

### Proposed Changes
- **Canvas Engine**: Leverage Fabric.js's native `ActiveSelection` and `Group` capabilities to introduce an "Object Grouping" function (`Ctrl+G` / `Cmd+G`).
- **Toolbar UI**: Add grouping and alignment controls (Align Left, Right, Top, Bottom, Center Horizontal, Center Vertical) to a contextual toolbar that appears when multiple objects are selected.
- **Git Model Integration**: Modify the 3-way merge engine to support the `Group` object type, ensuring that grouped objects correctly serialize/deserialize their internal `objects` array without losing stable internal IDs during branch merges.
- **State Synchronization**: Update the real-time WebSocket broadcasting logic to handle grouping and ungrouping delta events efficiently, ensuring smooth collaboration when multiple users edit or view a group simultaneously.

### Definitions of Done
- **Documentation**: Update `README.md` and user-facing documentation (`/docs/customer`, `/docs/technical`, `/docs/support`) with instructions on how to use grouping and alignment features, including keyboard shortcuts.
- **Testing**: Comprehensive Vitest unit tests for the merge engine's handling of `Group` objects, and Playwright E2E tests verifying grouping, ungrouping, and alignment via UI.
- **Security**: Grouping operations are sanitized and constrained by maximum nesting depth to prevent stack overflow or denial-of-service vulnerabilities via crafted WebSocket payloads.
- **Reliability**: Performance testing ensures that moving heavily nested groups does not degrade WebSocket broadcast latency.
- **Accessibility**: All alignment and grouping buttons in the contextual toolbar are fully keyboard accessible and equipped with appropriate ARIA labels and focus states.
- **GDPR**: Grouping data is strictly visual metadata and inherently falls under existing GDPR account and room deletion procedures.

### Future Press Release
**SketchGit Brings Order to Chaos with Grouping and Alignment Tools**
Today, we are thrilled to announce two of our most requested features: Object Grouping and Alignment Tools. Building complex, beautiful diagrams in SketchGit is now faster and more precise than ever. You can now effortlessly snap your architectural blocks, UI components, and text labels into perfect alignment with a single click. Furthermore, by grouping elements together, you can treat complex compositions as a single asset, making it vastly simpler to move, copy, and manage your workspace. These improvements integrate seamlessly with our unique branching and merging system, meaning your structured diagrams merge just as beautifully as your freeform sketches. Whether you are mapping out a new database schema or brainstorming a new product flow, SketchGit gives you the tools to keep your canvas perfectly organized. Experience the new level of precision in your next SketchGit session!


---

## 2. Sticky Notes and Contextual Annotations

### Goal
Introduce a native "Sticky Note" tool that allows users to attach visually distinct, formatted text annotations to specific canvas locations or existing objects.

### Problem
While the standard text tool is useful for labeling, teams conducting brainstorming sessions, design reviews, or sprint retrospectives lack a dedicated, highly visible way to drop feedback. Users often resort to drawing colored rectangles and carefully placing text on top, which is cumbersome and fragments easily when moved.

### Proposed Changes
- **Canvas Engine**: Create a custom Fabric.js subclass `StickyNote` that encapsulates a colored background shape, a shadow effect, and a constrained, auto-wrapping text area.
- **Toolbar UI**: Add a dedicated "Sticky Note" tool to the left toolbar, offering a preset palette of high-visibility colors (e.g., yellow, pink, blue, green).
- **Interactivity**: Implement double-click-to-edit functionality on the sticky note, and support rich text features like bold and italic styling within the note.
- **Merge Engine**: Ensure the new `StickyNote` class is recognized by the `mergeEngine.ts`, appropriately handling conflicts if two users edit the same note on different branches.

### Definitions of Done
- **Documentation**: Add sticky notes to the feature list in `README.md` and update `/docs/customer`, `/docs/technical`, and `/docs/support` detailing their creation, editing, and color customization.
- **Testing**: Unit tests for the serialization and deserialization of the custom `StickyNote` class. E2E tests for placing, coloring, and editing notes on the canvas.
- **Security**: Text input within sticky notes is strictly sanitized to prevent XSS vulnerabilities, ensuring HTML tags are escaped before rendering.
- **Reliability**: Ensure the auto-wrapping text algorithm performs efficiently during rapid typing and live collaboration syncs.
- **Accessibility**: Sticky notes can be navigated via the keyboard (e.g., using Tab to cycle through objects) and edited without a mouse. Colors used meet WCAG contrast requirements for readability.
- **GDPR**: Content within sticky notes is treated as standard user data and is fully purged during room or account deletion workflows in compliance with GDPR.

### Future Press Release
**Capture Every Insight with SketchGit Sticky Notes**
We know that collaboration is more than just drawing lines and shapes; it's about sharing ideas, feedback, and context. That is why we are introducing Sticky Notes to the SketchGit toolset. Perfect for brainstorming sessions, design critiques, and agile retrospectives, sticky notes provide a vibrant, instantly recognizable way to leave your mark. With a dedicated tool and a beautiful palette of colors, dropping a quick thought onto the canvas is now effortless. Because they are built directly into SketchGit’s version control engine, you can even branch off to explore different feedback resolutions and seamlessly merge them back. Turn your next diagram into a truly interactive conversation with SketchGit Sticky Notes!


---

## 3. Dashboard Folders and Project Organization

### Goal
Provide users with the ability to organize their saved rooms and canvases into custom, nested folders within their SketchGit dashboard.

### Problem
As users adopt SketchGit for multiple projects, their dashboard quickly becomes a flat, unwieldy list of rooms. Finding a specific diagram from a past sprint or a different client project becomes difficult and frustrating, leading to decreased productivity and cluttered workspaces.

### Proposed Changes
- **Database Schema**: Add a `Folder` model to Prisma, linked to a `User`. Update the `Room` model with an optional `folderId` foreign key to allow rooms to reside in folders.
- **Backend API**:
  - Implement CRUD endpoints for folders (`/api/folders`).
  - Update the `/api/rooms` endpoints to support moving rooms between folders.
- **Frontend UI**:
  - Revamp the Dashboard page to display a folder tree navigation sidebar.
  - Add drag-and-drop support for moving rooms into folders on the dashboard.
  - Implement folder creation, renaming, and deletion modals.

### Definitions of Done
- **Documentation**: Update `/docs/customer`, `/docs/technical`, and `/docs/support` with a guide on how to create, manage, and delete dashboard folders.
- **Testing**: Vitest unit tests for the Prisma folder repository logic (including cascading deletes or orphaned room handling). Playwright E2E tests for creating folders, dragging rooms into folders, and navigating the new dashboard layout.
- **Security**: Folder API endpoints enforce strict authorization checks, ensuring users can only read, update, or delete folders they explicitly own.
- **Reliability**: The dashboard folder tree efficiently fetches and caches data, ensuring load times remain under 200ms even for users with hundreds of rooms and complex folder hierarchies.
- **Accessibility**: The drag-and-drop interface provides keyboard alternatives (e.g., an action menu to "Move to Folder") and screen reader announcements for successful moves.
- **GDPR**: Deleting an account successfully triggers the deletion of all associated folders alongside the user's rooms and templates.

### Future Press Release
**Organize Your Masterpieces with Dashboard Folders**
As your use of SketchGit grows, so does your library of brilliant ideas, architectures, and diagrams. Today, we are bringing order to your creative space with the launch of Dashboard Folders. Say goodbye to endless scrolling through a flat list of rooms. You can now create custom folders, sort your projects by client, sprint, or department, and drag-and-drop your workspaces to keep everything perfectly organized. Whether you manage five diagrams or five hundred, the new folder system ensures you can find exactly what you need in seconds. Dive into your redesigned SketchGit dashboard today and start building the structured workspace you deserve.