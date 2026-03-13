# GAP-006 – Drittstaatentransfer (Third-Country Data Transfers)

**Status:** ❌ Open  
**Priority:** 🔴 Critical  
**Category:** DSGVO / GDPR  
**Effort Estimate:** 2–4 hours (contractual/architectural)  

---

## 1. Description

Articles 44–49 DSGVO restrict the transfer of personal data to countries outside the EU/EEA unless an adequate transfer mechanism is in place. SketchGit integrates with external services (Resend, GitHub OAuth, optionally Redis hosting) that may process data in non-EU countries, primarily the United States. An adequate transfer mechanism must be documented and disclosed in the privacy policy (GAP-002).

---

## 2. Applicable Law

| Law / Regulation | Article | Requirement |
|---|---|---|
| DSGVO 2016/679 | Art. 44 | General principle: transfers only with adequate protection |
| DSGVO 2016/679 | Art. 45 | Transfer with adequacy decision |
| DSGVO 2016/679 | Art. 46 | Transfer with Standard Contractual Clauses (SCCs) |
| DSGVO 2016/679 | Art. 49 | Derogations (user consent, contract necessity) |
| DSGVO 2016/679 | Art. 83 Abs. 5 | Fine: up to €20M or 4% global turnover |
| EU-US Data Privacy Framework | Commission Decision (EU) 2023/1795 | Adequacy for US certified organisations |

---

## 3. Current Data Transfer Analysis

### 3.1 Resend (Email Service)

- **Location:** US-based company (Delaware incorporation; servers in US)
- **Data transferred:** User email addresses, password reset links
- **Transfer mechanism:** Resend is certified under the **EU-US Data Privacy Framework (DPF)** as of October 2023.
  - Check current certification: [privacyshield.gov](https://www.privacyshield.gov/ps/search) (DPF successor)
  - Resend also offers EU-region infrastructure (optional)
- **DPA:** Resend provides a GDPR-compliant DPA (Art. 28 + SCCs)
- **Action:** Conclude Resend DPA (see GAP-005); verify DPF certification is current; optionally configure Resend EU region to avoid transfer entirely

### 3.2 GitHub OAuth (Independent Controller)

- **Location:** US-based (GitHub Inc., subsidiary of Microsoft)
- **Data transferred:** OAuth flow data; GitHub controls what data it receives
- **Transfer mechanism:** GitHub is certified under the **EU-US Data Privacy Framework** and offers [Privacy Shield/SCCs](https://docs.github.com/en/site-policy/privacy-policies/github-data-protection-agreement)
- **Role:** Independent controller (not a processor for SketchGit) → AVV not required
- **Action:** Disclose in privacy policy that GitHub processes data independently when OAuth is used

### 3.3 Hosting Provider

- **Location:** Depends on deployment choice.
  - If Hetzner: all servers in Germany (Nuremberg/Falkenstein) → **no transfer**
  - If AWS Frankfurt (eu-central-1): data stays in EU → **no transfer** (but AWS corporate is US-based; EU region processing agreement still required)
  - If US-based hosting (Vercel, Render, Fly.io US regions): **transfer occurs**
- **Action:** Use EU-based hosting or ensure SCCs are in place

### 3.4 Redis Hosting

- **Location:** Depends on provider
  - Upstash EU region: Frankfurt → **no transfer**
  - Redis Cloud EU region: Frankfurt → **no transfer**
  - US region: transfer occurs; DPF certification required
- **Note:** Redis stores rate-limiter counters (IP addresses) and pub/sub channel data. IP addresses are personal data under DSGVO.
- **Action:** Always use EU-region Redis deployment; verify via configuration documentation

---

## 4. What Needs to Be Done

### 4.1 Audit Current Configuration

Before production deployment, determine which regions each service uses:

```
Checklist:
[ ] Database hosting: EU region? Provider DPA with SCCs?
[ ] Application hosting: EU region? Provider DPA with SCCs?
[ ] Resend: verify DPF certification; consider EU region
[ ] Redis: confirm EU region in REDIS_URL
[ ] GitHub OAuth: document as independent controller in privacy policy
```

### 4.2 Use EU-Based Infrastructure Where Possible

**Recommended stack (no cross-border transfer):**
- Application + Database: **Hetzner Cloud** (Germany) → GDPR-compliant, affordable, German company
- Email: **Resend EU region** or self-hosted Postfix → no transfer
- Redis: **Upstash EU (Frankfurt)** or self-hosted Redis → no transfer

### 4.3 Transfer Impact Assessment (TIA) for US Transfers

If any US transfer is unavoidable, perform a **Transfer Impact Assessment (TIA)** per EDPB Recommendation 01/2020:

1. Identify the transfer (which data, to which country)
2. Identify the transfer mechanism (SCCs, DPF)
3. Assess the legal framework of the destination country (US FISA/EO 14086 for DPF-certified organisations)
4. Implement supplementary technical measures if needed (e.g., pseudonymisation before transfer)
5. Document the assessment

### 4.4 Disclose Transfers in Privacy Policy

The privacy policy (GAP-002) must explicitly state:

```
Datenübermittlung in Drittstaaten

Für den Versand von E-Mails (Passwort-Zurücksetzen) nutzen wir den Dienst Resend 
(Resend Inc., USA). Resend ist nach dem EU-US Data Privacy Framework zertifiziert 
(Durchführungsbeschluss der Europäischen Kommission 2023/1795 vom 10. Juli 2023) 
und hat einen Auftragsverarbeitungsvertrag gemäß Art. 28 DSGVO mit uns abgeschlossen.

Falls Sie sich über GitHub anmelden, verarbeitet GitHub Inc. (USA) Ihre Daten als 
eigenverantwortlicher Verarbeiter im Rahmen der GitHub-Datenschutzrichtlinie.
```

---

## 5. Standard Contractual Clauses (SCCs)

If a US service is used but is **not** DPF-certified, SCCs (Commission Decision (EU) 2021/914) must be concluded:

- Module 2 (Controller → Processor) for processors like Resend
- Available from: [EU Commission SCC templates](https://commission.europa.eu/publications/standard-contractual-clauses-controllers-and-processors_en)

SCCs must be physically appended to or referenced in the DPA.

---

## 6. Verification

1. Identify all services where personal data is sent → document hosting region.
2. For each non-EU transfer: confirm DPF certification or SCC in place.
3. Privacy policy lists all third-country transfers with the applicable mechanism.
4. Redis URL uses EU region endpoint.
5. Hosting provider's data centre is in the EU (check with `whois` or provider documentation).
