# SketchGit Next Steps Improvements

## 1. Presentation Mode (Viewport Frames)

### Goal
Provide users with the ability to define distinct "frames" or "slides" on the canvas and enter a presentation mode that sequentially navigates the viewport through these defined areas.

### Problem
SketchGit is excellent for creating large, expansive diagrams, mind maps, and architectures. However, when users want to present their work to stakeholders in a structured manner, they are forced to manually pan and zoom around the canvas during meetings. This manual navigation can be disorienting for viewers, often looks unprofessional, and makes it difficult to focus on specific, isolated points of the drawing without distraction.

### Proposed Changes
- **Canvas Engine**: Introduce a new custom Fabric.js object, `ViewportFrame`, which acts as an invisible bounding box (or lightly styled dotted rectangle when editing) that defines a presentation slide.
- **Data Model**: Ensure `ViewportFrame` objects have a sequential order index and a title. The merge engine (`mergeEngine.ts`) must support this new object type.
- **Frontend UI**:
  - Add a "Frame Tool" to the toolbar to draw frames on the canvas.
  - Implement a "Presentation Mode" toggle.
  - When in Presentation Mode, hide standard toolbars and display slide navigation controls (Next, Previous, Jump to Slide).
  - Use smooth animated panning and zooming to transition the canvas camera between frames.

### Definitions of Done
- **Documentation**: Update `/docs/customer` with instructions on how to create frames and enter presentation mode. Update `/docs/technical` detailing the `ViewportFrame` object structure.
- **Testing**: Vitest unit tests verifying `ViewportFrame` serialization and sorting logic. Playwright E2E tests validating the creation of frames and the UI transitions during presentation mode.
- **Security**: Frame definitions and presentation state are subject to the same rigorous sanitization and RBAC rules as standard canvas objects, preventing injection attacks or unauthorized frame modifications by `VIEWER` users.
- **Reliability**: Animated camera transitions use `requestAnimationFrame` and CSS/Canvas transform optimizations to ensure smooth 60fps playback, even on complex diagrams.
- **Accessibility**: Presentation navigation controls are fully keyboard-navigable (e.g., arrow keys for next/prev). Screen readers announce slide transitions and read the title of the current frame.
- **GDPR**: Presentation frames are strictly structural metadata and are purged identically to other canvas objects upon room or account deletion.

### Future Press Release
**Tell Your Story with SketchGit Presentation Mode**
Diagrams are powerful, but the story behind them is what truly matters. Today, we are thrilled to announce Presentation Mode in SketchGit, transforming your expansive canvases into structured, professional slide decks. Instead of awkwardly panning and zooming during important meetings, you can now define clean, focused "frames" around key areas of your diagram. With a single click, enter Presentation Mode and smoothly glide your audience through your architecture, user journey, or brainstorm, step by step. It combines the limitless freedom of a digital whiteboard with the focused narrative of a presentation tool. Elevate your next meeting and start framing your ideas with SketchGit today!

---

## 2. Grid System and Snap-to-Grid

### Goal
Implement a configurable background grid system and a snap-to-grid mechanism to assist users in creating precise, well-aligned diagrams.

### Problem
While the recently added grouping and alignment tools help organize existing objects, the initial drawing process can still feel imprecise. Users drawing architectures or precise schematics struggle to maintain consistent sizing and spacing manually. They often spend excessive time nudging objects pixel by pixel to align them perfectly, which detracts from the flow of ideation.

### Proposed Changes
- **Canvas Engine**:
  - Render a scalable, lightweight background grid on the Fabric.js canvas (using pattern brushes or optimized rendering).
  - Implement collision and coordinate rounding logic during object creation, moving, and scaling events (`object:moving`, `object:scaling`) to snap objects to the nearest grid intersection.
- **Frontend UI**:
  - Add a "Grid Settings" dropdown in the top toolbar to toggle grid visibility, toggle snapping, and adjust grid size (e.g., 10px, 20px, 50px).
- **State Management**: Persist user grid preferences in local storage or the database so their preferred grid settings load automatically on returning to a room.

