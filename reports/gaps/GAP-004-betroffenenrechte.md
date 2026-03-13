# GAP-004 – DSGVO Betroffenenrechte (Data Subject Rights)

**Status:** ⚠️ Partial  
**Priority:** 🔴 Critical  
**Category:** DSGVO / GDPR  
**Effort Estimate:** 8–16 hours  

---

## 1. Description

The DSGVO grants data subjects eight enforceable rights against the data controller. While SketchGit has implemented the right to erasure (Art. 17) via `DELETE /api/auth/account`, the remaining rights – in particular the right of access (Art. 15) and the right to data portability (Art. 20) – are not implemented. A documented process for handling Data Subject Access Requests (DSARs) is also absent.

---

## 2. Applicable Law

| Law / Regulation | Article | Right |
|---|---|---|
| DSGVO 2016/679 | Art. 15 | Right of access (Auskunftsrecht) |
| DSGVO 2016/679 | Art. 16 | Right to rectification (Recht auf Berichtigung) |
| DSGVO 2016/679 | Art. 17 | Right to erasure (Recht auf Löschung) |
| DSGVO 2016/679 | Art. 18 | Right to restriction of processing (Einschränkung der Verarbeitung) |
| DSGVO 2016/679 | Art. 20 | Right to data portability (Recht auf Datenübertragbarkeit) |
| DSGVO 2016/679 | Art. 21 | Right to object (Widerspruchsrecht) |
| DSGVO 2016/679 | Art. 22 | Right not to be subject to automated decisions |
| DSGVO 2016/679 | Art. 12 | Response within 1 month; free of charge |
| DSGVO 2016/679 | Art. 83 Abs. 5 | Fine: up to €20M or 4% global turnover |
| BDSG 2018 | § 34 | National supplementation of Art. 15 for employee data |

---

## 3. Current State

| Right | Status | Notes |
|---|---|---|
| Art. 15 – Access | ❌ Not implemented | No DSAR endpoint or mechanism |
| Art. 16 – Rectification | ⚠️ Partial | Users can change their display name via the dashboard. Email change is not implemented. |
| Art. 17 – Erasure | ✅ Implemented | `DELETE /api/auth/account` deletes user record, nullifies room ownership and commit authorship |
| Art. 18 – Restriction | ❌ Not implemented | No way to flag an account as "restricted" |
| Art. 20 – Portability | ❌ Not implemented | No machine-readable export of user data |
| Art. 21 – Object | ❌ Not implemented | No objection channel; relevant for activity-log processing under Art. 6 lit. f |
| Art. 22 – No automated decisions | ✅ N/A | No automated decision-making exists |

---

## 4. What Needs to Be Done

### 4.1 Art. 15 – Right of Access (DSAR Endpoint)

**Requirement:** On request, provide the data subject with a copy of all personal data held about them, and additional meta-information (purposes, recipients, retention periods).

**Implementation – `GET /api/auth/dsar`:**

The endpoint should:
1. Authenticate the caller (valid session required).
2. Query all data associated with `session.user.id`:
   - `User` record (email, name, createdAt, updatedAt)
   - `Account` records (OAuth providers, no raw tokens)
   - `Room` memberships (role, joinedAt)
   - `RoomEvent` records where `actorId = userId` (within retention window)
   - `Commit` records where `authorId = userId`
   - Active `PasswordResetToken` (existence only, not the token value)
3. Return a structured JSON response.
4. Apply `mutableHeaders()` (no caching) from `lib/api/cacheHeaders.ts`.

**Response Schema (example):**

```json
{
  "exportedAt": "2026-01-15T10:00:00Z",
  "controller": {
    "name": "...",
    "email": "datenschutz@example.com"
  },
  "subject": {
    "id": "clxyz...",
    "email": "user@example.com",
    "name": "Alice",
    "createdAt": "2025-12-01T09:00:00Z"
  },
  "authProviders": ["credentials", "github"],
  "roomMemberships": [
    { "roomId": "...", "roomName": "My Board", "role": "OWNER", "joinedAt": "..." }
  ],
  "activityEvents": [
    { "type": "COMMIT", "roomId": "...", "occurredAt": "..." }
  ],
  "commits": [
    { "id": "...", "roomId": "...", "message": "...", "createdAt": "..." }
  ],
  "processingPurposes": {
    "account": "Authentication and service delivery (Art. 6 Abs. 1 lit. b DSGVO)",
    "activityLog": "Security audit trail (Art. 6 Abs. 1 lit. f DSGVO)"
  },
  "retentionPeriods": {
    "account": "Until account deletion",
    "activityLog": "90 days"
  }
}
```

