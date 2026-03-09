# P007 – Implement Authentication & Authorization

## Title
Implement Authentication & Authorization (Anonymous-first with Optional Account Upgrade)

## Brief Summary
Currently, anyone who knows a room URL can join it with an arbitrary name, see all content, and make unrestricted changes. There is no user identity, no access control, and no room ownership. This proposal implements an **anonymous-first model** where visitors can use the tool immediately without any sign-up friction, while also offering optional account registration for users who want persistent identity, a personal collection of saved drawings, and fine-grained permission control over their rooms.

## Authentication Strategy: Option C – Anonymous Sessions with Optional Account Upgrade

This is the chosen approach. It preserves the low-friction "open the app and start drawing" experience while adding a clear upgrade path for users who want more:

| User type | How they interact |
|-----------|------------------|
| **Anonymous** | Opens the app, picks a display name, starts drawing immediately. No email, no password. Session tied to browser. |
| **Registered** | Creates an account (email + password, or OAuth). Gets a persistent identity, a personal collection, and ownership features. |

Both user types can collaborate in the same room. Registered users have additional management capabilities that anonymous users do not.

## Current Situation
Room access is controlled solely by URL knowledge:
- A room is created or joined by adding `?room=<id>` to the URL.
- Room IDs are short, user-chosen strings with minimal validation.
- Users choose their own display name, which is not verified or unique.
- Any connected user can perform any action: commit, merge, rollback, or overwrite state.
- The server sanitizes room IDs and display names but performs no access control checks.

There is no concept of:
- A registered user account.
- A room owner or administrator.
- Read-only vs. read-write access.
- Private vs. public rooms.
- A personal collection of past drawings.

## Problem with Current Situation
- **Uncontrolled access**: Guessing or discovering a room ID gives full destructive access, including the ability to roll back or wipe all committed history.
- **Impersonation**: Any user can claim any display name, including the names of legitimate collaborators.
- **No persistence of identity**: Anonymous users cannot return to "their" rooms across sessions.
- **No collection management**: Users have no way to organize or protect their saved drawings.
- **No audit trail**: There is no record of who made which changes.
- **Accidental collisions**: Short, memorable room IDs can collide between unrelated groups.

## Goal to Achieve
1. Allow anonymous users to work freely with zero friction (preserve current UX).
2. Offer a clear, low-pressure path for anonymous users to create an account.
3. Give registered users a personal collection of rooms and drawings.
4. Give registered users permission management for rooms they own.
5. Prevent impersonation for authenticated users.
6. Enable future advanced features (sharing permissions, revision history by author, notifications).

## What Needs to Be Done

### 1. Anonymous user flow (preserve and improve)

Anonymous users work exactly as today, with two improvements:

**a) Ephemeral session token**
When an anonymous user first visits, the server issues a short-lived signed session token stored in a `httpOnly` cookie (or `localStorage` as a fallback):
- Token encodes a randomly generated `anonymousId` (not tied to any DB record).
- Token is refreshed on each visit (rolling expiry, e.g., 30 days).
- Allows the server to recognize "this is the same browser" for soft continuity (e.g., auto-rejoin their last room).

**b) Cryptographically secure room IDs**
Replace user-chosen room IDs with server-generated 16-byte base64url strings (`crypto.randomUUID()` or `crypto.randomBytes(16).toString('base64url')`):
- Eliminates accidental room collisions.
- Makes enumeration attacks computationally infeasible.
- Anonymous users receive the room URL after creation; they share it manually.

### 2. Account registration and login

Provide a lightweight sign-up / sign-in flow accessible from a button in the topbar ("Sign In / Create Account"):

**Registration fields:**
- Display name (pre-filled from anonymous session if available)
- Email address
- Password (minimum 12 characters; hashed with `bcrypt` or `argon2`)

**Alternative: OAuth login** (thematically appropriate for a Git app):
- GitHub OAuth
- Google OAuth
- Enables account creation without password management on the app side

**Sign-in:**
- Email + password, or OAuth provider redirect.
- On success: server issues a signed JWT (or server-side session) stored in an `httpOnly` cookie.
- JWT payload: `{ userId, displayName, role: 'user' }`, short expiry (15 min) with a refresh token (7 days, rotated on use).

