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

## Implementation Notes (2026-08-22)

**Numbering note**: this repo already has a completed, differently-scoped
proposal also numbered P091 (`proposals/done/P091_granular-share-links.md`,
per-link ADMIN/BRANCH_CREATE/WRITE/VIEW permission tokens). This report is
the "Room Roles and Permissions" proposal that happens to share the number —
a known pre-existing wart (not the only ID collision in this repo's
history), not something introduced here.

Most of this proposal's foundation already existed before this session:
`RoomMembership.role` (OWNER/EDITOR/COMMITTER/VIEWER) and full WS/REST
server-side enforcement shipped as part of P034 and the granular-share-links
P091. What was actually missing — and implemented here — was everything
about a member *discovering* and an owner *managing* that role at runtime:

- **`welcome` message now includes `role`**: previously the server tracked
  a connection's role internally but never told the client, so a VIEWER's
  UI had no way to know it was restricted — draw attempts were just
  silently dropped server-side with no visible explanation.
- **`role-update` WS message + `lib/server/wsRoomBroadcaster.ts`'s new
  `updateClientRole()`**: when an owner changes a member's role, their
  live WS connection(s) get both their in-memory server-side role updated
  (so P034 enforcement picks it up on the very next message, not just
  future connections) and a push notification so the client can react
  immediately. Targeted to that user's connections specifically, not a
  room-wide broadcast — extends the existing `updateClient`/`broadcast`
  pattern in `wsRoomBroadcaster.ts` rather than introducing a new mechanism.
- **Client-side read-only mode**: `collaborationManager.ts` exposes
  `myRole` and an `onRoleChanged` callback; `appCollaboration.ts` wires it
  to dim/disable the toolbar (`body.role-viewer #toolbar { opacity:.4;
  pointer-events:none }`) and show a persistent "Read-only" badge — a UX
  affordance, not the enforcement (that stays server-side, per this
  proposal's own Security section).
- **`GET/PATCH /api/rooms/[roomId]/members[/userId]`**: owner-only member
  listing and role changes, with `setRoomMemberRole()` in
  `roomRepository.ts` refusing to demote the room's last remaining OWNER
  (this proposal's "prevent privilege escalation" requirement, read as
  "prevent accidental self-lockout" for the demote-the-last-owner case).
- **`MembersModal.tsx`**: new, separate modal component (not added to the
  existing 522-line `ShareModal.tsx`) for the owner-facing management UI —
  lower risk of regressing the already-working, already-tested share-link
  flow than extending it further.
- Used a plain `x-admin-secret`-style **admin-auth pattern only where it
  already existed** (P090's `verifyAdminSecret`) — n/a here, this feature
  uses the room's own OWNER role via `checkRoomAccess`, not a site-wide
  admin secret; noted to be explicit that no new auth mechanism was
  introduced beyond what P034 already established.

**Scoped down from the proposal**: no dedicated Playwright E2E suite (see
below — attempted, blocked by an environment issue, not shipped
unverified), no `RoomEvent`-based audit logging of role changes (no new
`RoomEventType` enum value — P074's activity feed doesn't yet have a
role-change entry type; straightforward to add later), no screen-reader
live-announcement of role changes beyond the badge's `role="status"` (which
does get announced on appearance).

### A significant detour: found and fixed three unrelated, real, previously-unknown production bugs

Verifying this feature end-to-end (register a user → own a room → generate
a VIEW share link → confirm a second browser context gets a visibly
read-only canvas) surfaced problems that had nothing to do with P091 itself
but were severe enough to fix immediately rather than work around:

1. **`lib/auth.ts`: NextAuth `trustHost` was never set.** NextAuth v5
   rejects every request with `UntrustedHost` unless the host is explicitly
   trusted — true by default only on platforms it auto-detects (Vercel,
   etc.), false for a self-hosted app like this one (Docker/Kubernetes,
   confirmed via `Dockerfile`/`docker-compose.yml`/`.github/workflows/deploy.yml`).
   **This meant every sign-in and session check failed outright in any real
   production deployment** — verified live: server logs showed
   `UntrustedHost` on every `/api/auth/*` request until `trustHost: true`
   was added, after which registration → auto-sign-in → redirect all
   succeeded. Only reproduces with `NODE_ENV=production`, which is exactly
   why nothing in the existing test suite (unit tests mock `auth()`; E2E
   was never run in CI before this session's P082/P087 work) ever caught it.
2. **`app/layout.tsx`: a recent "security" commit broke hydration
   site-wide.** It replaced `dangerouslySetInnerHTML` with
   `<script nonce={nonce}>{foucScript}</script>` (JSX text children) for
   the static, hardcoded FOUC-prevention script — no user input is ever
   interpolated into it, so there was no XSS vector to fix, but the change
   is a well-known React footgun: browsers parse `<script>` content as
   raw/unescaped text, while React's hydration for a `<script>` tag with a
   plain string child expects standard HTML-entity-escaped text. The
   mismatch triggers React error #418 (hydration failed) on every page
   load, which aborts hydration for the whole tree. Reverted to
   `dangerouslySetInnerHTML` with a comment explaining why it's correct here.
3. **`components/sketchgit/AppTopbar.tsx`: `ThemeToggle`'s initial state
   depended on `window.matchMedia` during the render that must match SSR
   output.** The lazy `useState` initializer branched on `typeof window`,
   giving the server an unconditional `isDark=true` guess while the client
   (even inside a lazy initializer — it still runs at hydration time)
   computed the real value from the cookie or `matchMedia`. Any first-time
   visitor whose browser/OS prefers light mode got a guaranteed hydration
   mismatch. Fixed by always initializing to `true` (matching the server)
   and correcting it in a `useEffect` that runs only after hydration
   completes. **This was the actual root cause of the WS/interactivity
   symptoms** chased at length below — once fixed, `React error #418`
   stopped appearing entirely (confirmed via a `pageerror` listener across
   dozens of repeated test runs).

Also fixed, smaller and found along the way: `e2e/auth.spec.ts` and this
proposal's own new spec both had a heading regex (`/create account/i`) that
didn't match the actual page text ("Create *your* account" — fixed to
`/create.*account/i`); `e2e/canvas.spec.ts`'s pen-tool selector
(`getByRole('button', {name: /pen/i})`) ambiguously also matched "Open
merge branch dialog" ("O-**pen**" contains "pen") — fixed to `#tpen`.

### E2E verification: strong evidence, but not a committed passing test

After the three fixes above, `e2e/canvas.spec.ts` progressed much further
(drew a shape, reached the commit modal) but a dedicated
`e2e/roomRoles.spec.ts` (owner creates a room → generates a VIEW share link
→ a second browser context confirms the dimmed/disabled toolbar) still
could not reliably connect over WebSocket **only from an actual browser**
in this local sandbox:

- A raw Node `ws` client, with and without `perMessageDeflate`, with all of
  the real browser's headers copied over (Cookie, Cache-Control, Origin,
  User-Agent, Accept-Encoding) except `Sec-WebSocket-Extensions`: succeeds.
