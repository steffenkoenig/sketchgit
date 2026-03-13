# P091 – Granular Share Links: Room, Branch, and Commit Sharing with Role-Based Permissions

## Status
Not Started

## Dimensions
Security · Collaboration · Usability

## Problem

The current room-sharing model in SketchGit is coarse-grained:

| Scenario | Current Limitation |
|----------|--------------------|
| Share only a specific branch with a collaborator | Impossible — invitation tokens (P066) always grant room-wide access |
| Give someone read-only access to a single commit snapshot | Impossible — no commit-level sharing; even viewers can browse all branches |
| Grant write access without admin privileges | Partly possible (EDITOR role) but EDITOR already allows branch creation — there is no "write-only-no-branch-creation" tier |
| Allow a contractor to draw on one branch but not access others | Impossible — room membership is all-or-nothing |
| Give a client a permalink to a specific commit to review | Impossible — commit URLs require room membership to load |
| Revoke access to a single shared link without affecting other collaborators | Impossible — invitation revocation (`DELETE /api/rooms/[roomId]/invitations`) revokes **all** invitations for the room |

The existing `RoomInvitation` model (P066) provides time-limited, signed access
tokens, but only at the room scope and always maps to the EDITOR role. It does not
support:
- Branch-scoped access (access limited to one or more named branches).
- Commit-scoped access (read-only view of a single commit snapshot).
- Permission granularity beyond the coarse OWNER / EDITOR / VIEWER enum.
- Per-link revocation (only bulk revocation is available).
- Human-readable labels on links (to distinguish "link shared with Alice" from "link shared in Slack").

### Relevant files
```
prisma/schema.prisma                                  ← RoomInvitation model, MemberRole enum
lib/db/roomRepository.ts                              ← checkRoomAccess(), createRoomInvitation(), consumeInvitationToken()
lib/server/invitationTokens.ts                        ← HMAC signing helpers
app/api/rooms/[roomId]/invitations/route.ts           ← POST/DELETE invitation endpoints
app/api/invitations/[token]/route.ts                  ← GET token validation/redirect
server.ts                                             ← WebSocket upgrade access control + per-client role storage
lib/sketchgit/realtime/collaborationManager.ts        ← roomInviteLink() helper
lib/sketchgit/types.ts                                ← WsMessageType, PresenceClient
lib/api/errors.ts                                     ← ApiErrorCode
```

## Proposed Solution

Replace the `RoomInvitation` model with a more capable **`ShareLink`** model that
supports three sharing scopes (room, branch, commit) and four permission levels
(admin, write, branch-create, view). Extend the WebSocket session state to carry
scoped-access metadata so that branch and commit restrictions can be enforced at
the message-handling layer.

The existing P066 `RoomInvitation` table and endpoints are **deprecated** by this
proposal. A migration will copy active, unexpired invitations into `ShareLink`
records and drop the old table.

---

### 1. Data model

#### 1a. New Prisma enums and `ShareLink` model

Add to `prisma/schema.prisma`:

```prisma
// ─── Granular share links (P091) ──────────────────────────────────────────────

enum ShareScope {
  ROOM    // Grants access to the entire room (all branches and commits)
  BRANCH  // Grants access to one or more named branches only
  COMMIT  // Grants read-only access to a single commit snapshot
}

enum SharePermission {
  ADMIN          // Administer room: manage members, room settings, delete room
  WRITE          // Draw on canvas and create commits (but NOT create new branches)
  BRANCH_CREATE  // Draw, commit, AND create new branches (equivalent to current EDITOR)
  VIEW           // Read-only: browse commits/branches, fullsync, no writes
}

model ShareLink {
  id          String          @id @default(cuid())
  /// 32-byte cryptographically random token, hex-encoded (64 chars)
  token       String          @unique
  roomId      String
  /// Optional human-readable label to distinguish multiple links
  label       String?
  scope       ShareScope      @default(ROOM)
  /// Populated for BRANCH scope: names of branches the recipient may access
  branches    String[]        @default([])
  /// Populated for COMMIT scope: SHA of the accessible commit
  commitSha   String?
  permission  SharePermission @default(VIEW)
  createdBy   String?
  /// null = never expires
  expiresAt   DateTime?
  /// null = unlimited uses
  maxUses     Int?
  useCount    Int             @default(0)
  createdAt   DateTime        @default(now())

  room    Room  @relation(fields: [roomId], references: [id], onDelete: Cascade)
  creator User? @relation("ShareLinkCreator", fields: [createdBy], references: [id], onDelete: SetNull)

  @@index([roomId])
  @@index([expiresAt])
  @@index([commitSha])
}
```

