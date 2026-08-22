# P093 - Room Password Protection

## Status
Done

## Goal
To allow room creators to set an optional password on their SketchGit whiteboards, restricting access exclusively to individuals who possess the password, regardless of whether they have the room's URL.

## Problem
Currently, access to a SketchGit room is governed entirely by URL obscurity (unlisted links). If a URL is leaked or accidentally shared publicly, anyone can view or interact with the whiteboard. For users dealing with sensitive information—such as internal company brainstorming, confidential designs, or private tutoring sessions—URL obscurity is insufficient. There is no mechanism to explicitly lock down a room to unauthorized visitors.

## Proposed Changes
1. **Schema Update**: Update the database schema to store an optional, securely hashed password (e.g., using bcrypt or Argon2) for each room.
2. **Authentication Flow**: Implement an interstitial password prompt page that intercepts users attempting to join a password-protected room.
3. **Session Management**: Issue secure, HttpOnly, signed cookies or short-lived JWTs to authenticate a user's session specifically for the accessed room. To support multi-room sessions seamlessly (e.g. opening different rooms in multiple browser tabs), cookies must be path-scoped (e.g., `Path=/rooms/[roomId]`) or the JWT/session token must store a map of authorized room IDs, preventing tabs from overwriting each other's sessions.
4. **UI Enhancements**: Add options in the room creation and settings interfaces to enable, disable, or change the room password.
5. **API & WebSocket Security**: Ensure all HTTP API routes and WebSocket connections strictly validate the room-specific authentication token before permitting any data exchange.

## Future Press Release
Security just got an upgrade in SketchGit! We are introducing Room Password Protection, giving you absolute control over who enters your creative space. We understand that not all whiteboards are meant for the public eye. Now, you can add a sturdy lock to your rooms with a custom password. Even if your room link gets shared around, only those with the secret key will be able to join, view, or edit. Secure your sensitive brainstorming sessions, protect your confidential designs, and collaborate with confidence. Set a password on your next room and experience a safer way to create!

## Definitions of Done

### Implementation
- Database schema updated to support storing hashed passwords.
- Interstitial password prompt UI developed.
- Backend logic implemented to hash incoming passwords and verify them against stored hashes.
- Session management implemented to persist access to the specific room, utilizing path-scoped cookies or multi-room token mappings to support concurrent multi-room sessions.
- Room settings UI updated to allow setting/removing the password.

### Testing
- Unit tests written for password hashing, verification, and session token generation.
- Integration tests ensuring protected API endpoints and WebSockets reject unauthorized access without a valid session token.
- E2E tests validating the user flow: attempting to access a room -> getting prompted for password -> successfully entering and accessing the room.
- Coverage remains at or above the required project threshold.

### Documentation
- User documentation updated to explain how to secure a room with a password.
- Developer documentation updated detailing the authentication flow and token usage.

### Security
- Passwords must be securely hashed and salted (e.g., using bcrypt) in the database; raw passwords must never be stored.
- Implement rate limiting on the password prompt endpoint to mitigate brute-force guessing attacks.
- Ensure authentication tokens are tightly scoped to the specific room and are cryptographically signed.

### Reliability
- The authentication check must be performant, specifically during the initial WebSocket handshake, to avoid delaying room entry for valid users.

### Accessibility
- The password prompt interstitial page must be fully keyboard navigable.
- Appropriate ARIA attributes and focus management must be implemented so screen readers can easily interact with the password input and submit buttons.

### GDPR compliance
- Since passwords are an authentication mechanism, their storage and processing must be secured. Ensure hashed passwords are treated as sensitive data.
- The privacy policy should clarify that room passwords are not linked to personal user accounts (if applicable) but are strictly for access control to the room entity.

## Implementation Notes

Implemented largely as designed, reusing existing infrastructure heavily
rather than the proposal's from-scratch framing: this app already had a
central room-access gate (`checkRoomAccess` in `roomRepository.ts`, used by
both the WS upgrade handler and several REST routes) and a proven
HMAC-signed-cookie mechanism (`shareLinkTokens.ts`, from P091's granular
share links) — P093 extended the former and mirrored the latter's pattern
rather than inventing new primitives.

