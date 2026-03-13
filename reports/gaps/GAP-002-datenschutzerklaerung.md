# GAP-002 – Datenschutzerklärung (Privacy Policy)

**Status:** ❌ Open  
**Priority:** 🔴 Critical  
**Category:** DSGVO / GDPR  
**Effort Estimate:** 4–8 hours  

---

## 1. Description

The application collects, processes, and stores personal data of registered users (email address, display name, password hash, OAuth tokens) and of anonymous users (display name in localStorage). Under Articles 13 and 14 DSGVO (GDPR), a comprehensive, plain-language privacy policy must be provided at the time data is collected. Currently no privacy policy exists at any URL in the application.

---

## 2. Applicable Law

| Law / Regulation | Paragraph / Article | Requirement |
|---|---|---|
| DSGVO (EU) 2016/679 | Art. 13 | Information when data is collected directly from the data subject |
| DSGVO (EU) 2016/679 | Art. 14 | Information when data is obtained from third parties (GitHub OAuth) |
| DSGVO (EU) 2016/679 | Art. 12 | Transparency principle – plain language, concise, easily accessible |
| DDG | § 13 | Additional transparency obligations for telemedia services |
| BDSG 2018 | § 32 | Supplementary German rules for employee/user data |

---

## 3. Current State

- No `/privacy` or `/datenschutz` route exists.
- No link to a privacy policy from any page, registration form, or account-deletion flow.
- The registration form (`app/[locale]/auth/register/page.tsx`) collects an email address and password without presenting or linking to a privacy policy – this violates Art. 13 DSGVO requirement to inform at the time of collection.

---

## 4. Risk

| Risk | Detail |
|---|---|
| **Regulatory fine** | Art. 83 DSGVO: up to €20,000,000 or 4% of global annual turnover, whichever is higher |
| **BfDI / LfDI investigation** | German DPAs actively investigate complaints; a complaint from a single user can trigger a formal audit |
| **Abmahnung** | Consumer-protection organisations (e.g., Verbraucherzentrale) may issue cease-and-desist letters |
| **Invalid consent** | Any opt-in or marketing activity is void without a valid privacy policy |

---

## 5. What Needs to Be Done

### 5.1 Create the Privacy Policy Page

Create `app/[locale]/privacy/page.tsx` rendering a static server component.

### 5.2 Mandatory Content (Art. 13/14 DSGVO)

Each section below maps to a required disclosure:

#### 5.2.1 Identity and Contact Details of the Controller (Art. 13 Abs. 1 lit. a)

```
Verantwortlicher im Sinne der DSGVO:
[Name / Firmenname]
[Adresse]
E-Mail: [datenschutz@example.com]
```

#### 5.2.2 Contact Details of the Data Protection Officer (Art. 13 Abs. 1 lit. b)

A **DPO is mandatory** only if the operator processes personal data on a large scale or regularly. For a private operator or small company, it is optional but recommended.  
If no DPO is appointed, state: "Ein Datenschutzbeauftragter ist nicht benannt."

#### 5.2.3 Processing Activities, Purpose, and Legal Basis (Art. 13 Abs. 1 lit. c)

| Processing Activity | Data Categories | Purpose | Legal Basis (DSGVO) |
|---|---|---|---|
| User account creation | Email, display name, password hash | Authentication and access control | Art. 6 Abs. 1 lit. b (contract performance) |
| Session management | Session JWT in cookie (`authjs.session-token`) | Maintain authenticated state | Art. 6 Abs. 1 lit. b |
| Password reset | Email address | Allow users to recover accounts | Art. 6 Abs. 1 lit. b |
| GitHub OAuth | Email, OAuth tokens from GitHub | Third-party authentication | Art. 6 Abs. 1 lit. b |
| Room activity log | User ID, IP address, event type | Security audit trail, fraud prevention | Art. 6 Abs. 1 lit. f (legitimate interest) |
| Email delivery via Resend | Email address, reset link | Transactional email | Art. 6 Abs. 1 lit. b; Resend as processor (Art. 28) |
| Anonymous use | Display name (localStorage only) | Canvas collaboration | No server processing; no legal basis required |

#### 5.2.4 Legitimate-Interest Balancing (Art. 13 Abs. 1 lit. d)

