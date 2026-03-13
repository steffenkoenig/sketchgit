# GAP-011 – security.txt Platzhalter (security.txt Placeholder Values)

**Status:** ⚠️ Partial  
**Priority:** 🟠 High  
**Category:** IT Security / Best Practice  
**Effort Estimate:** 30 minutes  

---

## 1. Description

The file `public/.well-known/security.txt` exists in the repository but contains placeholder values (`example.com`, generic descriptions) that are not valid for production use. This file is used by security researchers to responsibly disclose vulnerabilities. Incorrect contact information means reported vulnerabilities cannot reach the operator, creating a security risk.

Additionally, RFC 9116 defines several fields that improve the usefulness of the file; several are missing.

---

## 2. Applicable Standard / Law

| Standard / Law | Reference | Requirement |
|---|---|---|
| RFC 9116 | Sections 2–4 | Structure and required fields for security.txt |
| BSI IT-Grundschutz | OPS.1.1.3 | Patch management and vulnerability disclosure channels |
| ISO/IEC 29147:2018 | Section 5 | Vulnerability disclosure policy |
| BSI-Gesetz (BSIG) | § 8b Abs. 5 | Relevant for KRITIS operators (likely not applicable here) |

> **Note:** `security.txt` is not legally mandated for most German operators. However, it represents the industry standard for responsible vulnerability disclosure and is referenced in the German government's CERT infrastructure guidance. Neglecting it creates a reputational and security risk.

---

## 3. Current State

The file `public/.well-known/security.txt` contains placeholder values:

```
Contact: mailto:security@example.com
Expires: 2025-01-01T00:00:00.000Z
Preferred-Languages: en
Policy: https://example.com/security-policy
Canonical: https://example.com/.well-known/security.txt
```

**Problems:**
1. `Contact` points to `security@example.com` – non-functional
2. `Expires` date is in the past (2025-01-01) – an expired security.txt causes tools to ignore the file entirely
3. `Canonical` URL points to `example.com` instead of the actual domain
4. `Policy` URL points to a non-existent page
5. `Encryption` key missing (recommended for sensitive reports)

---

## 4. What Needs to Be Done

### 4.1 Update security.txt with Real Values

Replace all placeholder values before production deployment:

```
# security.txt – per RFC 9116
# Last updated: [YYYY-MM-DD]

Contact: mailto:security@[your-domain.com]
Contact: https://[your-domain.com]/security

Expires: [YYYY-MM-DDT00:00:00.000Z]
# Set to 1 year from creation; update annually

Preferred-Languages: de, en

Canonical: https://[your-domain.com]/.well-known/security.txt

Policy: https://[your-domain.com]/security-policy

# Optional but recommended: link to PGP key for encrypted reports
# Encryption: https://[your-domain.com]/.well-known/security-pgp-key.asc

# Optional: acknowledge security researchers
# Acknowledgments: https://[your-domain.com]/security-acknowledgments

# Optional: links to CSIRT affiliation
# CSIRT: https://www.bsi.bund.de/
```

### 4.2 Required Fields (RFC 9116)

| Field | Required | Value |
|---|---|---|
| `Contact` | ✅ Required | Valid email or URL for security reports |
| `Expires` | ✅ Required | ISO 8601 date-time; must be in the future |
| `Preferred-Languages` | Recommended | `de, en` |
| `Canonical` | Recommended | Full URL of the security.txt on the production domain |

### 4.3 Create a Vulnerability Disclosure Policy Page

The `Policy` URL should point to a page (e.g., `/security-policy`) explaining:

```
Vulnerability Disclosure Policy / Richtlinie zur verantwortungsvollen 
Offenlegung von Sicherheitslücken

We welcome reports from security researchers. Please:
1. Email security@[your-domain.com] with details of the vulnerability.
2. Allow us [90 days] to investigate and patch before public disclosure.
3. Do not exploit vulnerabilities or access user data beyond what is needed 
   to demonstrate the issue.
4. We will acknowledge receipt within [48 hours] and keep you informed of 
   progress.

We do not offer a bug bounty programme at this time, but we will acknowledge 
responsible disclosures in our security acknowledgments page.
```

### 4.4 Annual Maintenance

Add a recurring reminder to update the `Expires` field annually. An expired `security.txt` (past expiry date) is treated as absent by security scanning tools.

### 4.5 PGP Key (Recommended)

For sensitive vulnerability reports involving potential data breaches, provide a PGP public key that security researchers can use to encrypt their reports:

1. Generate a PGP key: `gpg --gen-key` (or use Kleopatra on Windows)
2. Upload the public key to a keyserver: `gpg --keyserver hkps://keys.openpgp.org --send-keys [KEY_ID]`
3. Export the ASCII-armored public key to `public/.well-known/security-pgp-key.asc`
4. Reference it in `security.txt` with the `Encryption` field

---

## 5. Verification

1. Fetch `https://[your-domain.com]/.well-known/security.txt` – returns 200 with correct content.
2. `Expires` date is in the future.
3. `Contact` email is reachable and monitored.
4. `Canonical` URL matches production domain.
5. Validate with: [securitytxt.org](https://securitytxt.org/) or `curl -I https://[your-domain.com]/.well-known/security.txt`
