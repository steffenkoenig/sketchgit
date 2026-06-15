# SketchGit Improvement Plans

## 1. Two-Factor Authentication (2FA) via Email

### Goal
Enhance user account security by adding an optional Two-Factor Authentication (2FA) layer using email-based One-Time Passwords (OTP) during the sign-in process.

### Problem
Currently, users authenticate via a standard email and password or GitHub OAuth. Passwords can be compromised, leaked, or guessed. For users who store sensitive architectural or proprietary drawings in SketchGit, single-factor authentication poses an unnecessary security risk.

### Proposed Changes
- **Database Schema**: Add `twoFactorEnabled` (boolean) and `twoFactorSecret` to the `User` model in Prisma. Create a `TwoFactorToken` model to store expiring OTPs.
- **Backend API**:
  - Add an endpoint `/api/auth/2fa/enable` to generate a secret and send a verification code to the user's email.
  - Modify the login flow in NextAuth to return a "2FA required" response if `twoFactorEnabled` is true, pausing the session creation.
  - Add a `/api/auth/2fa/verify` endpoint to consume the OTP and finalize the login session.
- **Frontend UI**:
  - Add a "Security" tab in the user dashboard to toggle 2FA on/off.
  - Create a 2FA verification challenge screen during login.
- **Email Service**: Use the existing Resend integration to email the 6-digit OTP codes.

### Definitions of Done
- **Functionality**: Users can enable/disable 2FA via email. Login properly intercepts and requires an OTP if 2FA is enabled.
- **Testing**: Vitest unit tests cover OTP generation and validation logic. Playwright E2E tests cover the login flow with 2FA enabled, including invalid token attempts.
- **Security**: Rate-limiting is applied to the 2FA verification endpoint to prevent brute-forcing. OTP tokens expire after 10 minutes and are consumed on first use.
- **Reliability**: If the email service fails temporarily, proper error messages are displayed to the user.
- **Accessibility**: 2FA input fields use appropriate `autocomplete="one-time-code"`, ARIA labels, and are fully navigable via keyboard.
- **GDPR**: 2FA statuses and tokens are automatically deleted if a user requests account deletion via the existing GDPR data erasure flow.
- **Documentation**: Update `README.md` to mention 2FA support and add standard operating procedures for resetting 2FA for users who lose access.

### Future Press Release
**SketchGit Introduces Two-Factor Authentication for Enhanced Security**
Today, SketchGit is thrilled to announce the rollout of Email Two-Factor Authentication (2FA), bringing a crucial layer of security to your collaborative workspaces. As teams increasingly rely on SketchGit for sensitive designs and proprietary diagrams, safeguarding your account has never been more important. With this update, users can opt-in to receive a secure, one-time passcode directly to their inbox whenever they sign in. This ensures that even if a password is compromised, your creative assets remain strictly under your control. We built this feature using our existing privacy-first architecture, ensuring no reliance on third-party authenticator apps while maintaining strict GDPR compliance. Enable 2FA in your dashboard settings today and draw with total peace of mind.


---

## 2. Reusable Canvas Templates

### Goal
Allow users to save existing canvas states as reusable templates and spawn new rooms populated with these templates instantly.

### Problem
Users frequently need to start new diagrams with a standard baseline—such as wireframe grids, standard architectural title blocks, or specific sprint retrospective boards. Currently, they must manually draw these starting points or merge from an old, potentially cluttered branch, which adds friction to the creative process.

### Proposed Changes
- **Database Schema**: Create a `Template` model associated with a `User`, storing a serialized Fabric.js canvas JSON state.
- **Backend API**:
  - `POST /api/templates`: Save the current room's base state as a template.
  - `GET /api/templates`: Fetch the user's saved templates.
  - Modify `POST /api/rooms` to accept an optional `templateId`. If provided, initialize the new room's first commit with the template's canvas state.
- **Frontend UI**:
  - Add a "Save as Template" action in the top toolbar of a room.
  - Update the Dashboard with a "Templates" section.
  - Update the "Create Room" flow to include a visual template selector (using generated SVG thumbnails).

