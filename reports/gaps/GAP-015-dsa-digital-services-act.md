# GAP-015 – DSA – Digital Services Act (EU-Verordnung 2022/2065)

**Status:** ⚠️ Partial / Conditional  
**Priority:** 🟡 Medium  
**Category:** EU Digital Services Act  
**Effort Estimate:** 2–4 hours (documentation + minimal implementation)  

---

## 1. Description

The **Digital Services Act (DSA)** – EU Regulation 2022/2065 – entered into application in February 2024. It creates a tiered framework of obligations for online intermediaries and platforms. Depending on the nature and scale of SketchGit, various DSA obligations may apply. This gap assesses the applicable tier and required compliance steps.

---

## 2. Applicable Law

| Law / Regulation | Article | Requirement |
|---|---|---|
| DSA (EU) 2022/2065 | Art. 2 | Scope: intermediary services (caching, hosting, platforms) |
| DSA (EU) 2022/2065 | Art. 11 | Single point of contact for authorities and users |
| DSA (EU) 2022/2065 | Art. 12 | Transparency reporting (large platforms) |
| DSA (EU) 2022/2065 | Art. 13 | Representative in EU (if operator outside EU) |
| DSA (EU) 2022/2065 | Art. 14 | Notice and action mechanism for illegal content |
| DSA (EU) 2022/2065 | Art. 15 | Statement of reasons for content moderation decisions |
| DSA (EU) 2022/2065 | Art. 17 | Internal complaint-handling system |
| DSA (EU) 2022/2065 | Art. 19 | Out-of-court dispute settlement |
| DSA (EU) 2022/2065 | Art. 24 | Transparency for advertising (platforms) |
| DSA (EU) 2022/2065 | Art. 26 ff. | Obligations for very large platforms (>45M EU users) – not applicable |
| DDG (German DSA transposition) | § 1 ff. | German implementation |
| TMG / DDG | § 10 | Hosting privilege (Haftungsprivileg) |

---

## 3. DSA Tier Assessment

| Tier | Threshold | Applies? |
|---|---|---|
| Intermediary service (hosting) | Any provider hosting third-party content | ✅ **Likely yes** – SketchGit stores user-created drawings |
| Online platform | Hosting third-party content + disseminating it to the public | ✅ **Yes** – rooms can be shared publicly via invitation links |
| Very large online platform (VLOP) | >45 million average monthly users in EU | ❌ No (startup scale) |

**Conclusion:** SketchGit qualifies as an **online platform (hosting provider)** under DSA. As a small/micro-enterprise (<50 employees, <€10M turnover), many enhanced obligations do not apply, but the baseline requirements do.

> **Micro-enterprise exception:** DSA Art. 19 Abs. 1 and Art. 24 Abs. 6 exempt micro and small enterprises from some specific obligations. However, Art. 11, Art. 14, and Art. 17 apply to all online platforms.

---

## 4. Applicable Baseline Obligations

### 4.1 Art. 11 – Single Point of Contact

**Requirement:** Designate a single contact point for communications with EU member state authorities and the European Commission.

**Action:** Add contact information in the Impressum (GAP-001) specifically labeled as the DSA contact:

```
DSA-Kontaktstelle (Art. 11 DSA):
E-Mail: dsa@[ihre-domain.de]
```

This can be the same address as the general privacy contact if monitored.

### 4.2 Art. 14 – Mechanism to Report Illegal Content

**Requirement:** Provide a mechanism for users to report illegal content that is easy to use and accessible.

**Action:** Create a "Report Content" feature or a dedicated email/form for reporting:

- Add a contact email in the footer and in the Terms of Service: `abuse@[ihre-domain.de]`
- Or add an in-app "Report Room" button visible to room members.
- Reports must be actionable: logged, investigated, and responded to.

### 4.3 Art. 15 – Statement of Reasons

**Requirement:** When restricting content or suspending an account, inform the affected user with a statement of reasons.

**Action:** When terminating a user's account or removing content:
- Send an email explaining why the action was taken.
- Reference the specific Terms of Service clause violated.
- Inform the user of their right to use the internal complaint mechanism (Art. 17).

### 4.4 Art. 17 – Internal Complaint-Handling System

**Requirement:** Online platforms must have an internal complaint system for users to challenge content moderation decisions.

**Action:** For a small operator, this can be as simple as:
- Provide an email address for complaints (e.g., `abuse@[ihre-domain.de]` or general contact).
- Respond within a reasonable time (DSA does not specify; 2 weeks is standard practice).
- Document complaint and resolution.

### 4.5 Art. 19 – Out-of-Court Dispute Settlement

**Requirement:** Users must be able to refer disputes about content moderation to certified out-of-court dispute settlement bodies.

**Note:** This obligation has an exemption for micro/small enterprises under DSA Art. 19 Abs. 1. If SketchGit qualifies as a micro-enterprise (<10 employees, <€2M turnover) or small enterprise (<50 employees, <€10M turnover), this obligation is **waived**.

**Action:** Assess whether the enterprise qualifies for the exemption. If yes, document the assessment. If no, identify a certified dispute settlement body in Germany (list maintained by national coordinator: Bundesnetzagentur in Germany for DSA matters).

---

## 5. Hosting Privilege (Haftungsprivileg, § 10 TMG / DDG / DSA Art. 6)

The hosting privilege exempts SketchGit from liability for user-generated content **as long as:**

1. The operator has no actual knowledge of illegal content, **or**
2. Upon obtaining such knowledge, acts expeditiously to remove or disable access.

**Requirements to maintain the privilege:**
- Implement an effective notice-and-action mechanism (Art. 14 – see above).
- Do not actively search for and moderate all content (passive host).
- Remove clearly illegal content (e.g., CSAM, incitement to violence) immediately upon discovery.

---

## 6. Content Moderation Policy

For DSA compliance, document a **content moderation policy** (can be part of the Terms of Service – GAP-010):

```
Inhaltsmoderation

Wir behalten uns vor, Inhalte zu entfernen und Konten zu sperren, wenn:
- Ein begründeter Hinweis auf rechtswidrige Inhalte eingeht (Art. 14 DSA)
- Ein Verstoß gegen unsere Nutzungsbedingungen festgestellt wird

Nutzer werden über Moderationsentscheidungen informiert und können 
Widerspruch einlegen (Art. 17 DSA).

Hinweise auf rechtswidrige Inhalte: abuse@[ihre-domain.de]
```

---

## 7. DSA Contact and Transparency

DSA Art. 11 requires the contact point to be easily identifiable. Consider:
- Adding a dedicated DSA/legal page at `/legal` or extending the Impressum.
- Listing: DSA contact, Impressum, Privacy Policy, Terms, Accessibility Statement.

---

## 8. Verification

1. Impressum (GAP-001) includes DSA contact email.
2. Footer contains link to reporting channel for illegal content.
3. Terms of Service (GAP-010) includes content moderation and complaint procedure.
4. Internal process exists for handling content reports (even if just an email inbox).
5. Micro/small enterprise DSA exemptions assessed and documented.