Where Art. 6 Abs. 1 lit. f (legitimate interest) is used (activity log), document:
- **Interest:** Security monitoring and prevention of abuse.
- **Necessity:** Minimal data (user ID, event type, timestamp) for 90 days.
- **Balancing:** User interests do not override – data is not shared, is automatically deleted, and is not used for profiling.

#### 5.2.5 Recipients / Third-Party Processors (Art. 13 Abs. 1 lit. e)

| Recipient | Data Shared | Purpose | DPA Reference |
|---|---|---|---|
| Resend (if configured) | Email address | Password reset emails | [Resend DPA](https://resend.com/legal/dpa) |
| GitHub (if OAuth enabled) | OAuth flow data | Third-party authentication | [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) |
| Hosting provider (e.g., Hetzner, IONOS) | All data | Infrastructure/hosting | Must conclude DPA with host |

#### 5.2.6 Retention Periods (Art. 13 Abs. 2 lit. a)

| Data | Retention |
|---|---|
| User account (email, name, password hash) | Until account deletion |
| OAuth tokens | Until account deletion or OAuth disconnect |
| Session cookies | 30 days (sliding) |
| Activity/event logs | 90 days (configurable via `ROOM_EVENT_RETENTION_DAYS`) |
| Canvas/drawing data | Until room deletion |
| Password reset tokens | 24 hours after issuance |

#### 5.2.7 User Rights (Art. 13 Abs. 2 lit. b, Art. 15–22)

Explicitly list:

- **Art. 15** – Right of access (Auskunftsrecht)
- **Art. 16** – Right to rectification (Recht auf Berichtigung)
- **Art. 17** – Right to erasure / "Right to be forgotten" (Recht auf Löschung) → implemented via `DELETE /api/auth/account`
- **Art. 18** – Right to restriction of processing (Recht auf Einschränkung)
- **Art. 20** – Right to data portability (Recht auf Datenübertragbarkeit) → **not yet implemented** (see GAP-004)
- **Art. 21** – Right to object (Widerspruchsrecht) – applicable to Art. 6 lit. f processing
- **Art. 77** – Right to lodge a complaint with a supervisory authority

**Supervisory authority contact:**

```
Der Bundesbeauftragte für den Datenschutz und die Informationsfreiheit (BfDI)
Husarenstraße 30
53117 Bonn
poststelle@bfdi.bund.de
```

(or the relevant Landesbehörde based on the operator's place of business)

#### 5.2.8 Cookie Notice

| Cookie | Type | Duration | Necessity |
|---|---|---|---|
| `authjs.session-token` | HttpOnly, Secure, SameSite=Lax JWT | 30 days | Essential – authentication |
| `THEME` | Plain text, browser session | Session | Functional – user preference |

Since both cookies are **strictly necessary** (authentication and explicit user preference), consent under TTDSG § 25 Abs. 2 is not required. However, their existence must be disclosed in the privacy policy (see also GAP-003).

#### 5.2.9 localStorage Disclosure

Anonymous users' display names and colour preferences are stored in `localStorage`. This must be disclosed:

> "Für nicht angemeldete Nutzer speichert die Anwendung den gewählten Anzeigenamen und Farbpräferenzen ausschließlich im lokalen Browserspeicher (localStorage) Ihres Endgeräts. Diese Daten werden nicht an den Server übermittelt und nicht von uns verarbeitet."

#### 5.2.10 No Automated Decision-Making (Art. 22)

State explicitly: "Es findet keine automatisierte Entscheidungsfindung oder Profiling im Sinne von Art. 22 DSGVO statt."

---

## 6. Link Requirements

The privacy policy link must appear:
1. In the persistent site footer (on every page, including the canvas `/`)
2. On the registration form (`/auth/register`) – before the submit button, with explicit reference
3. In any marketing emails (Resend password-reset emails)

---

## 7. Implementation Notes

- The privacy policy must be **in German** for German-speaking users. An English translation may be provided additionally.
- Use a **server component** without client-side interactivity.
- Do **not** set `noindex` on this page.
- Date the policy ("Stand: [Datum]") and update the date whenever content changes.
- Consider using a generator like [Datenschutz-Generator.de](https://datenschutz-generator.de/) for the initial draft, then adapt to the specific data flows of SketchGit.

---

## 8. Verification

1. Navigate to `/privacy` – HTTP 200, full policy visible.
2. Registration form at `/auth/register` contains a link to `/privacy`.
3. Every page has a footer link to `/privacy`.
4. Policy is audited against the actual data flows documented in this gap report.