Add the relation to `Room`:

```prisma
model Room {
  // …existing fields…
  shareLinks ShareLink[]
}
```

Add the relation to `User`:

```prisma
model User {
  // …existing fields…
  createdShareLinks ShareLink[] @relation("ShareLinkCreator")
}
```

#### 1b. Permission-to-role mapping

The new `SharePermission` enum maps onto the existing `MemberRole` enum (and the
extended `ClientRole` type in `roomRepository.ts`) as follows:

| SharePermission | Effective ClientRole | Can draw/commit | Can create branch | Can manage members |
|-----------------|----------------------|-----------------|-------------------|--------------------|
| `ADMIN`         | `OWNER`              | ✅               | ✅                 | ✅                  |
| `BRANCH_CREATE` | `EDITOR`             | ✅               | ✅                 | ❌                  |
| `WRITE`         | `COMMITTER` (new)    | ✅               | ❌                 | ❌                  |
| `VIEW`          | `VIEWER`             | ❌               | ❌                 | ❌                  |

> **New role**: `COMMITTER` must be added to the `MemberRole` enum in the Prisma
> schema and to the `ClientRole` union in `roomRepository.ts`. It represents a
> user who can draw and commit but cannot create branches.

Updated `MemberRole` enum:

```prisma
enum MemberRole {
  OWNER      // Full admin: draw, commit, branch, manage members, delete room
  EDITOR     // Draw, commit, and create branches; no admin
  COMMITTER  // Draw and commit only; no branch creation, no admin (NEW)
  VIEWER     // Read-only
}
```

---

### 2. Cryptographic helpers (`lib/server/shareLinkTokens.ts`)

Create a new file analogous to `lib/server/invitationTokens.ts`:

```typescript
/**
 * lib/server/shareLinkTokens.ts
 *
 * P091 – Cryptographic helpers for granular share-link tokens.
 *
 * Strategy mirrors P066 invitationTokens.ts:
 *   • Token stored in DB = 32 random bytes hex-encoded (64 chars), unguessable.
 *   • URL embeds an HMAC-SHA256 over (token:roomId:scope:expiresAt) to allow
 *     cheap server-side tampering detection before the DB lookup.
 *
 * Secret: SHARE_LINK_SECRET env var, falling back to INVITATION_SECRET → AUTH_SECRET.
 *
 * Note: `node:` import prefix is the established convention in this codebase
 * (see lib/server/invitationTokens.ts) and requires Node.js ≥ 14.18.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

function getSecret(): string {
  const s = process.env.SHARE_LINK_SECRET
    ?? process.env.INVITATION_SECRET
    ?? process.env.AUTH_SECRET;
  if (!s) throw new Error('No secret configured for share-link signing');
  return s;
}

export function generateShareLinkToken(): string {
  return randomBytes(32).toString('hex');
}

export function signShareLinkToken(
  token: string,
  roomId: string,
  scope: string,
  expiresAt: number | null,
): string {
  return createHmac('sha256', getSecret())
    .update(`${token}:${roomId}:${scope}:${expiresAt ?? 'never'}`)
    .digest('hex');
}

export function verifyShareLinkSignature(
  token: string,
  roomId: string,
  scope: string,
  expiresAt: number | null,
  signature: string,
): boolean {
  const expected = signShareLinkToken(token, roomId, scope, expiresAt);
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```

