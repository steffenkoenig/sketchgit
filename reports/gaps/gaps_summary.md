# SketchGit – Compliance Gap Summary (German / EU Law)

**Last Updated:** 2026-03-13  
**Scope:** German and European legal requirements applicable to a web application hosted and operated in Germany  
**Application Version:** Based on current codebase analysis (March 2026)  
**Operator Jurisdiction:** Federal Republic of Germany

---

## Overall Risk Assessment

| Risk Level | Count | Gaps |
|---|---|---|
| 🔴 Critical | 4 | GAP-001, GAP-002, GAP-004, GAP-005 |
| 🟠 High | 9 | GAP-003, GAP-006, GAP-007, GAP-008, GAP-009, GAP-010, GAP-011, GAP-012, GAP-013 |
| 🟡 Medium | 2 | GAP-014, GAP-015 |
| ✅ Resolved | 0 | — |

---

## Gap Registry

| ID | Title | Law | Priority | Status | Effort |
|---|---|---|---|---|---|
| [GAP-001](GAP-001-impressumspflicht.md) | Impressumspflicht (Legal Notice) | DDG § 5 | 🔴 Critical | ❌ Open | 2–4 h |
| [GAP-002](GAP-002-datenschutzerklaerung.md) | Datenschutzerklärung (Privacy Policy) | DSGVO Art. 13/14 | 🔴 Critical | ❌ Open | 4–8 h |
| [GAP-003](GAP-003-ttdsg-cookie-consent.md) | TTDSG § 25 – Cookie/localStorage Consent | TTDSG § 25 | 🟠 High | ⚠️ Partial | 2–4 h |
| [GAP-004](GAP-004-betroffenenrechte.md) | DSGVO Betroffenenrechte (Data Subject Rights) | DSGVO Art. 15–22 | 🔴 Critical | ⚠️ Partial | 8–16 h |
| [GAP-005](GAP-005-auftragsverarbeitungsvertraege.md) | Auftragsverarbeitungsverträge (DPAs) | DSGVO Art. 28 | 🔴 Critical | ❌ Open | 2–4 h |
| [GAP-006](GAP-006-drittstaatentransfer.md) | Drittstaatentransfer (Third-Country Transfers) | DSGVO Art. 44–49 | 🟠 High | ❌ Open | 2–4 h |
| [GAP-007](GAP-007-datenpannenmeldung.md) | Datenpannenmeldung (Breach Notification) | DSGVO Art. 33/34 | 🟠 High | ❌ Open | 4–8 h |
| [GAP-008](GAP-008-verarbeitungsverzeichnis.md) | Verarbeitungsverzeichnis (Records of Processing) | DSGVO Art. 30 | 🟠 High | ❌ Open | 2–4 h |
| [GAP-009](GAP-009-bfsg-barrierefreiheit.md) | BFSG – Barrierefreiheit (Accessibility) | BFSG / EU 2019/882 | 🟠 High | ⚠️ Partial | 16–40 h |
| [GAP-010](GAP-010-agb-nutzungsbedingungen.md) | AGB / Nutzungsbedingungen (Terms of Service) | BGB § 305 ff. | 🟠 High | ❌ Open | 4–8 h |
| [GAP-011](GAP-011-security-txt.md) | security.txt Platzhalter | RFC 9116 | 🟠 High | ⚠️ Partial | 0.5 h |
| [GAP-012](GAP-012-datenlöschkonzept.md) | Datenlöschkonzept (Data Retention Policy) | DSGVO Art. 5 lit. e | 🟠 High | ⚠️ Partial | 4–8 h |
| [GAP-013](GAP-013-it-sicherheit.md) | IT-Sicherheit (IT Security / NIS2) | DSGVO Art. 32 | 🟠 High | ⚠️ Partial | 8–16 h |
| [GAP-014](GAP-014-oauth-token-speicherung.md) | OAuth-Token-Speicherung | DSGVO Art. 32 | 🟡 Medium | ❌ Open | 8–16 h |
| [GAP-015](GAP-015-dsa-digital-services-act.md) | DSA – Digital Services Act | DSA (EU) 2022/2065 | 🟡 Medium | ⚠️ Partial | 2–4 h |

---

## Implementation Status Tracker

Use the checkboxes below to track progress. Update this file as gaps are resolved.

### Phase 1 – Critical (Must complete before any public launch)

- [ ] **GAP-001** – Create `/impressum` page with operator name, address, email (DDG § 5)
- [ ] **GAP-002** – Create `/privacy` page covering all DSGVO Art. 13/14 requirements
- [ ] **GAP-002** – Add privacy policy link to registration form (`/auth/register`)
- [ ] **GAP-002** – Add footer with links to Impressum, Privacy Policy on all pages
- [ ] **GAP-004** – Provide privacy contact email for DSARs in privacy policy
- [ ] **GAP-005** – Conclude AVV with database hosting provider
- [ ] **GAP-005** – Conclude AVV with application hosting provider
- [ ] **GAP-005** – Conclude AVV with Resend (if `RESEND_API_KEY` is set)
- [ ] **GAP-010** – Create `/terms` page with basic ToS
- [ ] **GAP-011** – Replace all `example.com` placeholders in `security.txt`

### Phase 2 – High (Complete within 30 days of launch)

