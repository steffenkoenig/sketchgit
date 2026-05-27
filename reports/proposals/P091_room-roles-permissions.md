# P091 - Room Roles and Permissions

## Goal
To introduce granular roles and permissions within individual SketchGit whiteboard rooms, allowing room creators to control who can view, edit, or manage the board.

## Problem
Currently, any user with access to a room link has full editing capabilities. This poses a problem for larger teams or public presentations where a room creator might want to share a whiteboard in a read-only mode, or delegate moderation tasks without giving full control to every participant. The lack of role-based access control (RBAC) at the room level limits the platform's suitability for structured collaborative environments, education, and public sharing.

## Proposed Changes
1. **Schema Update**: Update the database schema to associate users with specific roles per room (e.g., `Owner`, `Editor`, `Viewer`).
2. **Access Control Logic**: Implement backend middleware and service-level checks to verify a user's role before processing edits or configuration changes.
3. **UI Enhancements**:
   - Add a "Share & Permissions" settings dialog within the room interface.
   - Visually distinguish read-only mode for users with the `Viewer` role (e.g., hiding drawing tools).
4. **WebSocket Updates**: Ensure real-time events respect permissions, silently dropping unauthorized edit attempts at the server level, and broadcasting permission changes to active users.

## Future Press Release
SketchGit is thrilled to announce the rollout of Room Roles and Permissions! Collaboration just got a lot more organized. Now, when you create a whiteboard room, you have complete control over who can draw, who can manage settings, and who can simply follow along as a viewer. Whether you are teaching a virtual class, hosting a company-wide presentation, or just want to protect your masterpiece from accidental scribbles, our new granular permissions have you covered. Easily assign Owner, Editor, or Viewer roles to participants directly from the new Sharing settings. Try it out today and experience a more structured and secure way to brainstorm together!

## Definitions of Done

### Implementation
- Database schema updated to support room-level roles (Owner, Editor, Viewer).
- Backend API and WebSocket endpoints updated to enforce role-based access control.
- Frontend updated to include a permissions management UI for Owners.
- Frontend updated to restrict tools/actions based on the current user's role.

### Testing
- Unit tests written for access control logic (verifying permissions per role).
- Integration tests ensuring unauthorized WebSocket messages are rejected.
- End-to-end (E2E) Playwright tests simulating multi-user interactions with different roles.
- Coverage remains at or above the required project threshold.

### Documentation
- Updated `README.md` or user guides to explain how to use the new roles and permissions feature.
- API documentation updated to reflect new endpoints or permission-related error codes.
- Architectural decision records updated if applicable.

### Security
- Ensure all permission checks are strictly enforced on the server-side, not just hidden in the UI.
- Prevent privilege escalation vulnerabilities (e.g., an Editor upgrading themselves to Owner).
- Validate all inputs in the new permissions management API.

### Reliability
- Permission checks must be highly performant to not introduce latency into real-time drawing actions (consider caching permissions on the WebSocket connection).
- Ensure graceful degradation if the permissions cache temporarily fails.

### Accessibility
- The new "Share & Permissions" UI must be fully accessible, including keyboard navigation and ARIA labels.
- State changes (e.g., "You have been granted Editor access") must be announced to screen readers.

### GDPR compliance
- Ensure that the association of user identities with room permissions respects data minimization principles.
- Roles and permissions data must be included in user data export requests.
- When a user requests account deletion, their permission associations must be cleanly removed or anonymized.
