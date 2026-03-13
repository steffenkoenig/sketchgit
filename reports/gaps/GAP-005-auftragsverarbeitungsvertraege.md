# GAP-005 – Auftragsverarbeitungsverträge (Data Processing Agreements)

**Status:** ❌ Open  
**Priority:** 🔴 Critical  
**Category:** DSGVO / GDPR  
**Effort Estimate:** 2–4 hours (contractual, not development)  

---

## 1. Description

Article 28 DSGVO requires that every data controller conclude a written Data Processing Agreement (Auftragsverarbeitungsvertrag – AVV) with each processor that handles personal data on its behalf. SketchGit relies on several external service providers that process personal data as "processors" under DSGVO. Currently no AVVs are documented or referenced in the codebase.

---

## 2. Applicable Law

| Law / Regulation | Article | Requirement |
|---|---|---|
| DSGVO 2016/679 | Art. 28 Abs. 1 | Controller may only use processors providing sufficient guarantees |
| DSGVO 2016/679 | Art. 28 Abs. 3 | Processing must be governed by a binding AVV |
| DSGVO 2016/679 | Art. 28 Abs. 4 | Sub-processors must also be covered by an AVV |
| DSGVO 2016/679 | Art. 83 Abs. 4 | Fine up to €10M or 2% global turnover for AVV violations |

---

## 3. What Is a Processor? (DSGVO Art. 4 Nr. 8)

A processor is any natural or legal person, authority, agency, or other body that **processes personal data on behalf of the controller**. Hosting providers, email service providers, and analytics platforms are typical processors.

---

## 4. Identified Processors

### 4.1 Mandatory

| Processor | Data Processed | AVV Status | Notes |
|---|---|---|---|
| **Database Hosting Provider** (e.g., Hetzner, Supabase, Neon, AWS RDS) | All user data in PostgreSQL | ❌ Not concluded | Must be established before any personal data is stored |
| **Server/Application Hosting** (e.g., Hetzner Cloud, Fly.io, Render, AWS EC2) | All application traffic, logs | ❌ Not concluded | Hosting provider has access to server resources and potentially memory/disk |

### 4.2 Optional (Depending on Configuration)

| Processor | Data Processed | AVV Status | Notes |
|---|---|---|---|
| **Resend** (email service) | User email addresses for password reset | ❌ Not concluded | Only relevant if `RESEND_API_KEY` is set |
| **Redis Hosting** (e.g., Upstash, Redis Cloud) | Session broadcast data, rate-limiter counters (may include IP addresses) | ❌ Not concluded | Only relevant if `REDIS_URL` is set |

### 4.3 GitHub OAuth (Special Case)

GitHub acts as an **independent data controller** (not a processor) when users authenticate via GitHub OAuth. Users are directed to GitHub's own UI and GitHub processes their data under GitHub's own privacy policy. Therefore no AVV is required for GitHub – but users must be informed of GitHub's role in the privacy policy (GAP-002, section 5.2.5).

---

## 5. What Needs to Be Done

### 5.1 Conclude AVV with Each Processor

**Action per processor:**

| Processor | How to Obtain AVV |
|---|---|
| **Hetzner** | Available in the Hetzner Cloud Console → Project Settings → Data Protection Agreement. Requires online acceptance. |
| **AWS** | Available as the AWS Data Processing Addendum, accepted via the AWS console. |
| **Supabase** | Available via [Supabase DPA](https://supabase.com/legal/dpa). |
| **Neon** | Available via [Neon DPA](https://neon.tech/privacy-policy). |
| **Resend** | Available via [Resend DPA](https://resend.com/legal/dpa). Accept in the Resend dashboard. |
| **Upstash** | Available via [Upstash DPA](https://upstash.com/trust/dpa.pdf). |

### 5.2 Minimum AVV Content (Art. 28 Abs. 3)

An AVV must specify:

1. Subject matter and duration of processing
2. Nature and purpose of processing
3. Type of personal data and categories of data subjects
4. Obligations and rights of the controller

### 5.3 Document the AVVs

Maintain a record (e.g., in `docs/data-processing-agreements.md` or a secure ops document) listing:

- Processor name
- Date AVV was concluded
- Version or reference number
- Link to the online DPA or attachment

This record is part of the **Verarbeitungsverzeichnis** (Art. 30) – see GAP-008.

### 5.4 Processor Selection Criteria

Before selecting any new external service that will process personal data, verify:

- The processor is located in the EU/EEA, **or** uses EU Standard Contractual Clauses (SCCs) for international transfers (see GAP-006).
- The processor offers an AVV that is DSGVO-compliant.
- The processor's security measures are appropriate (Art. 28 Abs. 3 lit. c).

---

## 6. Sub-Processors

Each processor may use sub-processors (e.g., Resend may use AWS SES under the hood). The AVV must require the processor to:
- Obtain controller's prior authorisation for new sub-processors (Art. 28 Abs. 2)
- Impose equivalent obligations on sub-processors

Check each processor's sub-processor list and confirm they disclose any sub-processors in the EEA or with SCCs.

---

## 7. Verification

1. For each mandatory processor: confirm AVV is accepted/signed.
2. For each optional processor (Resend, Redis): confirm AVV before first production use.
3. Store copies of all executed AVVs in a secure ops directory (not the public repo).
4. Review AVVs annually or when the processor changes its service.
