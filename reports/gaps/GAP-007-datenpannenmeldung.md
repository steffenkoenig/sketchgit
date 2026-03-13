# GAP-007 – Datenpannenmeldung (Data Breach Notification)

**Status:** ❌ Open  
**Priority:** 🟠 High  
**Category:** DSGVO / GDPR  
**Effort Estimate:** 4–8 hours (process + partial implementation)  

---

## 1. Description

Articles 33 and 34 DSGVO require the controller to notify the competent supervisory authority within 72 hours of becoming aware of a personal data breach, and in certain cases to notify affected data subjects directly. SketchGit has no documented incident response procedure, no internal breach-detection mechanism, and no communication templates for breach notifications.

---

## 2. Applicable Law

| Law / Regulation | Article | Requirement |
|---|---|---|
| DSGVO 2016/679 | Art. 33 Abs. 1 | Notify supervisory authority within 72 hours of becoming aware |
| DSGVO 2016/679 | Art. 33 Abs. 2 | If processor discovers breach, notify controller without undue delay |
| DSGVO 2016/679 | Art. 33 Abs. 3 | Content of notification (nature, categories, approx. count, consequences, measures) |
| DSGVO 2016/679 | Art. 33 Abs. 4 | May be phased notifications; must document reasons for delay |
| DSGVO 2016/679 | Art. 34 Abs. 1 | Notify affected data subjects if breach is likely to result in high risk |
| DSGVO 2016/679 | Art. 34 Abs. 3 | Exceptions to subject notification (encryption, remediation, disproportionate effort) |
| DSGVO 2016/679 | Art. 83 Abs. 4 | Fine for failure to notify: up to €10M or 2% global turnover |

---

## 3. Current State

- No documented incident response or breach response plan.
- `public/.well-known/security.txt` exists but contains placeholder `example.com` values (see GAP-011).
- Server-side logging uses Pino (structured, machine-readable) – usable for breach detection.
- Activity logs via P074 (RoomEvent model) retain 90 days of events – useful for post-breach forensics.
- No alerting, no monitoring integration documented.

---

## 4. What Needs to Be Done

### 4.1 Define Data Breach Response Procedure

Create an internal **Incident Response Procedure** document (can be stored in `docs/` or a private ops wiki):

#### Scope

A **personal data breach** (Art. 4 Nr. 12 DSGVO) means a breach of security leading to accidental or unlawful:
- **Destruction** of personal data
- **Loss** of personal data
- **Alteration** of personal data
- **Unauthorised disclosure** of personal data
- **Access** to personal data

#### Response Steps

| Step | Timeframe | Action |
|---|---|---|
| 1. Detect & contain | Immediately | Isolate affected systems; revoke compromised credentials |
| 2. Assess severity | Within 24 hours | Determine data categories, number of affected users, likely consequences |
| 3. Document | Within 24 hours | Record: when discovered, what happened, data categories, approx. number of records |
| 4. Notify supervisory authority | **Within 72 hours** of becoming aware | File report with BfDI / relevant Landesbehörde (see section 4.2) |
| 5. Assess subject notification | After authority notification | Determine if high risk to individuals exists (see Art. 34) |
| 6. Notify affected users | Without undue delay | If high risk exists (see section 4.3) |
| 7. Document & remediate | Ongoing | Internal breach register (Art. 33 Abs. 5); implement fixes |

### 4.2 Supervisory Authority Notification (Art. 33)

**Primary contact:**

```
Bundesbeauftragter für den Datenschutz und die Informationsfreiheit (BfDI)
Online-Meldung: https://www.bfdi.bund.de/
Notfall-Kontakt: +49 228 997799-0
Postanschrift: Husarenstraße 30, 53117 Bonn
```

> **Note:** Use the Landesbehörde (state DPA) if the company is registered in a specific German state. For most federal/online services, the BfDI is the primary authority.

**Notification must include (Art. 33 Abs. 3):**

1. Nature of the breach (unauthorised access, accidental loss, etc.)
2. Categories and approximate number of data subjects affected
3. Categories and approximate number of personal data records affected
4. Name and contact details of the data protection officer (or privacy contact)
5. Likely consequences of the breach
6. Measures taken or proposed to address the breach

**If 72-hour deadline cannot be met:** Notify as soon as possible and state the reasons for the delay (Art. 33 Abs. 4 allows phased notification).

### 4.3 Subject Notification (Art. 34)

Notify affected users directly **without undue delay** when the breach is likely to result in a **high risk** to their rights and freedoms.

**High-risk scenarios:**
- Full database dump exposed (includes email addresses + argon2id hashes)
- OAuth tokens leaked (allows account hijacking)
- Password reset tokens leaked (allows account takeover within 24 hours)

**Notification content (Art. 34 Abs. 2):**
- Plain-language description of the breach
- Contact details of the privacy officer
- Likely consequences
- Measures taken/proposed

**Channel:** Email to affected users' registered email address (use Resend).

**Exceptions (Art. 34 Abs. 3):**
- Data was encrypted with state-of-the-art encryption (argon2id passwords qualify; OAuth tokens do not if stored in plaintext – see GAP-014)
- Measures have been taken that render high risk unlikely (e.g., compromised tokens revoked within minutes)

### 4.4 Breach Register (Art. 33 Abs. 5)

The controller must maintain a **internal breach register** regardless of whether external notification is required. Each entry must document:
- Date and time of discovery
- Date and time breach occurred (if known)
- Description of the breach
- Data categories and estimated number of records
- Whether Art. 33 notification was made (and if not, why not)
- Whether Art. 34 notification was made (and if not, why not)
- Remediation measures taken

**Implementation:** A simple spreadsheet or private repository document is sufficient for small operators.

### 4.5 Technical Breach Detection

Implement minimal alerting to detect breaches faster:

- **Failed login rate spike:** Already partially covered by rate limiting. Consider alerting when rate-limit thresholds are repeatedly triggered from many different IPs (distributed brute-force).
- **Unusual data access patterns:** Monitor for bulk exports or unusual query patterns in slow-query log.
- **Dependency vulnerability scanning:** Run `npm audit` in CI/CD pipeline; GitHub Dependabot alerts.
- **Server error logs:** Set up log aggregation (e.g., Grafana Loki, self-hosted) to alert on 5xx error spikes.

### 4.6 Processor Obligations

Each AVV (GAP-005) must require processors (Resend, hosting provider) to:
- Notify SketchGit of any breach **without undue delay** (Art. 28 Abs. 3 lit. f)
- Provide sufficient information for SketchGit to fulfill Art. 33 notification

---

## 5. Severity Classification Guide

| Severity | Examples | Notification Required |
|---|---|---|
| Low | Accidental log entry with email; immediately purged; no external access | Internal record only |
| Medium | Buggy API response exposes one user's display name to another user | Internal record; assess Art. 34; likely no authority notification |
| High | Database backup accessible without auth for <1 hour; no evidence of access | Art. 33 notification within 72 hours; assess Art. 34 |
| Critical | Database dump confirmed downloaded; OAuth tokens or reset tokens exposed | Art. 33 within 72 hours; Art. 34 user notification required |

---

## 6. Verification

1. Internal breach response procedure document exists and is accessible to the operator.
2. BfDI contact information is documented.
3. Breach register template exists.
4. Each AVV with processors includes Art. 28 Abs. 3 lit. f breach notification requirement.
5. `security.txt` contains correct contact information (see GAP-011).