### Definitions of Done
- **Documentation**: Update user guides in `/docs/customer` explaining how to enable and configure the grid. Update technical docs on how snap logic intercepts native Fabric events.
- **Testing**: Unit tests verifying the mathematical coordinate rounding logic for snapping. E2E tests confirming objects snap to the correct intervals when dragged on the canvas.
- **Security**: Grid settings are purely client-side rendering preferences; no security implications introduced, but settings payloads are still validated via Zod.
- **Reliability**: Background grid rendering is highly optimized to avoid causing render cycle bottlenecks when zooming out on large canvases.
- **Accessibility**: Grid configuration menus are keyboard accessible. High-contrast grid color options are available for users with visual impairments.
- **GDPR**: Grid preferences do not contain personal data. If persisted remotely, they are removed alongside user profile deletion.

### Future Press Release
**Achieve Perfect Precision with SketchGit Grid & Snap-to-Grid**
For engineers, architects, and meticulous designers, precision is paramount. That is why we are introducing the new Grid System and Snap-to-Grid capabilities to SketchGit. Say goodbye to the tedious pixel-nudging of the past. Now, you can enable a beautiful, customizable background grid that effortlessly guides your drawing. With snapping enabled, your shapes, lines, and text will automatically lock into perfect alignment as you draw and drag, ensuring consistent spacing and professional layouts every time. Whether you are drafting a strict database schema or a clean wireframe, SketchGit now provides the structure you need to work faster and more accurately.

---

## 3. Offline Mode and Background Synchronization

### Goal
Allow users to continue viewing and editing their currently open canvas even when their internet connection drops, and automatically synchronize their changes with the server once connectivity is restored.

### Problem
Network instability is a reality for many users (e.g., working on a train, experiencing sudden ISP drops). Currently, if the WebSocket connection drops, SketchGit users are abruptly blocked from making further changes and risk losing uncommitted work. This disruption breaks creative flow and causes anxiety regarding data loss.

### Proposed Changes
- **Local Persistence**: Utilize IndexedDB (via a wrapper like `idb`) to locally store the current room state, including uncommitted drawing deltas and pending commits.
- **State Machine**: Enhance the WebSocket connection manager to gracefully handle disconnected states, switching the UI to "Offline Mode".
- **Sync Engine**: When the connection is restored, the client will push locally stored changes to the server. The server's 3-way merge engine will treat offline changes identically to branch merges, seamlessly resolving conflicts if other users modified the canvas during the offline period.
- **Frontend UI**: Add clear connection status indicators (Online, Offline, Syncing) to the top toolbar.

### Definitions of Done
- **Documentation**: Update `/docs/customer` to explain the offline capabilities and sync behavior. Update `/docs/technical` detailing the IndexedDB schema and the offline state machine.
- **Testing**: Playwright E2E tests simulating network drops (using Playwright's offline mode features), making edits, restoring network, and verifying successful data synchronization.
- **Security**: Locally stored IndexedDB data is strictly isolated by origin. The sync engine payload is rigorously validated by the backend Zod schemas upon reconnection to prevent injection of malicious offline data.
- **Reliability**: The synchronization queue handles failed sync attempts with exponential backoff.
- **Accessibility**: Connection status changes trigger ARIA live region announcements so screen reader users are immediately aware of network drops and successful syncs.
- **GDPR**: Locally stored IndexedDB data is cleared when the user logs out or requests account deletion via the provided UI controls.

### Future Press Release
**Draw Anywhere, Anytime: SketchGit Introduces Offline Mode**
Your best ideas do not always happen when you have a perfect internet connection. We are incredibly excited to introduce Offline Mode for SketchGit. Whether you are commuting through a tunnel, working from a remote cabin, or just experiencing temporary Wi-Fi hiccups, SketchGit will never interrupt your flow again. When your connection drops, you can continue drawing, editing, and mapping out your ideas seamlessly. The moment you are back online, SketchGit automatically synchronizes your changes in the background, gracefully merging your offline work with your team's live updates. Experience true resilience and uninterrupted creativity with SketchGit Offline Mode!
