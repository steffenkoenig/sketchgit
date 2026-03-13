# GAP-003 – TTDSG § 25 – Einwilligung für Cookies und lokale Speicherung

**Status:** ⚠️ Partial  
**Priority:** 🟠 High  
**Category:** TTDSG / ePrivacy  
**Effort Estimate:** 2–4 hours  

---

## 1. Description

The Telekommunikation-Telemedien-Datenschutz-Gesetz (TTDSG) § 25 (which implements the EU ePrivacy Directive 2002/58/EC Art. 5(3)) requires **prior informed consent** before storing information on or reading information from a user's terminal equipment, unless the storage or access is **strictly necessary** for a service explicitly requested by the user.

SketchGit sets two cookies and uses `localStorage`. This gap analyses whether consent is required and what disclosure obligations apply regardless.

---

## 2. Applicable Law

| Law / Regulation | Paragraph / Article | Requirement |
|---|---|---|
| TTDSG 2021 | § 25 Abs. 1 | Prior consent required for non-essential terminal storage/access |
| TTDSG 2021 | § 25 Abs. 2 Nr. 2 | Exception: storage strictly necessary for a service explicitly requested |
| EU ePrivacy Directive 2002/58/EC | Art. 5 Abs. 3 | Same rule at EU level (directly applicable via TTDSG) |
| DSGVO 2016/679 | Art. 6, Art. 7 | Consent standards (freely given, specific, informed, unambiguous) |
| DSGVO 2016/679 | Art. 13 | Disclosure of cookies/storage in privacy policy |

---

## 3. Current State

### Cookies Set by the Application

| Cookie Name | Set by | Content | HttpOnly | Secure | SameSite | Duration |
|---|---|---|---|---|---|---|
| `authjs.session-token` | NextAuth (server) | Signed JWT (user ID, email, name) | ✅ Yes | ✅ Yes | Lax | 30 days |
| `THEME` | Client-side JS | `"dark"` or `"light"` | ❌ No | ❌ No | Not set | Session |

### localStorage Used by the Application

| Key | Content | Set When |
|---|---|---|
| `sketchgit_name` | Anonymous display name string | User enters name in name-modal |
| `sketchgit_color` | Hex colour string | User selects colour |
| `sketchgit_lastRoom` | Last visited room ID | On room join |
| `sketchgit_lastBranch` | Last visited branch name | On branch checkout |

### No Consent Mechanism

- No cookie consent banner is shown.
- No cookie preference centre exists.
- No consent is recorded.

---

## 4. Legal Analysis

### 4.1 Session Cookie `authjs.session-token`

**Classification:** Strictly necessary for authentication.

The session cookie is set only after the user explicitly clicks "Sign in" or "Register". It is required to deliver the authenticated service. This falls squarely within **TTDSG § 25 Abs. 2 Nr. 2** (necessary to carry out a communication or provide a service explicitly requested).

**Consent required:** ❌ No  
**Action required:** Disclose in privacy policy (see GAP-002, section 5.2.8)

### 4.2 Theme Cookie `THEME`

**Classification:** Functional/preference cookie – **borderline case**.

- Set by client-side JavaScript when the user actively clicks the theme-toggle button.
- Stores only a UI preference, not personal data.
- Survives only for the browser session.

German DPA (DSK) guidance and EDPB Opinion 5/2019 indicate that cookies storing **explicit user preferences** (e.g., language, theme chosen by the user) can qualify as "strictly necessary for a service requested by the user" **if and only if** the user actively triggered the setting. Since the theme toggle requires an explicit user action, this is defensible under § 25 Abs. 2 Nr. 2.

**Risk:** Low, but the cookie should be documented clearly in the privacy policy.

**Consent required:** ❌ Likely not, given explicit user action  
**Action required:** Document in privacy policy; annotate with duration and purpose

### 4.3 localStorage Entries

**Classification:** Strictly necessary / functional.

- `sketchgit_name`: Set only when the user explicitly enters their name in the name modal. Enables the app to remember the name across sessions. No personal data is sent to the server.
- `sketchgit_color`, `sketchgit_lastRoom`, `sketchgit_lastBranch`: Pure preferences/state, set in response to explicit user actions.

Because these are all initiated by explicit user actions and do not transmit data to any server, they are **strictly necessary** under § 25 Abs. 2 Nr. 2.

**Consent required:** ❌ No  
**Action required:** Disclose in privacy policy (see GAP-002, section 5.2.9)

---

## 5. What Needs to Be Done

### 5.1 No Consent Banner Required (Current Scope)

Based on the current cookie and localStorage inventory, **no consent banner is legally required** as long as no third-party cookies or non-essential cookies are introduced.

> ⚠️ **Important:** This assessment is only valid as long as the application does not add analytics, advertising, social sharing widgets, or any third-party scripts that access terminal equipment. If any such feature is introduced, a consent management platform (CMP) must be added simultaneously.

### 5.2 Required: Cookie Disclosure in Privacy Policy

The privacy policy (GAP-002) must contain a dedicated cookie table (section 5.2.8 in that gap) listing:
- Cookie name
- Type (first-party / session)
- Duration
- Purpose
- Legal basis under § 25 TTDSG

### 5.3 Required: Cookie Disclosure Banner (Informational)

Even where consent is not required, a brief **informational notice** (not an opt-in banner) is considered best practice by the German DPA (DSK). This can be a simple footer note:

> "Diese Website verwendet ausschließlich technisch notwendige Cookies. Eine Einwilligung ist nicht erforderlich."

### 5.4 localStorage Clearance on Account Deletion

When a user deletes their account (`DELETE /api/auth/account`), the client-side `localStorage` entries should be cleared. This is a data minimisation measure (DSGVO Art. 5 Abs. 1 lit. e) rather than a strict legal requirement, but it is good practice.

Implementation: After the successful account deletion API response, call `localStorage.removeItem()` for all `sketchgit_*` keys before redirecting.

---

## 6. Future Risk – Analytics or Third-Party Scripts

If the following features are **ever added**, a full CMP must be implemented before launch:

- Google Analytics / Plausible / Matomo (cloud) → consent required
- Google Fonts (loaded from Google CDN) → consent required (DSGVO transfer + TTDSG)
- YouTube/Vimeo embeds → consent required
- Social media sharing buttons → consent required
- Sentry (cloud error tracking) → assess whether it processes PII in logs

> Using **self-hosted** analytics (Matomo on own server), **local** Google Fonts copies, and **self-hosted** error tracking avoids consent requirements.

---

## 7. Verification

1. Open browser DevTools → Application → Cookies: only `authjs.session-token` and `THEME` present (no third-party cookies).
2. Open DevTools → Application → Local Storage: only `sketchgit_*` keys present.
3. Privacy policy contains accurate cookie table.
4. No Google Fonts CDN requests or third-party script loads in network tab.