### Definitions of Done
- **Functionality**: Users can capture a room's state as a template and successfully instantiate new rooms containing those objects.
- **Testing**: Unit tests verify template serialization and database insertion. E2E tests verify that a room created from a template loads the objects properly on the canvas.
- **Security**: Templates are scoped by user; endpoints strictly validate ownership so users cannot access templates belonging to others.
- **Reliability**: Template JSON payloads are validated via Zod against a maximum size limit to prevent database bloat and performance degradation.
- **Accessibility**: The template selector in the dashboard is fully screen-reader accessible with descriptive alt text for template thumbnails.
- **GDPR**: Templates are permanently purged when the user initiates a GDPR account deletion.
- **Documentation**: The `README.md` is updated to guide users on creating and managing room templates.

### Future Press Release
**Jumpstart Your Creativity with SketchGit Canvas Templates**
We are excited to launch Canvas Templates for SketchGit, fundamentally speeding up how teams begin their collaborative drawing sessions. No more starting from a blank slate when you need a standard wireframe, retrospective board, or technical diagram layout. Now, with a single click, you can save any existing canvas as a reusable template directly from your toolbar. When creating a new room, simply select your saved template to instantly populate the canvas with your baseline designs. This feature is designed to standardize team workflows and reduce setup friction, giving you more time to focus on actual collaboration. Head over to your dashboard today to create your first template!


---

## 3. Advanced Role-Based Access Control (RBAC) & Read-Only Sharing Links

### Goal
Provide granular permissions for collaborative rooms by distinguishing between Viewers, Editors, and Owners, and enable read-only public links.

### Problem
Currently, anyone with a room link or an invitation token has full editing capabilities. For large organizations or public presentations, a room owner often wants to share their diagram with stakeholders for review without the risk of accidental modifications or unwanted commits.

### Proposed Changes
- **Database Schema**:
  - Leverage the existing `RoomMembership` model and its `role` field (which uses the `MemberRole` enum containing `OWNER`, `EDITOR`, `COMMITTER`, and `VIEWER`).
  - Leverage the existing `ShareLink` model with `SharePermission.VIEW` for read-only sharing, or add a `publicReadOnly` boolean flag to the `Room` model if a room-wide toggle is preferred.
- **Backend/WebSocket**:
  - Modify WebSocket event handlers to check the user's role before processing drawing deltas, commits, or branch modifications. Discard unauthorized events.
  - Update `proxy.ts` and Next.js route handlers to enforce RBAC rules on API endpoints (e.g., blocking `VIEWER` from creating commits).
- **Frontend UI**:
  - Update the Canvas page to disable toolbars and drawing interactions if the user is a `VIEWER`.
  - Add a "Share Settings" modal in the room allowing the `OWNER` to adjust member roles and toggle the public read-only link.

### Definitions of Done
- **Functionality**: Owners can change member roles. Viewers cannot modify the canvas, create commits, or merge branches. Public read-only links allow unauthenticated viewing.
- **Testing**: WebSocket tests confirm that mutation events from Viewers are actively rejected by the server. E2E tests confirm the toolbar is disabled and read-only UI is displayed for Viewers.
- **Security**: Authorization checks are strictly enforced server-side (in HTTP and WS handlers), not just hidden in the frontend UI.
- **Reliability**: Role checks are cached efficiently in memory/Redis during WebSocket connections to avoid database bottlenecking on every draw-delta event.
- **Accessibility**: Disabled toolbars clearly communicate their state to screen readers, and the sharing modal is keyboard-navigable.
- **GDPR**: Read-only public links do not track or store personal data of unauthenticated viewers.
- **Documentation**: `README.md` is updated with a permissions matrix detailing what actions each role can perform.

### Future Press Release
**SketchGit Unveils Advanced Sharing and Read-Only Access**
Collaborating with external stakeholders just got a lot safer. Today, SketchGit introduces Advanced Role-Based Access Control (RBAC) and Public Read-Only Links. We understand that sometimes you need to showcase a complex diagram to a large audience without worrying about accidental edits or unwanted commits. Room owners can now explicitly assign Viewer or Editor roles to collaborators, ensuring your master designs remain pristine. Furthermore, you can instantly generate a public read-only link, perfect for embedding in company wikis or sharing broadly. This update fortifies SketchGit as an enterprise-ready tool, balancing seamless real-time collaboration with strict access governance. Try out the new Share Settings menu in your next session!


