# Future Improvement Plans

## 1. Canvas Minimap / Radar View

### Goal
Provide users with a miniature overview of the entire canvas to facilitate rapid navigation and spatial awareness on large, complex diagrams.

### Problem
As diagrams grow in complexity and size, users frequently get lost or spend excessive time panning and zooming to find specific sections. The current zoom and pan controls are insufficient for global spatial context, especially when collaborating on extensive architectural layouts or sprawling mind maps.

### Proposed Changes
- **UI Component**: Implement a minimap UI component overlaid on the canvas (e.g., in the bottom-right corner).
- **Rendering Engine**: Use a secondary, scaled-down Fabric.js canvas (or a highly optimized static SVG representation) to render the current state of the main canvas.
- **Interactivity**: Add a draggable viewport indicator (a highlighted rectangle) within the minimap that synchronizes bidirectionally with the main canvas's pan and zoom state. Dragging the indicator moves the main camera, and panning the main camera moves the indicator.

### Definitions of Done
- **Documentation**: Update `/docs/customer`, `/docs/technical`, and `/docs/support` detailing how to use, toggle, and configure the minimap. Update `README.md` to list the minimap as a core feature.
- **Testing**: Vitest unit tests for the coordinate synchronization logic between the main viewport and the minimap viewport. Playwright E2E tests for interacting with the minimap UI to navigate the canvas.
- **Security**: The minimap rendering logic strictly adheres to existing canvas visibility and role-based access rules. No new endpoints or data models are introduced that could expose unauthorized data.
- **Reliability**: Throttle minimap updates during rapid drawing or dragging operations to prevent performance degradation and ensure the main canvas remains responsive at 60 FPS.
- **Accessibility**: Provide keyboard shortcuts to toggle the minimap visibility. The minimap container must have appropriate ARIA roles (`role="region"`, `aria-label="Canvas Minimap"`) and keyboard navigation support to jump to predefined quadrants.
- **GDPR**: The minimap is a purely client-side rendering feature and does not collect, transmit, or store any new personal data.

### Future Press Release
**Never Get Lost Again with the SketchGit Minimap**
Navigating massive, complex diagrams just became effortless. Today, we are introducing the SketchGit Minimap, a powerful new radar view for your collaborative canvases. Whether you are mapping out a sprawling microservices architecture or a comprehensive user journey, the minimap provides a birds-eye view of your entire workspace. Instantly see where your collaborators are working and jump to any section of the board with a single click. By keeping you spatially aware, the minimap eliminates the tedious panning and zooming that slows down your creative flow. Keep your eyes on the big picture with SketchGit!

---

## 2. Commit Tagging and Milestones

### Goal
Enable users to attach semantic tags or "milestones" (e.g., "v1.0", "Final Review", "Sprint 4") to specific commits for easy identification, filtering, and retrieval in the history timeline.

### Problem
While SketchGit's commit history provides a powerful, granular record of all changes, finding a specific, important state among dozens or hundreds of incremental commits is tedious. Users need a way to bookmark or label significant stable states, similar to Git tags, to easily reference them later or share them with stakeholders.

### Proposed Changes
- **Database Schema**: Update the Prisma schema to include a `Tag` model linked to the `Commit` model (many-to-many or one-to-many), or add a searchable `tags` string array directly to the `Commit` table.
- **Backend API**: Create REST endpoints (`POST /api/commits/[id]/tags`, `DELETE /api/commits/[id]/tags/[tag]`) to add and remove tags from a commit.
- **Frontend UI**:
  - Update the timeline view to visually highlight commits that possess tags, displaying the tag labels clearly.
  - Add a "Tag Commit" action to the commit details panel.
  - Introduce a filter mechanism in the history view to show only tagged commits.