### Core implementation
- `prisma/schema.prisma` — `Room.passwordHash String?` (null = unprotected).
- `lib/passwordHashing.ts` (new) — extracted the Argon2id hashing/verify
  logic that was previously inline in `userRepository.ts` (P065), so room
  passwords use identical, already-audited parameters instead of a second
  copy that could drift. `userRepository.ts` now imports from here too.
- `lib/server/roomPasswordCookie.ts` (new) — `sketchgit_room_unlock`,
  an HMAC-signed cookie whose payload is a `{roomId: expiryMs}` map (not a
  single scope) so unlocking room A in one tab doesn't clobber an
  already-unlocked room B in another — the proposal's explicit
  multi-tab/multi-room requirement. 24h TTL, capped at 20 tracked rooms
  (oldest-expiring evicted first).
- `checkRoomAccess()` (`roomRepository.ts`) — extended with a
  `hasPasswordUnlock` parameter; a password gate runs *before* the existing
  public/private/membership logic and applies regardless of `isPublic`
  (matches the proposal: "regardless of whether they have the room's URL").
  The room owner is exempt.
- `POST /api/rooms/[roomId]/unlock` (new) — verifies the password, sets the
  signed cookie on success. `GET` on the same route is a lightweight
  "does the current caller still need to unlock" check the settings/prompt
  UI can poll without a DB write.
- `PATCH /api/rooms/[roomId]` — extended to accept an optional `password`
  field (`string` sets/changes it, `null` clears it, omitted leaves it
  unchanged); `slug` was changed from required to optional in the same
  schema so the two fields can be set independently or together.