---

## 4. In-Canvas Commenting and Feedback Threads

### Goal
Enable users to add context-specific comments and start feedback threads directly on canvas objects to facilitate asynchronous communication.

### Problem
Currently, users collaborate in real-time but lack a built-in way to leave feedback or questions asynchronously. They have to rely on external chat tools or text objects on the canvas, which clutters the design and disconnects discussion from specific components.

### Proposed Changes
- **Database Schema**: Add `Comment` and `Thread` models. A thread attaches to a specific canvas object ID.
- **Backend API**:
  - `POST /api/rooms/[roomId]/threads`: Create a thread on an object.
  - `POST /api/threads/[threadId]/comments`: Add a comment to an existing thread.
  - Implement WebSocket events to broadcast thread creation and comment additions to active users.
- **Frontend UI**:
  - Introduce a new "Comment" tool in the toolbar.
  - Render thread markers over associated objects. Clicking a marker opens a side panel with the thread's discussion.
- **Email Service**: Send email notifications (via Resend) to room members or mentioned users when a new comment is added.

### Definitions of Done
- **Functionality**: Users can create threads attached to specific objects, reply to threads, and receive email notifications. Thread markers are visible on the canvas.
- **Testing**: Vitest unit tests verify thread creation and commenting API logic. Playwright E2E tests confirm the thread sidebar functionality and marker placement.
- **Security**: The API endpoints verify that the user has at least `VIEWER` access to the room to read threads, and `EDITOR` or `OWNER` to create threads/comments.
- **Reliability**: Comment creation is optimistic on the frontend to ensure a snappy user experience, while WebSocket syncing handles long-polling and network interruptions gracefully.
- **Accessibility**: The comment side panel is keyboard-navigable and screen-reader accessible. ARIA labels clarify thread markers on the canvas.
- **GDPR**: Users can delete their own comments. If an account is deleted, all their comments are either anonymized or completely deleted according to GDPR requirements.
- **Documentation**: Update `README.md` to detail the commenting feature. Update `/docs/customer`, `/docs/technical`, and `/docs/support` to reflect the new functionality.

### Future Press Release
**SketchGit Brings Conversations to the Canvas with In-Canvas Commenting**
We are excited to introduce In-Canvas Commenting and Feedback Threads to SketchGit, bridging the gap between asynchronous feedback and real-time design. Previously, teams had to use disconnected chat applications or clutter the canvas with text boxes to discuss specific diagram elements. Now, you can pin a discussion thread directly to any object, creating a focused space for questions, approvals, and reviews. Whether you are reviewing an architectural diagram or brainstorming a wireframe, your team's feedback is now perfectly contextualized. When you are tagged in a comment, you'll receive a convenient email notification keeping you in the loop. This update transforms SketchGit from just a drawing tool into a comprehensive collaboration hub. Try out the new comment tool in your next design review!

---

## 5. Offline Mode with Auto-Sync

### Goal
Provide an offline mode that allows users to continue working on their canvas without an internet connection, automatically syncing changes once the connection is restored.

### Problem
SketchGit currently requires an active WebSocket connection to function fully. If a user experiences a temporary network drop or wants to work while traveling without internet access, their ability to draw, create commits, or manage branches is severely impaired or blocked completely.

### Proposed Changes
- **Database / Local Storage**: Leverage IndexedDB on the client side to locally store canvas state, commits, and pending actions when offline.
- **Backend API**:
  - Create a batch-sync endpoint `/api/rooms/[roomId]/sync` to receive and process a queue of offline actions.
  - Implement robust conflict resolution for changes made offline that conflict with server-side updates from other users.
- **Frontend UI**:
  - Add an offline status indicator in the top toolbar to clearly communicate network state.
  - Queue mutations in a local store and replay them when the WebSocket connection is re-established.

