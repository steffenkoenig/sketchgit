# GAP-008 – Verarbeitungsverzeichnis (Records of Processing Activities)

**Status:** ❌ Open  
**Priority:** 🟠 High  
**Category:** DSGVO / GDPR  
**Effort Estimate:** 2–4 hours (documentation)  

---

## 1. Description

Article 30 DSGVO requires every controller to maintain a written **record of processing activities** (Verarbeitungsverzeichnis – VVT). This is an internal document, not publicly disclosed, but must be made available to the supervisory authority on request. Currently no such document exists for SketchGit.

---

## 2. Applicable Law

| Law / Regulation | Article | Requirement |
|---|---|---|
| DSGVO 2016/679 | Art. 30 Abs. 1 | Controller must maintain record of processing activities |
| DSGVO 2016/679 | Art. 30 Abs. 3 | Must be in writing (including electronic form) |
| DSGVO 2016/679 | Art. 30 Abs. 4 | Must be made available to supervisory authority on request |
| DSGVO 2016/679 | Art. 30 Abs. 5 | Exception for <250 employees + low-risk processing (rarely applies) |
| DSGVO 2016/679 | Art. 83 Abs. 4 | Fine: up to €10M or 2% global turnover |

> **Note on the small-business exception (Art. 30 Abs. 5):** The exception applies to organisations with fewer than 250 persons, but only if processing does **not** include sensitive categories (Art. 9), is **not** likely to risk data subject rights, and is **not** carried out regularly. Since SketchGit processes personal data regularly (ongoing user accounts), the exception does **not** apply.

---

## 3. Required Content (Art. 30 Abs. 1)

For each processing activity, the record must include:

1. Name and contact details of the controller (and DPO if applicable)
2. Purpose(s) of the processing
3. Description of data subject categories
4. Description of personal data categories
5. Categories of recipients
6. Where applicable: third-country transfers and safeguards
7. Where possible: retention periods or deletion criteria
8. Where possible: description of technical and organisational security measures (Art. 32)

---

## 4. Processing Activities to Document

The following table constitutes the initial **Verarbeitungsverzeichnis** for SketchGit:

---

### Processing Activity 1 – User Account Management

| Field | Value |
|---|---|
| **Activity name** | Nutzerkonten-Verwaltung (User Account Management) |
| **Purpose** | Authentication, authorisation, account recovery |
| **Legal basis** | Art. 6 Abs. 1 lit. b DSGVO (contract performance) |
| **Data subjects** | Registered users |
| **Data categories** | Email address, display name, password hash (Argon2id), createdAt/updatedAt timestamps |
| **Data sources** | Directly from the data subject (registration form, OAuth) |
| **Recipients** | None (data not shared with third parties) |
| **Third-country transfer** | None (if EU hosting used) |
| **Retention** | Until account deletion (user-initiated or operator-initiated) |
| **Technical measures** | Argon2id hashing; TLS; RBAC; HttpOnly session cookies |

---

### Processing Activity 2 – GitHub OAuth Authentication

| Field | Value |
|---|---|
| **Activity name** | GitHub OAuth Authentifizierung |
| **Purpose** | Allow users to authenticate via GitHub without a password |
| **Legal basis** | Art. 6 Abs. 1 lit. b DSGVO |
| **Data subjects** | Users who choose GitHub OAuth |
| **Data categories** | OAuth access/refresh tokens, GitHub user ID, email |
| **Data sources** | GitHub OAuth flow |
| **Recipients** | GitHub (independent controller) |
| **Third-country transfer** | US (GitHub Inc.) – DPF-certified |
| **Retention** | Until account deletion or OAuth disconnection |
| **Technical measures** | Tokens stored in database; database encrypted at rest recommended |

---

### Processing Activity 3 – Collaborative Drawing Sessions (Anonymous)

| Field | Value |
|---|---|
| **Activity name** | Anonyme Zeichen-Sitzungen |
| **Purpose** | Real-time collaborative drawing without account |
| **Legal basis** | Art. 6 Abs. 1 lit. b (service delivery) |
| **Data subjects** | Anonymous visitors |
| **Data categories** | Display name (localStorage only, not transmitted), cursor position (ephemeral WebSocket) |
| **Data sources** | User input |
| **Recipients** | Other room participants (ephemeral, not stored) |
| **Third-country transfer** | None |
| **Retention** | Cursor data: real-time only, not persisted. Display name: localStorage, not on server. |
| **Technical measures** | WebSocket data not persisted after session; localStorage not transmitted |