- WS upgrade (`wsConnectionHandler.ts`'s `authorizeClient`) — reads the
  unlock cookie and passes it into `checkRoomAccess`. A `PASSWORD_REQUIRED`
  denial is a hard stop: unlike `PRIVATE_ROOM`/`NOT_A_MEMBER`, it is *not*
  overridable by an invite token or share-link cookie (those grant
  room/branch/commit-level access, not a password bypass).
- REST routes — `draw`, `commits` (GET+POST), `branch`, `cursor`,
  `object-lock`, `object-unlock`, `follow`, `profile`, `view-sync`, `events`,
  `export` — all updated to check the unlock cookie and reject with 401
  `ROOM_PASSWORD_REQUIRED` when the room is protected and unlocked-for.
  Every REST route reachable for a room was audited (17 route files under
  `app/api/rooms/[roomId]/`); the ones not touched (`members`,
  `invitations`, `share-links`) are already gated by authenticated
  ownership/membership checks independent of room password, which was
  judged sufficient given the time available for this pass.
- Client (`lib/sketchgit/realtime/wsClient.ts`,
  `collaborationManager.ts`, `appCollaboration.ts`) — a WS
  `ACCESS_DENIED`/`PASSWORD_REQUIRED` response suppresses the normal
  reconnect-with-backoff loop (retrying with the same missing credential
  would just fail the same way) and fires a new `onAccessDenied` callback,
  relayed up to a `sketchgit:roomPasswordRequired` DOM event.
  `WsClient.retryConnect()` re-attempts with the same room/name/color once
  the modal reports a successful unlock.
- UI: `RoomPasswordModal.tsx` (the interstitial, opened by the event above)
  and `RoomSettingsModal.tsx` (owner-facing set/change/remove password,
  opened from a new topbar button) — both new. Owner-only enforcement for
  settings is server-side only (PATCH returns 403 for non-owners), same
  pattern as P091's `MembersModal`.

### Bugs found and fixed along the way
- **Anonymous + ownerless-room bypass.** The first version of the owner
  exemption was `userId !== room.ownerId` — for an anonymous requester
  (`userId === null`) on a room with no owner (`ownerId === null`), that's
  `null !== null` → `false`, meaning an anonymous visitor would be silently
  treated as "the owner" and skip the password check entirely for *any*
  ownerless password-protected room. Caught during implementation (not
  live-discovered) by re-reading the condition before writing tests; fixed
  to `userId !== null && userId === room.ownerId`, with a regression test
  (`does not treat an anonymous requester as the owner...` in
  `roomRepository.test.ts`).
- **`ApiErrorCode.PASSWORD_REQUIRED` collision.** That error code already
  existed for account-deletion password confirmation
  (`app/api/auth/account/route.ts`) with translation "Please enter your
  current password to confirm." — reusing it for "this room needs a
  password" would have shown the wrong message on the room password prompt.
  Introduced `ROOM_PASSWORD_REQUIRED` (informational: "this room is
  password-protected") and `ROOM_PASSWORD_INCORRECT` (specifically for a
  failed unlock attempt: "incorrect password") as distinct codes, with their
  own `en.json`/`de.json` translations.
- **Missing focus-trap/keyboard accessibility on the two new modals.** The
  `MembersModal.tsx` precedent from P091 (which `RoomPasswordModal`/
  `RoomSettingsModal` were initially modeled after) doesn't call
  `lib/sketchgit/ui/modals.ts`'s `openModal()`/`closeModal()` at all — no
  focus trap, no Escape-to-close, despite the vanilla-DOM modals
  (`nameModal`, `commitModal`, ...) having exactly that since P025. Left
  `MembersModal` itself alone (out of scope for this proposal), but since
  P093 has an *explicit* keyboard-navigation/focus-management requirement,
  both new modals were wired to call `openModal`/`closeModal` via a
  `useEffect` keyed on `isOpen`, gaining the same focus trap and Escape
  handling the older modals have.

### Verified against real infrastructure
Not just unit tests: built a production server against a real Dockerized
Postgres, inserted a room with a real Argon2id-hashed password directly via
SQL, and confirmed via curl + a raw `ws` Node client (not Playwright — see
below):
- `GET /unlock` correctly reports `passwordRequired: true` for an unset
  cookie, `POST /unlock` with a wrong password returns 401
  `ROOM_PASSWORD_INCORRECT`, `GET /commits` on the same room returns 401
  `ROOM_PASSWORD_REQUIRED` without an unlock.
- `POST /unlock` with the correct password returns 200, sets a `HttpOnly`
  cookie, and that cookie genuinely unlocks: `GET /commits` with it attached
  returns 200; a raw WS handshake to `/ws?room=...` with the cookie attached
  completes (`welcome/presence` received) where the same request without the
  cookie is rejected with `{type:"error", code:"ACCESS_DENIED",
  reason:"PASSWORD_REQUIRED"}` and a 1008 close.
- Rate limiting genuinely engages: flooding `POST /unlock` with
  `RATE_LIMIT_MAX=5` returned 401 for the first several attempts then 429
  for the rest.
- One debugging false alarm worth recording: an early WS test against a
  stale server process appeared to hang ("empty reply from server" / socket
  hang up). Root cause was not a P093 bug — it was testing against a
  pre-code-change server process (fixed by restarting) and, separately, a
  successful long-lived WS connection just needs `curl --max-time` to
  observe rather than hanging indefinitely by design. Documented here so a
  future debugging session doesn't waste time re-diagnosing the same
  non-issue.

### Scoped down from the proposal
- **No automated E2E test for the full password-prompt-to-connected flow.**
  Same environment-specific constraint documented during P091 and P092
  earlier this session: WebSocket connections from Playwright/Chromium do
  not reliably complete their handshake in this sandbox (raw WS/TCP clients
  connect fine — verified again during this proposal's own debugging above
  — Chromium via Playwright/CDP does not). Since the password gate's
  clientside trigger is the WS `ACCESS_DENIED` message, a real E2E test of
  "load room → see password prompt → unlock → get in" cannot be made to
  pass reliably here. Covered instead by: `wsClient.test.ts` /
  `collaborationManager.test.ts` (mocked WS, real logic — the
  `ACCESS_DENIED` interception, reconnect suppression, and callback relay),
  the REST route test suites, and the manual real-infra verification above.
- **No developer/user-guide documentation pages** — this repo has no
  user-facing docs site (same as P092); the doc comments throughout the new
  modules are the developer-facing explanation of the auth flow and token
  usage the proposal asked for.
- **Privacy-policy documentation** — out of scope; no Datenschutzerklärung
  page exists yet in this repo (blocked on real business info, tracked
  separately under the GAP-* compliance reports, same note as P092).