**Anonymous → Registered migration:**
When an anonymous user registers:
- Their `anonymousId` session is linked to the new `User` record.
- Any rooms they created anonymously are optionally transferred to their account (prompted during registration).
- The anonymous cookie is replaced with an authenticated one.
- No work is lost.

### 3. Room-scoped authorization roles

Define three roles per room, stored in the `RoomMembership` table (see P003 Prisma schema):

| Role | Permissions |
|------|-------------|
| **OWNER** | All actions; change member roles; delete room; make room private/public; transfer ownership |
| **EDITOR** | Draw, commit, branch, merge (all content actions); cannot manage members |
| **VIEWER** | Read-only; see canvas and history; cannot draw or commit |

**Default access rules:**
- Public rooms: any visitor (including anonymous) gets `EDITOR` access automatically.
- Private rooms: only explicitly invited members can join.
- Room creator: automatically assigned `OWNER` role (if registered) or full access (if anonymous, until claimed).

### 4. Collection management for registered users

Registered users get a **"My Drawings"** dashboard page (`/dashboard`):

**Features:**
- List all rooms the user owns or is a member of.
- Rename rooms (set a human-friendly `slug` or title).
- See room metadata: created date, last commit date, number of commits, member count.
- Delete rooms they own.
- Mark rooms as public or private.
- Duplicate a room (creates a new room with the same commit history).
- Pin favourite rooms to the top of the list.

**UI location:** New `/dashboard` route in the Next.js App Router. Accessible after sign-in via a profile icon in the topbar.

### 5. Permission management for room owners

Room owners can manage who has access to their rooms from a settings panel within the canvas view:

**"Share & Permissions" panel:**
- Toggle room between public (anyone with link can edit) and private (invite-only).
- For private rooms: show an invite link with a one-time token or a persistent share link per role.
- Invite by email: send an email invitation to a specific address (requires a transactional email service, e.g., Resend or SendGrid).
- View current members with their roles.
- Change a member's role (EDITOR ↔ VIEWER).
- Remove a member from the room.
- Transfer ownership to another member.

**Enforcement on the server:**
The server checks the `RoomMembership` table before relaying any write action (`commit`, `rollback`, `merge`, `branch`). Anonymous visitors of a private room are rejected at WebSocket upgrade time.

### 6. Session management

| User type | Session mechanism |
|-----------|------------------|
| Anonymous | Signed `httpOnly` cookie with `anonymousId`; 30-day rolling expiry |
| Registered | Short-lived JWT (15 min) + refresh token (7 days) in `httpOnly` cookies; or server-side session in DB |

Use Next.js middleware (`middleware.ts`) to:
- Read and verify the session cookie on every request.
- Populate `request.user` for server components and API routes.
- Redirect unauthenticated requests to `/login` for protected routes (`/dashboard`, private room URLs).

**Library recommendation:** **NextAuth.js (Auth.js)** – integrates natively with the Next.js App Router, handles credentials provider (email + password), OAuth providers (GitHub, Google), and session management (JWT or database sessions). Pairs well with Prisma via the official `@auth/prisma-adapter`.

### 7. Server-side authorization enforcement

In `server.mjs`, check permissions before relaying messages:

```javascript
// On WebSocket upgrade
server.on('upgrade', async (req, socket, head) => {
  const session = await resolveSession(req);  // verifies cookie/token
  const room = await getRoomById(roomId);

  if (room.isPublic === false && !session?.userId) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  // Attach session to the WebSocket connection for per-message checks
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.session = session;
    wss.emit('connection', ws, req);
  });
});

// On each message
function handleMessage(client, data) {
  if (isWriteAction(data.type)) {
    const role = await getEffectiveRole(client.session, data.roomId);
    if (role === 'VIEWER') {
      sendError(client, 'insufficient_permissions');
      return;
    }
  }
  // ... relay message
}
```

### 8. Rate limiting

Add per-IP rate limits using a middleware library (e.g., `express-rate-limit` or a custom token-bucket implementation for the Node.js `http` server):

| Endpoint | Limit |
|----------|-------|
| Account registration | 5 per IP per hour |
| Sign-in attempts | 10 per IP per 15 minutes |
| Room creation | 10 per user per day |
| WebSocket messages | 200 per connection per minute |