Add `SHARE_LINK_SECRET` to `lib/env.ts`:

```typescript
// ── Share-link token secret (P091) ────────────────────────────────────────────
SHARE_LINK_SECRET: z.string().min(32).optional(),
```

Add a commented example to `.env.example`:

```
# SHARE_LINK_SECRET=<at-least-32-random-characters>  # defaults to INVITATION_SECRET → AUTH_SECRET
```

---

### 3. Repository functions (`lib/db/roomRepository.ts`)

Add the following functions (parallel to the P066 invitation functions):

```typescript
import { ShareScope, SharePermission } from '@prisma/client';

// ─── Share links (P091) ───────────────────────────────────────────────────────

export async function createShareLink(data: {
  token: string;
  roomId: string;
  createdBy: string | null;
  label?: string;
  scope: ShareScope;
  branches?: string[];
  commitSha?: string;
  permission: SharePermission;
  expiresAt: Date | null;
  maxUses: number | null;
}): Promise<{ id: string }> {
  return prisma.shareLink.create({
    data,
    select: { id: true },
  });
}

export async function getShareLinkByToken(token: string): Promise<{
  id: string;
  roomId: string;
  scope: ShareScope;
  branches: string[];
  commitSha: string | null;
  permission: SharePermission;
  expiresAt: Date | null;
  maxUses: number | null;
  useCount: number;
  room: { isPublic: boolean };
} | null> {
  return prisma.shareLink.findUnique({
    where: { token },
    select: {
      id: true,
      roomId: true,
      scope: true,
      branches: true,
      commitSha: true,
      permission: true,
      expiresAt: true,
      maxUses: true,
      useCount: true,
      room: { select: { isPublic: true } },
    },
  });
}

export async function consumeShareLink(
  token: string,
  maxUses: number,
): Promise<boolean> {
  const result = await prisma.shareLink.updateMany({
    where: { token, useCount: { lt: maxUses } },
    data: { useCount: { increment: 1 } },
  });
  return result.count > 0;
}

export async function listShareLinks(roomId: string): Promise<Array<{
  id: string;
  label: string | null;
  scope: ShareScope;
  branches: string[];
  commitSha: string | null;
  permission: SharePermission;
  expiresAt: Date | null;
  maxUses: number | null;
  useCount: number;
  createdAt: Date;
  createdBy: string | null;
}>> {
  return prisma.shareLink.findMany({
    where: { roomId },
    select: {
      id: true, label: true, scope: true, branches: true, commitSha: true,
      permission: true, expiresAt: true, maxUses: true, useCount: true,
      createdAt: true, createdBy: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeShareLink(id: string, roomId: string): Promise<boolean> {
  const result = await prisma.shareLink.deleteMany({ where: { id, roomId } });
  return result.count > 0;
}

export async function revokeAllShareLinks(roomId: string): Promise<number> {
  const result = await prisma.shareLink.deleteMany({ where: { roomId } });
  return result.count;
}
```

Extend the `checkRoomAccess` return type and the `ClientRole` union to include
the new `COMMITTER` member role:

```typescript
// Before (P066):
export type ClientRole = MemberRole | 'ANONYMOUS';

// After (P091) — MemberRole now includes COMMITTER:
export type ClientRole = MemberRole | 'ANONYMOUS';
```

No change to `ClientRole` itself; the change is in the `MemberRole` Prisma enum.

---

### 4. API endpoints

#### 4a. `POST /api/rooms/[roomId]/share-links` — Create a share link

```
Auth:    Session user must be OWNER or have a ShareLink with permission=ADMIN for the room.
Body:    CreateShareLinkSchema (Zod)
Returns: { id, url, token, expiresAt }
```

