# GAP-013 – IT-Sicherheit (IT Security / NIS2 / BSI IT-Grundschutz)

**Status:** ⚠️ Partial  
**Priority:** 🟠 High  
**Category:** IT Security / DSGVO Art. 32 / NIS2  
**Effort Estimate:** 8–16 hours (documentation + partial implementation)  

---

## 1. Description

Article 32 DSGVO requires the controller to implement appropriate technical and organisational security measures (TOMs) proportionate to the risk. The NIS2 Directive (EU 2022/2555), transposed into German law via the **NIS2UmsuCG (NIS-2-Umsetzungs- und Cybersicherheitsstärkungsgesetz)**, requires certain organisations to implement security measures and report incidents. Additionally, BSI IT-Grundschutz provides practical guidance for German operators.

SketchGit has strong security foundations but lacks documentation and several operational security controls.

---

## 2. Applicable Law

| Law / Regulation | Paragraph / Article | Requirement |
|---|---|---|
| DSGVO 2016/679 | Art. 32 | Appropriate TOMs: encryption, pseudonymisation, confidentiality, integrity, availability, resilience |
| DSGVO 2016/679 | Art. 32 Abs. 2 | Risk-based approach (risk to natural persons) |
| NIS2 Directive (EU) 2022/2555 | Art. 21 | Security measures for essential/important entities |
| NIS2UmsuCG (BSIG-Novelle) | §§ 28–30 | German implementation of NIS2 (effective Oct 2024) |
| BSI-Gesetz (BSIG) | §§ 8a, 8b | KRITIS security requirements (threshold: 500K users) |
| ISO/IEC 27001:2022 | All controls | Industry-standard ISMS framework |
| BSI IT-Grundschutz | OPS.* Bausteine | German practical security guidance |

### NIS2 Scope Assessment

NIS2 (§ 28 BSIG-Novelle) applies to:
- **Essential entities:** e.g., energy, transport, banking, health, digital infrastructure >€10M turnover
- **Important entities:** e.g., digital providers, postal services, food, manufacturing >€10M turnover or >50 employees

**Conclusion:** For a privately operated small application, NIS2 likely does **not** apply directly. However, if the operator is a legal entity offering digital services commercially exceeding €10M revenue or 50 employees, NIS2 obligations apply. The Art. 32 DSGVO requirement applies regardless of NIS2 scope.

---

## 3. Current Security Posture

### Implemented (Strengths)

| Security Control | Status | Details |
|---|---|---|
| Password hashing | ✅ Excellent | Argon2id (m=65536, t=3, p=4) – OWASP RFC 9106 compliant |
| Timing-attack protection | ✅ Implemented | Dummy hash for non-existent users |
| Legacy bcrypt re-hash | ✅ Implemented | Transparent upgrade on login |
| HTTPS/TLS | ✅ Required | HSTS configured (max-age=63072000) |
| CSP headers | ✅ Implemented | Nonce-based, no `unsafe-inline` |
| Security headers | ✅ Implemented | X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| Session cookies | ✅ Appropriate | HttpOnly, Secure, SameSite=Lax |
| Rate limiting | ✅ Implemented | 10 req/60s per IP on auth endpoints (Redis-backed) |
| RBAC | ✅ Implemented | OWNER/EDITOR/VIEWER roles per room |
| WebSocket auth | ✅ Implemented | Token validation on connection upgrade |
| Invitation tokens | ✅ Implemented | Signed HMAC tokens with expiry |
| Input validation | ✅ Implemented | Zod schemas on all API routes |
| SQL injection | ✅ N/A | Prisma ORM with parameterised queries |

### Gaps

| Security Control | Status | Risk |
|---|---|---|
| OAuth tokens at rest unencrypted | ❌ Gap | Tokens allow account takeover if DB compromised (see GAP-014) |
| No database encryption at rest | ⚠️ Depends on hosting | Mitigated if hosting provider enables disk encryption |
| No formal TOM documentation | ❌ Gap | Required for DSGVO Art. 32 compliance |
| No penetration test | ❌ Gap | Undetected vulnerabilities |
| Dependency vulnerability scanning | ⚠️ Manual | `npm audit` not in automated CI pipeline |
| Security incident response plan | ❌ Gap | See GAP-007 |
| No Content Security Policy reporting | ⚠️ Partial | CSP set but no `report-uri` for violation alerts |
| `AUTH_SECRET` rotation procedure | ❌ Not documented | If AUTH_SECRET is leaked, all sessions compromised |
| No multi-factor authentication | ❌ Gap | Passwords only; no TOTP or passkeys |

---

## 4. What Needs to Be Done

### 4.1 Document Technical and Organisational Measures (TOMs)

Create a TOM document (internal, not public) covering all Art. 32 categories:

**Template TOM Document:**

