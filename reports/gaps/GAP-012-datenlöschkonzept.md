# GAP-012 – Datenlöschkonzept / Datenaufbewahrungsrichtlinie (Data Retention and Deletion Policy)

**Status:** ⚠️ Partial  
**Priority:** 🟠 High  
**Category:** DSGVO / GDPR  
**Effort Estimate:** 4–8 hours (process + partial implementation)  

---

## 1. Description

Article 5 Abs. 1 lit. e DSGVO (storage limitation principle) requires that personal data is kept no longer than necessary for the purposes for which it is processed. SketchGit has implemented account deletion (Art. 17), and activity events have a configurable 90-day retention (`ROOM_EVENT_RETENTION_DAYS`). However, no comprehensive deletion concept covers all data types, no automated deletion runs for stale accounts or orphaned data, and no documented retention schedule exists.

---

## 2. Applicable Law

| Law / Regulation | Article | Requirement |
|---|---|---|
| DSGVO 2016/679 | Art. 5 Abs. 1 lit. e | Storage limitation: kept no longer than necessary |
| DSGVO 2016/679 | Art. 17 | Right to erasure on request |
| DSGVO 2016/679 | Art. 25 Abs. 2 | Data minimisation by default |
| DSGVO 2016/679 | Art. 30 Abs. 1 lit. f | Retention periods must be documented in the VVT (see GAP-008) |
| HGB (Handelsgesetzbuch) | § 257 | Commercial records retention: 10 years for invoices, 6 years for other docs |
| AO (Abgabenordnung) | § 147 | Tax records: 10 years |

---

## 3. Current Retention Implementation

| Data Type | Current Retention | Automated? | Legal Requirement |
|---|---|---|---|
| User accounts | Until user deletes | ❌ No automated expiry | Delete when no longer needed |
| Session JWT | 30 days (cookie expiry) | ✅ Built-in (cookie TTL) | Appropriate |
| Password reset tokens | 24 hours (column check) | ⚠️ Checked on use, but not purged from DB | Should be purged periodically |
| Activity/room events | 90 days (configurable) | ⚠️ Check if cron job exists | Appropriate, but must be automated |
| Canvas data (rooms) | Until room deletion | ❌ No automated expiry | Delete when no longer needed |
| Commit history | Until room/account deletion | ❌ No automated expiry | Delete when no longer needed |
| OAuth tokens | Until account deletion | ❌ No automated expiry | Review if refresh tokens expire upstream |
| Anonymous localStorage data | Browser-managed | ✅ Browser handles | N/A (not on server) |

---

## 4. What Needs to Be Done

### 4.1 Document Retention Schedule

Create an internal retention schedule (part of the VVT – GAP-008) specifying:

| Data Category | Retention Period | Legal Basis | Deletion Method |
|---|---|---|---|
| User account data | Until account deletion | Art. 6 lit. b | User-initiated `DELETE /api/auth/account` |
| Inactive accounts (no login for X years) | [Define: e.g., 3 years] | Art. 5 lit. e (storage limitation) | Automated reminder email + deletion job |
| Password reset tokens | 24 hours | Art. 5 lit. e | Periodic cleanup job |
| Activity events | 90 days | Art. 6 lit. f (legitimate interest) | `ROOM_EVENT_RETENTION_DAYS` automated expiry |
| Rooms with no active members | [Define: e.g., 1 year] | Art. 5 lit. e | Automated cleanup job |
| Orphaned rooms (owner deleted) | [Define: e.g., 6 months] | Art. 5 lit. e | Automated cleanup job |
| OAuth tokens | Until account deletion | Art. 6 lit. b | Cascade delete on account deletion |

### 4.2 Implement Password Reset Token Cleanup

Currently expired password reset tokens remain in the database indefinitely. Add a periodic cleanup:

**Option A: Cron job or scheduled task**
```sql
DELETE FROM "PasswordResetToken" WHERE "expiresAt" < NOW();
```

**Option B: Cleanup on each reset attempt**
Add a purge step at the start of `POST /api/auth/reset-password`:
```typescript
// Purge expired tokens (piggyback on active usage)
await prisma.passwordResetToken.deleteMany({
  where: { expiresAt: { lt: new Date() } }
});
```

### 4.3 Implement Activity Event Auto-Deletion

The `ROOM_EVENT_RETENTION_DAYS` environment variable is defined, but verify that a deletion job actually runs:

1. Check if there is a cron job or periodic task in `server.ts` that runs the expiry query.
2. If not, add a daily cleanup call inside `server.ts` (use `setInterval` with 24-hour interval):

```typescript
// In server.ts – daily cleanup of expired events
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
setInterval(async () => {
  const retentionDays = env.ROOM_EVENT_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  await prisma.roomEvent.deleteMany({ where: { occurredAt: { lt: cutoff } } });
}, ONE_DAY_MS);
```

### 4.4 Inactive Account Policy

Consider implementing an inactive account notice and eventual deletion:

1. **Define inactivity threshold** (e.g., no login for 3 years).
2. **Send reminder email** 30 days before deletion (using Resend).
3. **Delete account** if user does not log in within 30 days of the reminder.
4. **Disclose this policy** in the Terms of Service and Privacy Policy.

This is required by the storage limitation principle (Art. 5 lit. e) but the exact threshold is at the operator's discretion.

### 4.5 Orphaned Room Cleanup

When a room owner deletes their account, room ownership is set to `NULL`. These rooms may never be cleaned up. Define a policy:

- After X months with no active members (no commits, no joins), delete the room and its content.
- Alternatively, require at least one authenticated member to claim ownership.

### 4.6 Data Export Before Deletion (Art. 20)

Before automated deletion of inactive accounts:
- Send the user their data in machine-readable format (JSON) as part of the deletion notice email.
- This satisfies both Art. 17 (erasure) and Art. 20 (portability) in a single flow.

---

## 5. Retention and German Commercial Law

If SketchGit is ever used for paid services (invoices, subscriptions):
- Invoice records must be retained for **10 years** (§ 147 AO / § 257 HGB).
- This creates a conflict with DSGVO storage limitation for users who have paid.
- Resolution: Retain only the invoice data (not the full user account) for the tax-required period; pseudonymise or anonymise the personal data components.

---

## 6. Verification

1. `SELECT COUNT(*) FROM "PasswordResetToken" WHERE "expiresAt" < NOW()` returns 0 after cleanup job runs.
2. `SELECT COUNT(*) FROM "RoomEvent" WHERE "occurredAt" < NOW() - INTERVAL '90 days'` returns 0 after cleanup job runs.
3. Retention schedule document exists and is part of the VVT.
4. Privacy policy accurately states all retention periods.
5. Inactive account policy is documented in Terms of Service.