```typescript
export const CreateShareLinkSchema = z.object({
  label:          z.string().max(120).optional(),
  scope:          z.enum(['ROOM', 'BRANCH', 'COMMIT']).default('ROOM'),
  // Max 50 branches per link — prevents oversized payloads; a link granting
  // access to all 50+ branches of a large repo should use ROOM scope instead.
  branches:       z.array(z.string().min(1).max(255)).max(50).default([]),
  // 255-char branch-name limit matches Git's own refname length restriction.
  commitSha:      z.string().length(64).optional(),
  permission:     z.enum(['ADMIN', 'BRANCH_CREATE', 'WRITE', 'VIEW']).default('VIEW'),
  expiresInHours: z.coerce.number().int().min(1).max(8760).optional(), // max 1 year; omit = never
  // 100 000 is high enough for broadcast links (e.g. class of 500 students × 200 sessions)
  // without being unbounded. Unlimited links omit this field entirely.
  maxUses:        z.coerce.number().int().min(1).max(100_000).optional(),
});
```

**Validation rules** (enforced in the handler before token generation):
- `scope=COMMIT` implies `permission=VIEW` (commit shares are always read-only).
- `scope=BRANCH` requires `branches` to be non-empty and all branch names must exist in the room.
- `scope=COMMIT` requires `commitSha` to be non-null and the commit must belong to the room.
- Only OWNER or ADMIN-permission share-link holders may create links with `permission=ADMIN`.

#### 4b. `GET /api/rooms/[roomId]/share-links` — List share links

```
Auth:    OWNER or ADMIN permission required.
Returns: Array<ShareLinkSummary>  (tokens are NOT returned; id is used for revocation)
```

#### 4c. `DELETE /api/rooms/[roomId]/share-links/[linkId]` — Revoke a single link

```
Auth:    OWNER, ADMIN, or the original creator of the link.
Returns: { revoked: true }
```

#### 4d. `DELETE /api/rooms/[roomId]/share-links` — Revoke all links for a room

```
Auth:    OWNER or ADMIN only.
Returns: { revoked: number }
```

#### 4e. `GET /api/share/[token]` — Validate a share link and redirect

```
Auth:    Optional (links may be accessed anonymously for VIEW permission).
Returns: 302 redirect to the room (or commit view) on success.
         410 Gone when the link is expired or exhausted.
         404 Not Found when the token does not exist or has been revoked.
```

Logic:
1. Verify HMAC signature from URL parameters (cheap, no DB hit).
2. Look up `ShareLink` by token.
3. Check expiry (`expiresAt !== null && new Date() > expiresAt` → 410).
4. Check usage (`maxUses !== null && useCount >= maxUses` → 410).
5. Atomically increment `useCount` (if `maxUses` is set).
6. For `scope=ROOM` with `permission=ADMIN/BRANCH_CREATE/WRITE` + authenticated user:
   - Upsert `RoomMembership` with the mapped `MemberRole`.
7. Set a short-lived signed HTTP-only cookie `sketchgit_share_scope` encoding:
   `{ linkId, scope, branches, commitSha, permission, roomId }` (signed with `SHARE_LINK_SECRET`).
8. Redirect:
   - `scope=COMMIT` → `/?room=<roomId>&commit=<commitSha>&readonly=1`
   - `scope=BRANCH` → `/?room=<roomId>&branch=<firstBranch>`
   - `scope=ROOM` → `/?room=<roomId>`

The `sketchgit_share_scope` cookie is validated by the WebSocket upgrade handler
so branch/commit restrictions are enforced without a second DB round-trip.

---

### 5. WebSocket session scoping (`server.ts`)

#### 5a. Extended client state

```typescript
interface ConnectedClient {
  ws: WebSocket;
  clientId: string;
  userId: string | null;
  role: ClientRole;
  // P091 – scoped-access metadata (null = full room access)
  shareScope: 'ROOM' | 'BRANCH' | 'COMMIT' | null;
  allowedBranches: string[] | null;  // non-null for BRANCH scope
  allowedCommitSha: string | null;   // non-null for COMMIT scope
}
```