- A raw TCP socket sending the *exact* browser handshake request byte-for-byte,
  `Sec-WebSocket-Extensions` included: succeeds (`101 Switching Protocols`,
  received compressed `welcome`/`presence` frames).
- Disabling `perMessageDeflate` server-side entirely: did not fix it.
- Only an actual Chromium browser (via Playwright) reproducibly fails, with
  "Connection closed before receiving a handshake response" — and switching
  the test's target from `http://localhost:3699` to `http://127.0.0.1:3699`
  changed the failure mode entirely (to a clean `403` from the Origin
  allow-list, which doesn't normalize `localhost`/`127.0.0.1` — itself a
  minor, separate, low-severity finding, not a bug: exact-match Origin
  checking is the intended P019 behavior).

This pattern — real browser fails, every non-browser client with identical
bytes-on-the-wire succeeds — points at a `localhost` IPv6/IPv4 dual-stack
resolution difference between Chromium's networking stack and Node's
`0.0.0.0`-only bind, specific to this macOS + Docker Desktop sandbox, not
an application defect. But "points at" isn't "proven," and this couldn't be
ruled out as a CI-reproducible issue in the time available. Rather than
commit a test that might be permanently red in CI, `e2e/roomRoles.spec.ts`
was **not** kept — the P091 change it would have tested (role visible in
`welcome`, role-update push notification, member management API) is
verified instead via the unit test suite (27 new/updated test cases across
`roomRepository.test.ts`, `wsConnectionHandler.test.ts`,
`wsRoomBroadcaster.test.ts`, and the two new route test files) plus the raw
WS/TCP client tests above, which directly exercised the real server code
path and confirmed the `welcome` message correctly includes
`"role":"EDITOR"`.