---

### Processing Activity 4 – Room and Commit Storage

| Field | Value |
|---|---|
| **Activity name** | Raum- und Commit-Speicherung |
| **Purpose** | Persistent drawing boards with git-like version history |
| **Legal basis** | Art. 6 Abs. 1 lit. b (service delivery) |
| **Data subjects** | Registered users, collaborators |
| **Data categories** | Room name, canvas JSON (drawing content), commit messages, author user IDs, timestamps |
| **Data sources** | User input, application actions |
| **Recipients** | Room members (controlled via RBAC) |
| **Third-country transfer** | None (if EU hosting used) |
| **Retention** | Until room deletion by owner |
| **Technical measures** | RBAC (OWNER/EDITOR/VIEWER); room access token validation |

---

### Processing Activity 5 – Activity Event Logging

| Field | Value |
|---|---|
| **Activity name** | Aktivitäts-Ereignisprotokoll |
| **Purpose** | Audit trail for security, debugging, collaboration history |
| **Legal basis** | Art. 6 Abs. 1 lit. f DSGVO (legitimate interest – security monitoring) |
| **Data subjects** | Registered and anonymous users of rooms |
| **Data categories** | User ID (if authenticated), event type (COMMIT/BRANCH_CHECKOUT/MEMBER_JOIN/etc.), timestamp, room ID |
| **Data sources** | Application-generated on user actions |
| **Recipients** | Room owners (via GET /api/rooms/[roomId]/events) |
| **Third-country transfer** | None (if EU hosting used) |
| **Retention** | 90 days (configurable via `ROOM_EVENT_RETENTION_DAYS`) |
| **Technical measures** | Automatic expiry query; user ID nullified after account deletion |

---

### Processing Activity 6 – Password Reset Emails

| Field | Value |
|---|---|
| **Activity name** | Passwort-Zurücksetzen E-Mails |
| **Purpose** | Allow users to recover access to their account |
| **Legal basis** | Art. 6 Abs. 1 lit. b DSGVO |
| **Data subjects** | Registered users who request a password reset |
| **Data categories** | Email address, password reset token (hashed), expiry timestamp |
| **Data sources** | User request + application-generated token |
| **Recipients** | Resend (processor, EU DPA concluded – see GAP-005) |
| **Third-country transfer** | US transfer via Resend if EU region not used (see GAP-006) |
| **Retention** | Token: 24 hours. Email delivery log at Resend: per Resend retention policy |
| **Technical measures** | 256-bit random token; stored as hash; 24-hour expiry; single-use |

---

### Processing Activity 7 – Rate Limiter (Redis)

| Field | Value |
|---|---|
| **Activity name** | Rate-Limiting |
| **Purpose** | Prevent brute-force attacks and API abuse |
| **Legal basis** | Art. 6 Abs. 1 lit. f DSGVO (legitimate interest – security) |
| **Data subjects** | All users (IP-address-level limiting) |
| **Data categories** | IP address (counter key), request count |
| **Data sources** | HTTP request metadata |
| **Recipients** | Redis (if external service: processor) |
| **Third-country transfer** | None if EU Redis region used (see GAP-006) |
| **Retention** | 60 seconds (sliding window) |
| **Technical measures** | Only request count stored, not full IP logs; short TTL |

---

## 5. What Needs to Be Done

1. **Create the VVT document** in a private location (not the public repository). The template above can serve as the starting point.
2. **Keep it updated** whenever a new processing activity is added or existing activities change.
3. **Review annually** or after any significant system change.
4. **Store with the AVVs** (see GAP-005) in a secure internal ops location.
5. **Appoint a contact person** who is responsible for maintaining the VVT.

---

## 6. Verification

1. VVT document exists and is accessible to the operator.
2. All seven processing activities documented above are represented.
3. Document is reviewed and date-stamped annually.
4. On supervisory authority request, the VVT can be produced within 48 hours.