#### 5b. Upgrade handler changes

On WebSocket upgrade, after the existing `checkRoomAccess()` call:

1. If the request has a `share` query parameter, look up the `ShareLink` by token.
2. Verify the HMAC signature and expiry.
3. Map `SharePermission` to `ClientRole`:
   - `ADMIN` → `OWNER`
   - `BRANCH_CREATE` → `EDITOR`
   - `WRITE` → `COMMITTER`
   - `VIEW` → `VIEWER`
4. Populate `shareScope`, `allowedBranches`, and `allowedCommitSha` on the client record.
5. For `scope=COMMIT`: force `role = VIEWER`.
6. For `scope=BRANCH`: override `role` with the mapped role only for the allowed branches.

Alternatively (preferred for performance): validate the `sketchgit_share_scope`
cookie (set during `GET /api/share/[token]`) instead of hitting the DB on every
WS upgrade. The cookie is signed and contains all the required metadata.

#### 5c. Message-handling enforcement

In the `handleWsMessage()` function (extracted in P073), add scope guards:

```typescript
// Branch-scope guard: reject draw/commit/branch-checkout for non-allowed branches
if (client.shareScope === 'BRANCH' && client.allowedBranches) {
  const targetBranch = msg.branch as string | undefined;
  if (targetBranch && !client.allowedBranches.includes(targetBranch)) {
    sendError(client.ws, 'FORBIDDEN', 'Branch not accessible via your share link');
    return;
  }
}

// Commit-scope guard: only fullsync-request is allowed; deny all writes
if (client.shareScope === 'COMMIT') {
  if (msg.type !== 'fullsync-request' && msg.type !== 'ping') {
    sendError(client.ws, 'FORBIDDEN', 'Share link grants read-only commit access');
    return;
  }
}

// COMMITTER role guard: deny branch-create messages
if (client.role === 'COMMITTER' && msg.type === 'branch-update' && msg.action === 'create') {
  sendError(client.ws, 'FORBIDDEN', 'Your share link does not allow branch creation');
  return;
}
```

---

### 6. Fullsync for commit-scoped links (`server.ts` + `roomRepository.ts`)

When a commit-scoped client sends a `fullsync-request`, the server must:

1. Resolve the commit canvas using the existing `resolveCommitCanvas(commitSha, roomId)`.
2. Send a `fullsync` message with the resolved canvas JSON.
3. **Do not** include the live room state (active branch, HEAD) — only the commit snapshot.

The `fullsync` message payload already carries `canvasJson`; no new message types
are needed. The client-side canvas engine should render in a read-only mode when
the `readonly=1` query parameter is present in the URL.

---

### 7. Client-side changes

#### 7a. `lib/sketchgit/realtime/collaborationManager.ts`

Replace `roomInviteLink()` with a new `generateShareLink()` method:

