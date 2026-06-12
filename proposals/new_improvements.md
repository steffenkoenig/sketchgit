# SketchGit Internal Platform Improvements

## 1. Threaded Canvas Comments

### Goal
Provide users with the ability to leave contextual, threaded comments on specific objects or coordinates on the canvas, fostering discussion without cluttering the diagram itself.

### Problem
Currently, users who want to discuss a specific part of a diagram must either use the text tool to add temporary notes directly onto the canvas, or use an external communication tool and attempt to describe the location (e.g., "Look at the blue rectangle in the top left"). Adding text to the canvas pollutes the diagram's structure and version history with meta-discussion, making the actual design harder to read and maintain.

### Proposed Changes
- **Data Model:** Add a `Comment` and `CommentThread` model to Prisma, linking them to specific coordinates (`x`, `y`) or specific `objectId`s within a room, and defining cascade/cleanup behavior for deleted objects (e.g., convert to coordinate-based comments at the object's last known position, or cascade-delete threads on object removal).
- **Backend API:** Implement REST endpoints and WebSocket events to handle the creation, replying, resolving, and deletion of comments in real time.
- **Canvas UI:** Introduce a "Comment Tool" allowing users to click anywhere on the canvas to drop a comment pin. Clicking a pin opens a sidebar or popover showing the threaded discussion.
- **Email Notifications:** Integrate with the existing email service (Resend) to optionally notify room members when they are mentioned in a comment or when a thread they participated in is updated.

### Definitions of Done
- **Documentation:** Update user documentation (`/docs/customer`) with instructions on how to create, reply to, and resolve comments. Update `/docs/technical` detailing the real-time event broadcasting for the new comment models.
- **Testing:** Unit tests verifying the Prisma comment repository logic. Playwright E2E tests for dropping a comment pin, typing a reply, and resolving the thread, ensuring updates broadcast instantly to other connected clients.
- **Security:** Strict server-side validation using Zod ensures comment text cannot contain malicious payloads (XSS protection). Users can only comment in rooms where they hold at least a `COMMITTER` role (consistent with drawing permissions; EDITOR and OWNER roles are also permitted).
- **Reliability:** Comment markers render efficiently on the Fabric.js canvas without slowing down standard drawing operations, even with hundreds of resolved/unresolved threads.
- **Accessibility:** Comment pins can be navigated using the keyboard (`Tab` indexing). The comment sidebar utilizes appropriate ARIA live regions to announce incoming replies to screen readers.
- **GDPR:** Comments are treated as user-generated data. They can be deleted individually by the author and are automatically scrubbed from the database when a user requests an account deletion.

### Future Press Release
**Contextualize Your Collaboration with Threaded Canvas Comments**
Feedback is the lifeblood of great design, but discussing complex diagrams has always been messy. Today, we are thrilled to introduce Threaded Canvas Comments to SketchGit. You no longer have to pollute your pristine architectures with scattered text boxes or rely on disjointed chat apps to explain your thoughts. Now, you can drop a comment pin exactly where you need it—on a specific button, a database node, or a blank space—and start a focused, threaded discussion right on the canvas. Tag your teammates, resolve threads when decisions are made, and keep your diagrams clean and your communication clear. Upgrade your collaborative workflows and start leaving targeted feedback in your SketchGit rooms today!

---

## 2. Advanced Layer Management

### Goal
Implement a comprehensive layer management panel that allows users to easily view, reorder, lock, and toggle the visibility of all objects and groups on the canvas.

### Problem
As users build highly complex, overlapping diagrams (such as intricate UI mockups or layered architectural designs), managing the z-index (depth) of objects becomes incredibly difficult. Selecting an object hidden behind a larger shape is frustrating, and users often accidentally move background elements while trying to select foreground details. The current system relies entirely on right-click context menus to send objects forward or backward, which is opaque and tedious.

### Proposed Changes
- **UI Component:** Build a new "Layers" sidebar panel integrated with the existing PropertiesPanel as tabbed sections within a unified right-side sidebar (to avoid overlapping UI), displaying a hierarchical tree view of all objects and groups currently on the canvas.
- **Canvas Integration:** Bidirectionally bind the Fabric.js canvas state to the Layers panel. Selecting an item in the panel selects it on the canvas, and vice versa.
- **Features:** Add drag-and-drop support within the Layers panel to adjust z-index. Add toggle buttons on each row to hide/show objects and lock/unlock them (preventing selection/modification).
- **State Synchronization:** Ensure that visibility and locking metadata are correctly synced across clients via WebSockets and properly serialized into commits.

### Definitions of Done
- **Documentation:** Update the Customer and Support documentation architectures detailing how to use the Layers panel for complex selections. Update Technical documentation covering the integration between the React DOM and the Fabric.js z-index stack.
- **Testing:** Vitest unit tests verifying that reordering objects in the internal state arrays correctly pushes history. Playwright E2E tests validating that drag-and-drop in the layers panel updates the canvas rendering order immediately.
- **Security:** Layer visibility and locking status are standard metadata properties and are subjected to existing input sanitization, preventing arbitrary code execution.
- **Reliability:** The layers tree view is virtualized to guarantee smooth scrolling and immediate rendering updates, even on canvases containing thousands of objects.
- **Accessibility:** The layers tree view supports full keyboard navigation (up/down arrows to traverse, space to select, `Enter` to toggle visibility). Drag-and-drop reordering provides an accessible keyboard alternative (e.g., `Ctrl+Up/Down`).
- **GDPR:** Object metadata handled by the layer manager contains no personal identifying information and requires no new compliance workflows.

### Future Press Release
**Take Total Control of Your Canvas with Advanced Layer Management**
Building complex diagrams shouldn't feel like wrestling with your tools. We know that as your architectures and designs grow, keeping track of every overlapping shape and text box becomes a challenge. Today, SketchGit is launching Advanced Layer Management, giving you x-ray vision into your canvas. Our new Layers panel provides a clear, hierarchical view of every object you've drawn. With a simple drag-and-drop interface, you can effortlessly reorder elements, lock your background grids to prevent accidental edits, and toggle visibility to focus on specific components. Say goodbye to the frustration of losing objects behind larger shapes. Experience unprecedented precision and organization in your SketchGit workspace today!

---

## 3. Customizable Keyboard Shortcuts

### Goal
Provide users with a dedicated interface to remap the default keyboard shortcuts for all drawing tools, UI actions, and canvas operations to suit their personal workflows and accessibility needs.

### Problem
SketchGit features a robust set of predefined keyboard shortcuts (e.g., 'P' for Pen, 'Ctrl+Z' for Undo). However, hardcoded shortcuts do not work for everyone. Users coming from other design tools often have deeply ingrained muscle memory for different key bindings. Furthermore, hardcoded single-key shortcuts can create significant accessibility barriers for users utilizing alternative input devices, voice commands, or non-standard keyboard layouts.

### Proposed Changes
- **Database Schema:** Add a `ShortcutPreferences` JSON field to the existing `User` model to store personalized key bindings, with a `localStorage` fallback (via `userPreferences.ts`) for anonymous/unauthenticated users so custom bindings are preserved across sessions.
- **Shortcut Engine:** Refactor the frontend event listeners to decouple actions from specific keys, routing keydown events through a dynamic shortcut resolution manager.
- **User Interface:** Create a new "Keyboard Shortcuts" modal accessible from the user settings menu, displaying a searchable list of all actions and allowing users to record new key combinations.
- **Conflict Resolution:** Implement logic in the settings modal to warn users if they attempt to assign a key combination that is already in use by another action or the browser itself.

### Definitions of Done
- **Documentation:** Add a new section in `/docs/customer` explaining how to remap shortcuts. Ensure `/docs/support` contains troubleshooting steps for resetting shortcuts to default.
- **Testing:** Unit tests for the dynamic shortcut resolution engine and conflict detection logic. E2E tests confirming that changing a shortcut successfully updates the canvas interaction behavior without requiring a page reload.
- **Security:** Shortcut payloads are validated against a strict Zod schema before saving to the database, ensuring malformed JSON cannot corrupt the user's profile state.
- **Reliability:** Keydown event delegation remains highly performant, utilizing a hash map for O(1) shortcut resolution to prevent input lag during rapid typing or drawing.
- **Accessibility:** The shortcut remapping interface strictly adheres to WCAG guidelines, ensuring users can navigate the modal, record new bindings, and clear existing ones using only the keyboard or assistive technologies.
- **GDPR:** Custom shortcut preferences are considered personal configuration data and are immediately and permanently erased alongside the profile during the account deletion process.

### Future Press Release
**Work Your Way with Customizable Keyboard Shortcuts**
Every creator has a unique rhythm, and your tools should adapt to your workflow, not the other way around. Today, we are empowering you to personalize your SketchGit experience with Customizable Keyboard Shortcuts. We understand that muscle memory from other design platforms is strong, and accessibility needs vary wildly from user to user. Now, you have the freedom to remap any tool, action, or command to the key combinations that feel most natural to you. Whether you want to align SketchGit with your favorite vector editor or create entirely new shortcuts for your unique hardware setup, you are in total control. Dive into your account settings and start tailoring SketchGit to match your exact creative flow!