### 4.2 Art. 16 – Right to Rectification

**Requirement:** Users must be able to correct inaccurate personal data.

**Current gap:** Email address cannot be changed by the user; only the display name can be updated.

**Implementation:** Add a "Change Email" form to the dashboard settings section:
- Require current password confirmation before email change.
- Send a verification email to the new address (use Resend).
- Only update the database record after the new email is confirmed.
- After update, invalidate the existing session (the JWT contains the old email).

**Endpoint:** `PATCH /api/auth/account` (or a new `PUT /api/auth/account/email`)

### 4.3 Art. 18 – Right to Restriction of Processing

**Requirement:** The data subject may request that the controller restricts processing (e.g., during a dispute about accuracy).

**Practical implementation for a small operator:**
- Handle via email to the privacy contact address.
- Document the process in the privacy policy: "Requests for restriction can be sent to [datenschutz@example.com]. We will respond within one month."
- No database-level implementation is strictly required for a small operator handling this manually.

### 4.4 Art. 20 – Right to Data Portability

**Requirement:** Provide personal data in a structured, commonly used, machine-readable format (e.g., JSON, CSV) for data the user provided and which is processed by automated means under Art. 6 lit. a or Art. 6 lit. b.

The DSAR endpoint (Art. 15) already returns JSON, which satisfies Art. 20 if it includes all user-provided data. The response from `GET /api/auth/dsar` should therefore include all canvas/commit data authored by the user.

**Additional consideration:** Canvas data stored in rooms the user owns should be included in the export, as this is content the user created.

### 4.5 Art. 21 – Right to Object

**Requirement:** Where processing is based on Art. 6 lit. f (legitimate interest), the data subject has an absolute right to object. SketchGit uses Art. 6 lit. f for the activity/event log.

**Implementation:**
- The privacy policy must inform users of the right to object to activity-log processing.
- Provide a mechanism (email or in-app form) to file an objection.
- Upon a valid objection, stop logging events for that user and delete existing event records for that user. Consider adding a `doNotLog` flag to the `User` model.

### 4.6 Contact Channel for Rights Requests

**Requirement (Art. 12 Abs. 1):** The controller must facilitate the exercise of rights and must not hinder requests.

**Implementation:**
- Provide a dedicated email address (e.g., `datenschutz@[domain]`) in the privacy policy.
- Alternatively, implement an in-app contact form at `/contact` (see GAP-001 / GAP-002).
- Consider adding a "Download My Data" and "Request Data Deletion" button to the dashboard Settings page for user-friendly self-service.

---

## 5. Response Time Obligations (Art. 12 Abs. 3)

| Situation | Deadline |
|---|---|
| Standard DSAR response | 1 month from receipt |
| Complex or multiple requests | Up to 3 months (notify user within 1 month) |
| Free of charge | Always (unless requests are manifestly unfounded or excessive) |
| Identity verification | May be requested; must not add unreasonable burden |

**Recommendation:** Log incoming DSAR requests (timestamp, type, response date) to demonstrate compliance.

---

## 6. Implementation Priority

1. **Immediate (before any public launch):**
   - Provide a privacy contact email in the privacy policy (GAP-002)
   - Document how users can email a DSAR
2. **Short-term (within 1 month of launch):**
   - Implement `GET /api/auth/dsar` (Art. 15 + Art. 20)
   - Implement email-change flow (Art. 16)
3. **Medium-term:**
   - Add in-app "Download My Data" button to dashboard
   - Add objection flag for activity-log processing (Art. 21)

---

## 7. Verification

1. Call `GET /api/auth/dsar` as an authenticated user → receives JSON with all personal data fields.
2. Call `PATCH /api/auth/account` with a new email → verification email sent → after confirmation, email updated and old session invalidated.
3. Privacy policy links to the data subject rights section with the privacy contact address.