### Definitions of Done
- **Functionality**: Users can draw, undo, redo, and make local commits while offline. Upon reconnection, local changes are synchronized with the server seamlessly.
- **Testing**: Playwright E2E tests simulate network disconnection and reconnection to verify offline drawing and subsequent synchronization. Vitest tests cover the batch-sync resolution logic.
- **Security**: Batch sync payloads are strictly validated against Zod schemas and checked for correct room authorization before processing.
- **Reliability**: The synchronization queue handles failed sync attempts with exponential backoff and prevents data loss by persisting the queue in IndexedDB.
- **Accessibility**: The offline status indicator is accompanied by a screen reader announcement so visually impaired users are aware of their network state.
- **GDPR**: Offline data is stored purely locally in the user's browser. Clearing local site data effectively purges offline storage, ensuring user control over data.
- **Documentation**: Update `/docs/customer`, `/docs/technical`, and `/docs/support` outlining the offline capabilities, limitations, and sync conflict resolution mechanisms.

### Future Press Release
**Draw Anywhere with SketchGit's New Offline Mode**
We know inspiration doesn't always wait for a stable Wi-Fi connection, which is why we are thrilled to launch Offline Mode with Auto-Sync for SketchGit. Whether you are on a flight or experiencing network instability, you can now continue drawing, creating commits, and managing branches entirely locally. Our new intelligent synchronization engine works seamlessly in the background to store your changes and automatically push them to the server the moment you reconnect. You no longer have to worry about losing your progress due to dropped connections. The intuitive offline indicator ensures you always know your network status. Enjoy uninterrupted creativity wherever you are!

---

## 6. Advanced Layer Management and Object Grouping

### Goal
Introduce a robust layer management system and advanced object grouping capabilities to simplify the organization of complex canvas designs.

### Problem
As users create more intricate diagrams, the canvas becomes difficult to manage. Without layers or deep grouping, selecting overlapping objects, locking specific background elements (like grids or templates), or toggling the visibility of complex object clusters is cumbersome and error-prone.

### Proposed Changes
- **Canvas State / Backend**: Extend the internal canvas state to support Layer objects. A layer contains an ordered list of grouped and individual objects.
- **Frontend UI**:
  - Introduce a comprehensive "Layers" side panel that displays the hierarchy of layers and objects.
  - Add UI controls to toggle layer visibility, lock/unlock entire layers, and reorder layers via drag-and-drop.
  - Enhance grouping logic to support nested groups (groups within groups).
- **Backend/WebSocket**: Broadcast layer visibility and locking states to ensure consistency across collaborative sessions.

### Definitions of Done
- **Functionality**: Users can create, rename, reorder, lock, and toggle the visibility of layers. Objects can be grouped, nested, and assigned to specific layers.
- **Testing**: Vitest tests validate layer serialization and grouping logic within the Git merge engine. Playwright E2E tests confirm drag-and-drop layer reordering and visibility toggling.
- **Security**: Layer modification events are validated server-side to ensure the user has appropriate permissions to modify the room's structural layout.
- **Reliability**: Layer operations (especially dragging large groups) are optimized to avoid blocking the main browser thread, ensuring 60fps rendering performance.
- **Accessibility**: The layer panel is fully accessible via keyboard navigation, supporting drag-and-drop alternatives (like up/down arrow keys for reordering) and appropriate ARIA attributes.
- **GDPR**: Layer metadata does not introduce any new personal data tracking, maintaining full compliance with existing data erasure policies.
- **Documentation**: Update `/docs/customer`, `/docs/technical`, and `/docs/support` detailing the layer panel features, nested grouping, and locking mechanisms.

### Future Press Release
**Master Complex Diagrams with SketchGit's Layer Management**
Today, we are elevating SketchGit from a simple drawing board to a professional-grade diagramming tool with the introduction of Advanced Layer Management and Object Grouping. As your designs grow in complexity, keeping them organized is crucial. Our new Layers panel allows you to effortlessly manage overlapping elements, lock background templates, and toggle the visibility of specific annotations. Furthermore, you can now nest groups within groups, providing unparalleled control over your diagram's structure. Whether you are building intricate architectural blueprints or multi-layered UI mockups, SketchGit provides the structural tools you need to stay organized. Dive into your dashboard and start building better, structured designs today!