### Definitions of Done
- **Documentation**: Update user and technical documentation (`/docs/*`) to explain how to tag commits and filter the history timeline. Update the `README.md` API section with the new endpoints.
- **Testing**: Unit tests for the Prisma database operations related to tags. Playwright E2E tests ensuring users can successfully add, remove, and filter by tags in the timeline UI.
- **Security**: Tag creation endpoints enforce strict authorization checks, ensuring only users with `EDITOR` or `OWNER` roles can tag commits. Input validation prevents XSS injection via tag names.
- **Reliability**: Database indexes are added to the tag fields to ensure history filtering remains performant even in rooms with thousands of commits.
- **Accessibility**: Tag UI elements are fully navigable via keyboard, and tag labels are announced correctly by screen readers. The filter menu is accessible.
- **GDPR**: Tags are considered standard user-generated content and are fully purged when a user initiates a GDPR account or room deletion.

### Future Press Release
**Mark Your Progress with SketchGit Commit Tagging**
Version control is about more than just a raw history of changes; it is about tracking meaningful progress. That is why we are launching Commit Tagging in SketchGit. Now, you can bookmark important milestones in your diagram's lifecycle—like "Draft Complete," "Client Approved," or "v2.0 Architecture." Instead of hunting through dozens of incremental saves, you can filter your history to see only your tagged milestones, making it easier than ever to review past decisions or rollback to a known good state. Bring structure to your creative process and easily communicate progress with SketchGit Commit Tagging!

---

## 3. Custom Shape Libraries

### Goal
Allow users to upload, manage, and utilize custom SVG shapes alongside standard tools on the canvas to support domain-specific diagramming.

### Problem
The standard set of drawing tools (rectangles, ellipses, arrows) is versatile but often limiting for specialized use cases, such as network topology mapping, specific UI component mockups, or custom flowcharts. Users currently have to draw these complex shapes manually, which is error-prone and time-consuming.

### Proposed Changes
- **Database Schema**: Create a `CustomShape` model in Prisma associated with a `User` (and potentially a `Room`), storing the sanitized SVG path data or a reference to an uploaded file.
- **Backend API**: Add endpoints (`/api/shapes`) to upload, list, and delete custom SVGs. Implement strict server-side SVG sanitization using DOMPurify or similar libraries to strip embedded scripts.
- **Frontend UI**:
  - Add a new "Shape Library" panel to the left toolbar.
  - Provide an upload interface for SVGs.
  - Allow users to drag-and-drop custom shapes from the panel directly onto the canvas.
- **Canvas Engine**: Update Fabric.js integration to load and render the custom SVG paths efficiently. Ensure the merge engine (`mergeEngine.ts`) correctly serializes and deserializes the custom shape object types.

### Definitions of Done
- **Documentation**: Add comprehensive guides in `/docs/*` covering how to upload, manage, and use custom shapes. Note any limitations on SVG complexity.
- **Testing**: Unit tests for server-side SVG sanitization logic. E2E tests covering the complete workflow of uploading an SVG, placing it on the canvas, committing, and branching.
- **Security**: Strict, server-side SVG sanitization is implemented and verified by tests to absolutely prevent any XSS vulnerabilities via embedded `<script>` tags or malicious event handlers within uploaded files.
- **Reliability**: Uploaded SVGs are cached effectively. Large or overly complex SVGs are rejected or simplified during upload to prevent rendering bottlenecks on the canvas.
- **Accessibility**: The shape library panel supports keyboard navigation. Uploaded shapes must require the user to provide an alt-text description upon upload for screen readers.
- **GDPR**: User-uploaded SVG files are classified as personal data/user content and are securely deleted when the user requests account erasure.

### Future Press Release
**Bring Your Own Domain: Introducing Custom Shape Libraries**
Every team has its own unique visual language, and your drawing tools should adapt to it. Today, SketchGit introduces Custom Shape Libraries, allowing you to upload and use your own SVG assets directly on the canvas. Whether you need specific cloud infrastructure icons, custom UI components, or specialized flowchart symbols, you can now build a personalized library that speeds up your diagramming workflow. Custom shapes integrate seamlessly with our real-time collaboration and version control engines, meaning they merge, branch, and sync just like standard shapes. Customize your SketchGit experience and diagram exactly the way you want!