```typescript
async generateShareLink(options: {
  scope: 'ROOM' | 'BRANCH' | 'COMMIT';
  branches?: string[];
  commitSha?: string;
  permission: 'ADMIN' | 'BRANCH_CREATE' | 'WRITE' | 'VIEW';
  expiresInHours?: number;
  maxUses?: number;
  label?: string;
}): Promise<{ url: string; id: string; expiresAt: string | null }> {
  const roomId = this.getRoomId();
  const res = await fetch(`/api/rooms/${roomId}/share-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!res.ok) throw new Error(`Share link creation failed: ${res.status}`);
  return res.json() as Promise<{ url: string; id: string; expiresAt: string | null }>;
}
```

#### 7b. Share dialog UI (`components/sketchgit/ShareDialog.tsx`) — new component

A new modal component triggered from the toolbar "Share" button:

- **Scope selector**: radio group — "Entire room" / "Specific branches" / "Single commit"
  - When "Specific branches" is selected, show a multi-select checklist of existing branches.
  - When "Single commit" is selected, show a commit picker (SHA + message + timestamp) from the timeline.
- **Permission selector**: radio group — "View only" / "Write & draw" / "Write & create branches" / "Admin"
  - Commit scope always forces "View only" and disables the selector.
- **Expiry**: dropdown — "Never" / "1 hour" / "24 hours" / "7 days" / "30 days" / "1 year".
- **Max uses**: number input — empty = unlimited.
- **Label**: optional text field (e.g., "Shared with design team").
- **Generate button**: calls `collaborationManager.generateShareLink()`, shows the resulting URL in a copyable input.
- **Existing links table**: lists active share links for the room (only shown to OWNER/ADMIN), with a revoke button per link.

#### 7c. Read-only canvas mode (`lib/sketchgit/canvas/canvasEngine.ts`)

When `readonly=1` is in the URL (commit-scoped links), the canvas engine must:

1. Disable all Fabric.js interactive controls: `canvas.selection = false`, `canvas.forEachObject(o => o.set({ selectable: false, evented: false }))`.
2. Hide the toolbar drawing tools (brush, shapes, text, eraser).
3. Show a read-only indicator banner.
4. Still allow zooming/panning (`canvas.isDragging` mode).

---

### 8. Error codes

Add to `lib/api/errors.ts`:

```typescript
// ── Share links (P091) ───────────────────────────────────────────────────────
SHARE_LINK_EXPIRED:    'SHARE_LINK_EXPIRED',
SHARE_LINK_EXHAUSTED:  'SHARE_LINK_EXHAUSTED',
SHARE_LINK_INVALID:    'SHARE_LINK_INVALID',
SHARE_LINK_FORBIDDEN:  'SHARE_LINK_FORBIDDEN', // e.g. VIEW link cannot create branches
```

Add user-facing translations to `messages/en.json` and `messages/de.json` under `errors.*`.

---

### 9. Migration

Create a new Prisma migration `20260314_p091_share_links`:

1. Add the `COMMITTER` value to the `MemberRole` enum.
2. Add the `ShareScope` enum.
3. Add the `SharePermission` enum.
4. Create the `ShareLink` table.
5. Migrate existing `RoomInvitation` records to `ShareLink`:
   ```sql
   INSERT INTO "ShareLink" (id, token, "roomId", scope, permission, "createdBy",
                            "expiresAt", "maxUses", "useCount", "createdAt")
   SELECT id, token, "roomId", 'ROOM'::"ShareScope",
          'BRANCH_CREATE'::"SharePermission",
          "createdBy", "expiresAt", "maxUses", "useCount", "createdAt"
   FROM   "RoomInvitation";
   ```
6. Drop the `RoomInvitation` table (after verifying data was migrated).

> **Note**: The existing P066 API endpoints (`/api/rooms/[roomId]/invitations` and
> `/api/invitations/[token]`) should be kept for one release cycle as a deprecated
> shim that delegates to the new share-link logic, then removed in a follow-up proposal.

---

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `prisma/schema.prisma` | Add `ShareLink` model, `ShareScope` enum, `SharePermission` enum; add `COMMITTER` to `MemberRole`; add relation to `Room` and `User`; deprecate `RoomInvitation` |
| `prisma/migrations/` | New migration: add enums + `ShareLink` table, migrate `RoomInvitation` rows, drop old table |
| `lib/server/shareLinkTokens.ts` | New file: token generation and HMAC signing for share links |
| `lib/db/roomRepository.ts` | Add `createShareLink`, `getShareLinkByToken`, `consumeShareLink`, `listShareLinks`, `revokeShareLink`, `revokeAllShareLinks`; update `ClientRole`/enforcement for `COMMITTER` role |
| `lib/api/errors.ts` | Add `SHARE_LINK_EXPIRED`, `SHARE_LINK_EXHAUSTED`, `SHARE_LINK_INVALID`, `SHARE_LINK_FORBIDDEN` |
| `lib/env.ts` | Add `SHARE_LINK_SECRET` |
| `.env.example` | Document `SHARE_LINK_SECRET` |
| `app/api/rooms/[roomId]/share-links/route.ts` | New file: `POST` (create) + `GET` (list) + `DELETE` (revoke all) |
| `app/api/rooms/[roomId]/share-links/[linkId]/route.ts` | New file: `DELETE` (revoke single link) |
| `app/api/share/[token]/route.ts` | New file: validate token, set scope cookie, redirect |
| `app/api/rooms/[roomId]/invitations/route.ts` | Deprecated shim — delegate to share-link logic |
| `app/api/invitations/[token]/route.ts` | Deprecated shim — delegate to share-link logic |
| `server.ts` | Extend `ConnectedClient` with scope fields; upgrade handler reads scope cookie or query param; `handleWsMessage` enforces branch/commit/role guards |
| `lib/sketchgit/realtime/collaborationManager.ts` | Replace `roomInviteLink()` with `generateShareLink()`; add `listShareLinks()` and `revokeShareLink()` wrappers |
| `lib/sketchgit/canvas/canvasEngine.ts` | Add read-only mode (disable selection, tools when `readonly=1`) |
| `components/sketchgit/ShareDialog.tsx` | New component: scope picker, permission picker, expiry/maxUses inputs, link display, existing-links table |
| `components/sketchgit/AppTopbar.tsx` | Add "Share" button that opens `ShareDialog` |
| `messages/en.json` + `messages/de.json` | Add `errors.SHARE_LINK_*`, `shareDialog.*` i18n keys |
| `lib/api/wsSchemas.ts` | No new WS message types needed; existing `error` schema handles scope rejections |
| `lib/sketchgit/types.ts` | No changes needed (scope guards are server-side) |

---

## Additional Considerations

### Backward compatibility

- Rooms with `isPublic=true` behave exactly as before: any user may join as EDITOR.
- Existing OWNER / EDITOR / VIEWER memberships continue to work.
- The new `COMMITTER` role is additive; no existing row has this value before the migration.
- Deprecated P066 endpoints return responses in the old format so clients on the previous version are not broken until the shim is removed.

### Share link security

- Tokens are 32 random bytes (hex-encoded, 64 chars) — unguessable.
- HMAC signature prevents URL tampering without the `SHARE_LINK_SECRET`.
- The `sketchgit_share_scope` cookie is `HttpOnly`, `Secure`, `SameSite=Lax` and signed to prevent client-side forgery.
- Commit-scoped links expose only the canvas JSON of the target commit; no other room data is accessible.
- Branch-scoped links reveal branch existence but do not expose other branches' commit history.
- `ADMIN` permission links should be used sparingly; the UI should show a warning when creating them.

### Rate limiting

- `POST /api/rooms/[roomId]/share-links` must be covered by the existing P015/P046 rate limiter.
- Recommended limit: 50 share-link creations per room per hour (higher than P066's 20 because batch branch links are a common use case).
- `GET /api/share/[token]` must be rate-limited per IP to prevent token-exhaustion attacks (incrementing `useCount` to exhaust a link).

### Anonymously accessible links

- For `scope=COMMIT` or `permission=VIEW`: authenticated session is not required. Anonymous users may view commits or read-only rooms via share links. This aligns with the anonymous-first UX (P007).
- For `permission=WRITE/BRANCH_CREATE/ADMIN`: the redirect endpoint requires an authenticated session. Anonymous users are sent to the sign-in page first, then redirected back.

### GDPR and data export (P041)

- `ShareLink` records created by a user should be included in the GDPR data export.
- When a user is deleted (`onDelete: SetNull` on `createdBy`), links they created remain valid until their expiry — this is intentional so rooms are not accidentally broken when a creator account is deleted.

### Integration with the room pruning job (P032)

`ShareLink` records are automatically deleted when their parent room is deleted (`onDelete: Cascade`). The pruning job requires no changes.

### Access-revocation cascades

- When a user's room membership is downgraded from EDITOR to VIEWER, any `BRANCH_CREATE`-permission share links they created remain valid. The link grants the *link permission*, not the creator's current permission.
- OWNER-only override: an OWNER may revoke all share links at once via `DELETE /api/rooms/[roomId]/share-links`.

### OpenAPI documentation (P062)

Export `CreateShareLinkSchema` from the route file so the OpenAPI generator
(`lib/api/openapi.ts`) includes it in the generated spec automatically.

---

## Testing Requirements

### Unit tests (`lib/server/shareLinkTokens.test.ts`)
- `generateShareLinkToken()` returns a 64-character hex string.
- `verifyShareLinkSignature()` returns `true` for a valid signature.
- `verifyShareLinkSignature()` returns `false` for a tampered token, roomId, scope, or expiresAt.
- `verifyShareLinkSignature()` uses constant-time comparison (no timing leakage — test is structural, asserting `timingSafeEqual` is called).

### API tests (`app/api/rooms/[roomId]/share-links/route.test.ts`)
- `POST` returns 401 for unauthenticated requests.
- `POST` returns 403 when the caller is not OWNER/ADMIN.
- `POST` with `scope=COMMIT` ignores non-VIEW permission and always returns `permission=VIEW`.
- `POST` with `scope=BRANCH` returns 422 when `branches` is empty.
- `POST` with `scope=BRANCH` returns 404 when a named branch does not exist.
- `POST` with `scope=COMMIT` returns 404 when `commitSha` does not belong to the room.
- `POST` returns `{ id, url, token, expiresAt }` on success.
- `GET` returns 403 for non-OWNER/ADMIN callers.
- `GET` returns the list of links without the `token` field.
- `DELETE /[linkId]` returns 404 when the link does not exist in the room.
- `DELETE /[linkId]` returns 200 and removes the link for the creator or an OWNER.

### API tests (`app/api/share/[token]/route.test.ts`)
- Returns 404 for an unknown token.
- Returns 410 for an expired token (`expiresAt` in the past).
- Returns 410 for an exhausted token (`useCount >= maxUses`).
- Returns 302 redirect to `/?room=<roomId>` for a valid ROOM-scoped link.
- Returns 302 redirect with `commit=<sha>&readonly=1` for a COMMIT-scoped link.
- Sets the `sketchgit_share_scope` cookie on success.
- Upserts a `RoomMembership` for WRITE+ permission on a ROOM-scoped link for an authenticated user.
- Does not create a membership for VIEW-only or COMMIT-scoped links.

### WebSocket enforcement tests (`server.test.ts`)
- A COMMITTER client receives a FORBIDDEN error when sending a `branch-update` with `action=create`.
- A BRANCH-scoped client receives FORBIDDEN when sending a commit message targeting a non-allowed branch.
- A COMMIT-scoped client receives FORBIDDEN for any message type other than `fullsync-request`.
- A valid share-link cookie grants WS access to a private room for a non-member.
- An expired or invalid share-link cookie is rejected at upgrade time.

---

## Dependency Map

- **Builds on**: P003 ✅ (Prisma/PostgreSQL), P005 ✅ (TypeScript strict), P007 ✅ (authentication + anonymous-first UX), P034 ✅ (WS access control), P054 ✅ (constant-time comparisons), P066 ✅ (invitation tokens — superseded/migrated by this proposal)
- **Complements**: P009 ✅ (i18n — new share dialog strings), P015 ✅ (rate limiting — new endpoints), P041 (GDPR data export — share links included), P062 ✅ (OpenAPI — schema exported), P074 ✅ (activity feed — `SHARE_LINK_CREATED` / `SHARE_LINK_REVOKED` events can be appended)
- **Enables**: A future **embed / iframe share** feature (P0xx) where a commit-scoped VIEW link can be embedded in external sites; the read-only canvas mode introduced here is the foundation.
- **Independent of**: Redis (all share-link lookups are DB calls; Redis pub/sub is only needed for cross-instance WS message routing, which already works without this feature)