- [ ] **GAP-003** – Document all cookies and localStorage in privacy policy
- [ ] **GAP-004** – Implement `GET /api/auth/dsar` endpoint (Art. 15 + Art. 20)
- [ ] **GAP-004** – Implement email-change flow (Art. 16)
- [ ] **GAP-006** – Confirm all infrastructure uses EU regions (or document SCCs)
- [ ] **GAP-007** – Write internal incident response procedure
- [ ] **GAP-007** – Create breach register template
- [ ] **GAP-008** – Write Verarbeitungsverzeichnis (internal document)
- [ ] **GAP-009** – Create `/barrierefreiheit` accessibility statement page
- [ ] **GAP-012** – Implement expired password reset token cleanup job
- [ ] **GAP-012** – Verify activity event auto-deletion runs on schedule
- [ ] **GAP-013** – Write TOM (Technical and Organisational Measures) document
- [ ] **GAP-013** – Add `npm audit --audit-level=high` to CI pipeline
- [ ] **GAP-015** – Add DSA contact email to Impressum
- [ ] **GAP-015** – Add illegal content reporting channel to footer/ToS

### Phase 3 – Medium (Complete within 90 days)

- [ ] **GAP-004** – Add "Download My Data" button to dashboard
- [ ] **GAP-004** – Add Art. 21 objection mechanism for activity log processing
- [ ] **GAP-009** – Fix non-canvas WCAG 2.1 AA violations (skip link, contrast, focus)
- [ ] **GAP-012** – Define and implement inactive account policy
- [ ] **GAP-013** – Enable CSP violation reporting endpoint
- [ ] **GAP-013** – Conduct initial penetration test / security review
- [ ] **GAP-014** – Implement OAuth token encryption at rest (AES-256-GCM)
- [ ] **GAP-014** – Implement GitHub OAuth token revocation on account deletion

### Phase 4 – Ongoing / Best Practice

- [ ] **GAP-007** – Annual breach response procedure review
- [ ] **GAP-008** – Annual VVT review and update
- [ ] **GAP-009** – Formal WCAG 2.1 AA third-party audit
- [ ] **GAP-009** – Add automated accessibility testing to CI
- [ ] **GAP-013** – Annual penetration test
- [ ] **GAP-013** – Annual TOM review
- [ ] **GAP-015** – Annual DSA compliance review

---

## Strengths (Already Compliant)

The following areas are already correctly implemented and require no remediation:

| Area | Status | Reference |
|---|---|---|
| Password hashing (Argon2id) | ✅ OWASP compliant | `lib/db/userRepository.ts` |
| Right to erasure (Art. 17) | ✅ Implemented | `DELETE /api/auth/account` |
| HTTPS/TLS + HSTS | ✅ Configured | `proxy.ts` |
| Content Security Policy (nonce-based) | ✅ No unsafe-inline | `proxy.ts` |
| Security headers | ✅ Complete set | `proxy.ts` |
| Session cookies (HttpOnly, Secure, SameSite) | ✅ Appropriate | NextAuth config |
| Rate limiting on auth endpoints | ✅ Implemented | `proxy.ts` + Redis |
| Role-based access control (RBAC) | ✅ OWNER/EDITOR/VIEWER | `lib/db/roomRepository.ts` |
| Input validation (Zod) | ✅ All API routes | `lib/api/validate.ts` |
| SQL injection prevention | ✅ Prisma ORM | All DB queries |
| Timing-attack protection (auth) | ✅ Dummy hash | `lib/db/userRepository.ts` |
| Activity log retention (90 days) | ✅ Configurable | `ROOM_EVENT_RETENTION_DAYS` |
| No analytics / tracking | ✅ Privacy-friendly | No third-party scripts |
| German language support | ✅ Implemented | `messages/de.json` |
| Password reset token security | ✅ 256-bit, 24h expiry | `lib/server/passwordReset.ts` |
| WebSocket authentication | ✅ Token-validated | `server.ts` |

---

## Key Legal Contacts for Germany

| Organisation | Role | Contact |
|---|---|---|
| BfDI (Bundesbeauftragter für den Datenschutz) | National data protection authority | https://www.bfdi.bund.de |
| BSI (Bundesamt für Sicherheit in der Informationstechnik) | Cybersecurity authority | https://www.bsi.bund.de |
| Bundesnetzagentur | DSA national coordinator | https://www.bundesnetzagentur.de |
| EU DPA list | Supervisory authority by state | https://www.edpb.europa.eu/about-edpb/about-edpb/members_en |

### Relevant Landesbehörden (State DPAs – depending on operator's registered state)

| State | Authority |
|---|---|
| Bayern | Bayerisches Landesamt für Datenschutzaufsicht (BayLDA) |
| Baden-Württemberg | Landesbeauftragte für Datenschutz und Informationsfreiheit (LfDI BW) |
| Berlin | Berliner Beauftragte für Datenschutz und Informationsfreiheit |
| Hamburg | Hamburgische Beauftragte für Datenschutz und Informationsfreiheit |
| NRW | Landesbeauftragte für Datenschutz und Informationsfreiheit NRW |
| (All others) | See BfDI for full list |

---

## Recommended Legal Resources

| Resource | Purpose | URL |
|---|---|---|
| eRecht24 | German legal templates (Impressum, ToS, Privacy Policy) | https://www.e-recht24.de |
| IT-Recht Kanzlei | Regularly updated legal templates | https://www.it-recht-kanzlei.de |
| Datenschutz-Generator.de | DSGVO privacy policy generator | https://datenschutz-generator.de |
| LfDI Baden-Württemberg Guide | Practical DSGVO guidance | https://www.baden-wuerttemberg.datenschutz.de |
| EDPB Guidelines | Official EU data protection guidance | https://www.edpb.europa.eu/our-work-tools/general-guidance/guidelines-recommendations-best-practices_en |
| BSI IT-Grundschutz | German IT security framework | https://www.bsi.bund.de/grundschutz |
| BFSG Implementation Guide | German accessibility law guidance | https://www.bmas.de/bfsg |

---

## Changelog

| Date | Change | Author |
|---|---|---|
| 2026-03-13 | Initial gap analysis created (GAP-001 through GAP-015) | Copilot Agent |
