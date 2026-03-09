# P007 – Implement Authentication & Authorization

## Title
Implement Authentication & Authorization

## Brief Summary
Currently, anyone who knows a room URL can join it with an arbitrary name, see all content, and make unrestricted changes including committing, rolling back history, and merging branches. There is no user identity, no access control, and no room ownership. Adding lightweight authentication and room-level authorization will protect users' work from unauthorized access and malicious interference.

## Current Situation
Room access is controlled solely by URL knowledge:
- A room is created or joined by adding `?room=<id>` to the URL.
- Room IDs are short, user-chosen strings with minimal length/character validation.
- Users choose their own display name, which is not verified or unique.
- Any connected user can perform any action: commit, merge, rollback, or overwrite state.
- The server sanitizes room IDs and display names for length/character safety, but performs no access control checks.

There is no concept of:
- A registered user account.
- A room owner or administrator.
- Read-only vs. read-write access.
- Private vs. public rooms.
- Session persistence (logging in).

## Problem with Current Situation
- **Uncontrolled access**: Guessing or discovering a room ID gives full destructive access, including the ability to roll back or wipe all committed history.
- **Impersonation**: Any user can claim any display name, including the names of legitimate collaborators.
- **No audit trail**: There is no record of who made which changes, making accountability impossible.
- **Accidental collisions**: Short, memorable room IDs can collide between unrelated groups, exposing one group's work to another.
- **Denial of service**: A malicious actor can join any room and spam commits, rollbacks, or massive canvas updates, degrading the experience for legitimate users.

## Goal to Achieve
1. Ensure that only intended participants can access a room.
2. Give room creators control over who can join and what they can do.
3. Prevent impersonation by tying display names to authenticated sessions.
4. Create an audit trail of who performed which actions.
5. Support the common use case (quick sharing with a link) while adding opt-in security for sensitive rooms.

## What Needs to Be Done

### 1. Choose an authentication strategy

#### Option A – Magic link / invite-only rooms (recommended as first step)
- Room creator receives a secret invite token when creating a room.
- The invite URL contains the token: `?room=<id>&token=<secret>`.
- The server validates the token before allowing a WebSocket upgrade.
- **Pros**: No accounts needed; simple to implement; preserves the "share a link" UX.
- **Cons**: Token can be forwarded unintentionally; no per-user identity.

#### Option B – OAuth / Social login
- Integrate with GitHub OAuth (thematically appropriate for a Git-themed app), Google, or similar.
- Users authenticate with an existing account; their identity is verified.
- **Pros**: Strong identity; no password management; works well for persistent teams.
- **Cons**: Requires OAuth app registration; more complex setup; privacy concern for casual users.

#### Option C – Anonymous sessions with optional upgrade
- Allow anonymous use (current behaviour) for public rooms.
- Offer optional account creation for private rooms and persistent identity.
- **Pros**: Preserves low-friction onboarding; incremental adoption.
- **Cons**: Two code paths to maintain.

**Recommended path**: Implement Option A (invite tokens) first for minimal disruption, then add Option B for persistent identity.

### 2. Implement room-scoped authorization roles
Define three roles for each room:

| Role | Permissions |
|------|-------------|
| **Owner** | All actions; invite/remove members; delete room |
| **Editor** | Draw, commit, branch, merge (all content actions) |
| **Viewer** | Read-only; see canvas and history; no write actions |

Store room membership and roles in the database (requires P003).

### 3. Validate tokens on WebSocket upgrade (server-side)
In `server.mjs`, intercept the HTTP upgrade request before establishing the WebSocket:
```javascript
server.on('upgrade', (req, socket, head) => {
  const token = new URL(req.url, 'http://x').searchParams.get('token');
  if (!isValidToken(req, token)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});
```

### 4. Generate cryptographically secure room IDs and invite tokens
Replace the current user-chosen room ID with:
- A server-generated, URL-safe, cryptographically random 16-byte ID (base64url encoded = 22 characters).
- A separate shorter "human-friendly" alias (optional, chosen by the owner) that maps to the random ID.
- A distinct invite token (32 bytes, base64url) separate from the room ID.

Use `crypto.randomBytes()` (Node.js built-in), not `Math.random()`.

### 5. Enforce authorization on all destructive server-side actions
Before relaying a `commit`, `rollback`, `merge`, or `fullsync` message, verify that the sender's role permits the action:
```javascript
if (action === 'rollback' && client.role !== 'owner' && client.role !== 'editor') {
  sendError(client, 'insufficient_permissions');
  return;
}
```

### 6. Add session persistence
Issue a signed session cookie or JWT to authenticated users so they do not need to re-authenticate on every page load. Use `jsonwebtoken` (or the Web Crypto API for zero-dependency signing) with a short expiry and refresh token rotation.

### 7. Display name binding
After authentication, display names are derived from the authenticated identity (OAuth profile name or a name chosen at account creation) rather than being freely enterable. This prevents impersonation.

### 8. Rate limiting
Add per-IP and per-room rate limits on:
- Room creation
- WebSocket messages (messages per second)
- Join attempts (brute-force prevention for token guessing)

### 9. Update the client UI
- Add a "Share" button that shows the invite URL (with token).
- Show a user list with roles (owner icon, editor icon, viewer icon).
- Grey out write actions when the current user is a viewer.
- Display a "Join request" flow for private rooms if the token is missing.

## What Components Are Affected
| Component | Impact |
|-----------|--------|
| `server.mjs` | Token validation on upgrade; role-based message authorization; rate limiting |
| New `lib/auth/` | Token generation, session management, role definitions |
| `components/SketchGitApp.tsx` | Share button, role-aware UI, join flow |
| `components/sketchgit/AppTopbar.tsx` | Disable/enable write actions based on role |
| WebSocket message protocol | Add `auth` message type; role field in `welcome` message |
| Database (P003) | `rooms`, `room_members`, `tokens` tables |
| `package.json` | Add `jsonwebtoken` or equivalent |

## Additional Considerations

### Incremental rollout
The most impactful, lowest-effort first step is switching from user-chosen room IDs to server-generated cryptographically random IDs. This alone dramatically reduces the chance of accidental room collisions and enumeration attacks, with minimal code changes.

### Privacy
If OAuth is used, the minimum required scopes should be requested (email or profile only, no repository access). Display names should be user-configurable rather than directly exposing OAuth profile names.

### Relationship to other proposals
- **P003 (persistence)**: Room membership, roles, and tokens must be persisted across server restarts.
- **P010 (observability)**: Authentication failures and unauthorized access attempts should be logged for monitoring.