### 9. Update the client UI

**Topbar additions:**
- **Anonymous**: "Sign In" button in the topbar header.
- **Registered**: Avatar with dropdown (My Drawings, Settings, Sign Out).
- **Room settings** button (gear icon) for owners: opens the "Share & Permissions" panel.
- Role badge next to the user's name in the presence list.

**"Sign In / Register" modal:**
- Tab switcher: "Sign In" | "Create Account".
- OAuth buttons (GitHub, Google) above the form.
- Email + password fields below.
- "Continue as guest" link to dismiss and stay anonymous.

**Upgrade prompt:**
- After an anonymous user makes their first commit, show a soft prompt: "Create an account to keep your drawing and come back to it later." (dismissible, not blocking).

**Disabled-state enforcement:**
- Write actions (commit button, merge button, draw tools) are greyed out and show a tooltip for VIEWER-role users.
- The topbar shows a "View only" badge for viewers.

## What Components Are Affected
| Component | Impact |
|-----------|--------|
| `server.mjs` | Session resolution on WebSocket upgrade; role-based message authorization; rate limiting |
| `lib/db/userRepository.ts` (from P003) | `createUser`, `findUserByEmail`, `createSession`, `validateSession` |
| `lib/db/roomRepository.ts` (from P003) | `getRoomMembership`, `upsertMembership`, `setRoomVisibility` |
| `prisma/schema.prisma` (from P003) | `User`, `Session`, `RoomMembership`, `MemberRole` models already defined |
| New `app/dashboard/page.tsx` | "My Drawings" collection dashboard |
| New `app/auth/` | Sign-in and registration pages (or NextAuth.js route handler) |
| New `middleware.ts` | Session verification and protected route handling |
| `components/SketchGitApp.tsx` | Auth state awareness; "Sign In" button; role-based UI |
| `components/sketchgit/AppTopbar.tsx` | Avatar/profile dropdown; room settings button; role badge |
| `package.json` | Add `next-auth` (Auth.js), `@auth/prisma-adapter`, `bcrypt` or `argon2`, `@types/bcrypt` |

## Additional Considerations

### NextAuth.js (Auth.js) integration

Auth.js is the recommended library for this proposal. Configuration highlights:
- Use the `credentials` provider for email + password sign-in.
- Use the `github` and `google` providers for OAuth.
- Use `@auth/prisma-adapter` to persist sessions and users in the PostgreSQL database (P003).
- Enable JWT sessions for stateless API routes, database sessions for richer session data.

### Anonymous → registered migration UX

The migration step must be seamless. When the user clicks "Create Account" after working anonymously:
1. Show a form pre-filled with their current display name.
2. On account creation, transfer room ownership in a single DB transaction.
3. Issue an authenticated session cookie, invalidate the anonymous one.
4. Redirect back to the canvas they were working on.

No data loss, no confusion.

### Password security

Use `argon2` (preferred) or `bcrypt` for password hashing. Never store plain-text passwords. Enforce a minimum password length of 12 characters and check against the HaveIBeenPwned API (or a locally stored hash set) for common/breached passwords.

### Public rooms and anonymous editors

The default behaviour (public rooms, all visitors can draw and commit) is preserved exactly. Registered users in a public room have the same edit access as anonymous users unless they have been explicitly assigned a different role by the room owner.

### Future advanced features enabled by this foundation

| Feature | Enabled by |
|---------|------------|
| Author attribution on commits | `authorId` field in `Commit` model (P003 schema) |
| Email notifications (new commit in watched room) | `User.email` + transactional email service |
| Room analytics (view counts, active sessions) | Session + membership tables |
| Revision history by author | `Commit.authorId` → `User` relation |
| Paid plans / usage limits | `User` model extensible with `plan` field |
| Team workspaces | New `Organization` model referencing `User` |

### Relationship to other proposals
- **P003 (Persistence)**: All auth-related tables (`User`, `Session`, `RoomMembership`) are already defined in the P003 Prisma schema, making this proposal a natural extension rather than a separate database setup effort.
- **P010 (Observability)**: Authentication failures and role violations should be logged for monitoring and abuse detection.