```markdown
# Technische und Organisatorische Maßnahmen (Art. 32 DSGVO)
Stand: [Datum]

## 1. Vertraulichkeit
- Zugangskontrolle: Rollenbasierte Zugriffskontrolle (OWNER/EDITOR/VIEWER)
- Passwort-Sicherheit: Argon2id-Hashing
- Verschlüsselung in Transit: TLS 1.2+ (HSTS)
- Rate Limiting: 10 Anfragen/60s pro IP auf Authentifizierungs-Endpunkten

## 2. Integrität
- Eingabevalidierung: Zod-Schemas auf allen API-Routen
- SQL-Injection-Schutz: Prisma ORM mit parametrisierten Abfragen
- Signierte Einladungstoken (HMAC)
- Nonce-basierte Content Security Policy

## 3. Verfügbarkeit
- Tägliche Datenbankbackups (abhängig vom Hosting-Anbieter)
- Activity-Event-Log für Forensik (90 Tage)

## 4. Belastbarkeit (Resilience)
- Redis Pub/Sub für horizontale Skalierung
- Raumkapazitätslimit (MAX_CLIENTS_PER_ROOM)

## 5. Wiederherstellung
- Datenbankbackups: [Häufigkeit, Aufbewahrung, Test-Wiederherstellung]
- Recovery Time Objective (RTO): [definieren]
- Recovery Point Objective (RPO): [definieren]

## 6. Regelmäßige Überprüfung
- Jährliche Überprüfung dieser TOMs
- Dependency-Scanning: npm audit (bei jeder Deployment)
```

### 4.2 Enable CSP Reporting

Add a `report-uri` or `report-to` directive to the Content-Security-Policy header in `proxy.ts` to receive violation reports:

```typescript
// In proxy.ts, add to CSP header:
// report-uri /api/csp-report
// OR (modern):
// report-to csp-violations-endpoint
```

Create a simple `POST /api/csp-report` endpoint that logs CSP violations. This helps detect XSS attempts in production.

### 4.3 Dependency Vulnerability Scanning in CI

Add `npm audit --audit-level=high` to the CI/CD pipeline (e.g., GitHub Actions workflow) to block deployments with known high-severity vulnerabilities.

### 4.4 AUTH_SECRET Rotation Procedure

Document a procedure for rotating `AUTH_SECRET`:

1. Generate a new 32+ character random secret.
2. Update the environment variable on all instances simultaneously.
3. **All existing sessions are immediately invalidated** (users must log in again).
4. Communicate to users if needed (planned maintenance window).

Consider implementing a **dual-secret validation window** to allow gradual rollout, though this adds complexity.

### 4.5 Multi-Factor Authentication (MFA) – Recommended

While not legally required, MFA significantly reduces the risk of account takeover:

- Add TOTP (Time-based One-Time Password) support via a library like `otplib`.
- Store the TOTP secret encrypted in the `User` model.
- Integrate into the NextAuth credential flow.

For registered users, provide TOTP as an optional security enhancement.

### 4.6 Annual Penetration Test

Before production launch and annually thereafter, conduct a penetration test:
- Either with a professional third party (BSI-certified pen tester)
- Or with automated tools (OWASP ZAP, Burp Suite Community)

At minimum, test:
- Authentication bypass
- IDOR (Insecure Direct Object Reference) on room/commit APIs
- WebSocket authentication bypass
- XSS in canvas text objects
- CSRF on state-changing API calls

### 4.7 Backup and Recovery Testing

Verify and document:
- Database backup frequency (daily minimum)
- Backup retention (minimum 30 days)
- Backup encryption
- Restore testing (quarterly)
- Off-site backup copy (e.g., different region or provider)

---

## 5. OWASP Top 10 Assessment

| OWASP Risk | Status | Notes |
|---|---|---|
| A01 Broken Access Control | ✅ Mitigated | RBAC + session validation |
| A02 Cryptographic Failures | ⚠️ Partial | Argon2id ✅; OAuth tokens at rest ❌ (GAP-014) |
| A03 Injection | ✅ Mitigated | Prisma ORM; Zod validation |
| A04 Insecure Design | ✅ Generally sound | Review invitation token expiry |
| A05 Security Misconfiguration | ⚠️ Partial | CSP configured; `security.txt` placeholder (GAP-011) |
| A06 Vulnerable Components | ⚠️ Partial | No automated dependency scanning |
| A07 Identification/Auth Failures | ⚠️ Partial | Rate limiting ✅; no MFA ❌ |
| A08 Software/Data Integrity | ✅ Mitigated | CSP nonce; signed invitation tokens |
| A09 Security Logging & Monitoring | ⚠️ Partial | Activity log ✅; no alerting ❌ |
| A10 SSRF | ✅ Low risk | No user-controlled URL fetching identified |

---

## 6. Verification

1. TOM document exists, dated, and reviewed annually.
2. `npm audit --audit-level=high` passes in CI pipeline.
3. CSP violation reporting endpoint active in production.
4. Database backups verified by restore test.
5. Penetration test conducted before launch; findings remediated or accepted with justification.
