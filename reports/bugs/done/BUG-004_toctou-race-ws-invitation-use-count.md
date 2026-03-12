# BUG-004 – TOCTOU race in WebSocket invitation handling allows use count to exceed maxUses

| Field | Value |
|---|---|
| **ID** | BUG-004 |
| **Severity** | Medium |
| **Category** | Race condition / Access control |
| **Status** | Open |

## Summary

The WebSocket connection handler in `server.ts` processes invitation tokens with a non-atomic check-then-act pattern (TOCTOU race condition). Two concurrent WebSocket connections presenting the same invitation token can both pass the `useCount < maxUses` guard simultaneously, and both successfully increment the use count — allowing more users than `maxUses` permits to join a private room.

## Affected File

`server.ts`, lines ~1029–1053 (inside the `wss.on('connection', ...)` handler).

## Root Cause

The vulnerable code reads the invitation, checks `useCount < maxUses`, then unconditionally calls `prisma.roomInvitation.update(...)`:

```ts
// server.ts — VULNERABLE
const invitation = await prisma.roomInvitation.findUnique({
  where: { token: inviteToken },
  select: { roomId: true, expiresAt: true, maxUses: true, useCount: true },
});
if (
  invitation &&
  invitation.roomId === roomId &&
  invitation.expiresAt > new Date() &&
  invitation.useCount < invitation.maxUses   // ← check
) {
  // Both concurrent requests pass the check above ↑
  await prisma.roomInvitation.update({       // ← unconditional update (WRONG)
    where: { token: inviteToken },
    data: { useCount: { increment: 1 } },
  });
  // Both add a room membership and are granted access
  if (client.userId) {
    await prisma.roomMembership.upsert({ ... });
  }
  access = { allowed: true, role: "EDITOR" };
}
```

### Race scenario

1. `maxUses = 1`, `useCount = 0`.
2. Request A reads `useCount = 0` → passes the `< maxUses` check.
3. Request B reads `useCount = 0` → also passes the `< maxUses` check (A has not written yet).
4. Request A calls `update(increment: 1)` → `useCount` becomes 1.
5. Request B calls `update(increment: 1)` → `useCount` becomes 2, **exceeding maxUses = 1**.
6. Both users are granted access and memberships are created.

### Comparison: the HTTP invitation route handles this correctly

`app/api/invitations/[token]/route.ts` uses a conditional `updateMany` to make the increment atomic:

```ts
// CORRECT — atomic conditional update
const updated = await prisma.roomInvitation.updateMany({
  where: { token, useCount: { lt: invitation.maxUses } },  // ← condition in WHERE
  data: { useCount: { increment: 1 } },
});
if (updated.count === 0) {
  return apiError(ApiErrorCode.INVITATION_EXHAUSTED, "...", 410);
}
```

The WebSocket path does not apply this pattern.

## Impact

- A single-use invitation (`maxUses = 1`) can be used by more than one person under concurrent connection load.
- Private room access control can be bypassed by timing simultaneous WebSocket connection attempts.
- Room memberships are created for both users even when only one should be admitted.

## Suggested Fix

Replace the unconditional `update` in `server.ts` with the same conditional `updateMany` pattern used in the HTTP invitation route:

```ts
// server.ts — CORRECT
if (
  invitation &&
  invitation.roomId === roomId &&
  invitation.expiresAt > new Date() &&
  invitation.useCount < invitation.maxUses
) {
  // Atomically increment use count only if still under the limit
  const updated = await prisma.roomInvitation.updateMany({
    where: { token: inviteToken, useCount: { lt: invitation.maxUses } },
    data: { useCount: { increment: 1 } },
  });
  if (updated.count === 0) {
    // Another concurrent connection consumed the last use; deny access
    sendTo(client, { type: "error", code: "INVITATION_EXHAUSTED", detail: "Invitation limit reached" });
    ws.close(1008, "Invitation exhausted");
    return;
  }

  // Grant membership only after the atomic increment succeeded
  if (client.userId) {
    await prisma.roomMembership.upsert({
      where: { roomId_userId: { roomId, userId: client.userId } },
      update: {},
      create: { roomId, userId: client.userId, role: "EDITOR" },
    });
  }
  access = { allowed: true, role: "EDITOR" };
}
```
