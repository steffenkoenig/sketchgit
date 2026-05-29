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
  - Update the `RoomMember` model to include a `role` enum (`OWNER`, `EDITOR`, `VIEWER`).
  - Add a `publicReadOnly` boolean flag to the `Room` model.
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
