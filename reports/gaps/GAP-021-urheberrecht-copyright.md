# GAP-021 – Urheberrecht & Copyright Takedown (UrhG § 97)

**Status:** ❌ Open  
**Priority:** 🟠 High  
**Category:** UrhG / DSA / Content Moderation  
**Effort Estimate:** 4–8 hours  

---

## 1. Description

SketchGit stores user-created drawing content (canvas JSON) on its servers. Users could upload drawings that infringe third-party copyrights (e.g., tracing copyrighted artworks, pasting in screenshots of protected images). Under German copyright law (UrhG § 97) and the DSA hosting privilege (Art. 6 DSA / § 10 DDG), the operator retains protection from liability for user-generated content **only if it promptly removes infringing content upon notification**. Currently no takedown mechanism, complaint process, or response procedure exists.

---

## 2. Applicable Law

| Law / Regulation | Paragraph / Article | Requirement |
|---|---|---|
| UrhG (Urhebergesetz) | § 97 | Right holder can demand injunctive relief and damages from the infringer; operator may face secondary liability |
| UrhG | § 101 Abs. 3 | Right holders can demand that hosting operators reveal the identity of users who infringed |
| UrhG | § 97a | Before filing suit, right holder must issue a cease-and-desist letter (Abmahnung); costs shift to operator if not complied with |
| DDG 2024 | § 10 | Hosting privilege: operator not liable for stored content if it acts expeditiously on knowledge of infringement |
| DSA (EU) 2022/2065 | Art. 6 | Conditional exemption from liability for online platforms |
| DSA (EU) 2022/2065 | Art. 14 | Mechanisms for users and rights-holders to report illegal/infringing content |
| DSA (EU) 2022/2065 | Art. 17 | Users who submitted content that was removed must be notified |
| DSGVO 2016/679 | Art. 6 Abs. 1 | Legal basis required for processing complainant's personal data |

---

## 3. Current State

- No endpoint for third-party copyright/content complaints.
- No content complaint form or email address.
- Room deletion is possible only by the room owner (`DELETE /api/rooms/[roomId]`).
- No API for the operator to remove content without room-owner involvement.
- No Terms of Service clause specifically describing the copyright infringement response process.
- The `security.txt` (GAP-011) is the only contact mechanism; it is currently a placeholder and does not reference content complaints.

---

## 4. Risk

| Risk | Detail |
|---|---|
| **Loss of hosting privilege** | If a right-holder notifies SketchGit of infringement and no action is taken, the operator loses the DDG § 10 / DSA Art. 6 exemption and becomes **directly liable** for the infringement |
| **UrhG § 97 Abmahnung** | A formal cease-and-desist letter from a rights-holder's lawyer with legal fee claims (typically €500–€3,000) |
| **Injunction** | Courts can issue an einstweilige Verfügung (injunction) within 24–48 hours requiring content removal; ignoring this results in contempt-of-court fines |
| **DSA non-compliance** | DSA Art. 14 is mandatory for all online platforms; fines up to 6% of global turnover |

---

## 5. What Needs to Be Done

### 5.1 Establish a Copyright/Content Complaint Email

The simplest first step: designate a dedicated email address for content complaints and publish it.

**Action:**
1. Create a monitored email address: `copyright@[ihre-domain.de]` or `abuse@[ihre-domain.de]`
2. Add this email to:
   - The footer of the application
   - The Terms of Service (GAP-010), in the section on prohibited content
   - The Impressum (GAP-001)
   - The privacy policy (disclosure of how complaint data is processed)

### 5.2 Create a Copyright Complaint Form (or Structured Email Process)

For each copyright complaint received, require the following information:

```
Copyright/Content Complaint Form

1. Complainant Information:
   - Name (or organisation)
   - Email address
   - Country

2. Description of the Work:
   - Title of the original work
   - Description of the original work
   - Evidence of ownership (e.g., registration number, publication link)

3. Description of the Infringing Content:
   - SketchGit room URL / Room ID
   - Description of how the content infringes the original work

4. Good-Faith Declaration:
   "I have a good-faith belief that the use of the copyrighted material 
   described above is not authorised by the copyright owner, its agent, 
   or the law."

5. Accuracy Declaration:
   "I declare that the information in this notice is accurate, and I am 
   the copyright owner or am authorised to act on behalf of the owner."

6. Signature and date
```

### 5.3 Complaint Handling Procedure

Define and document an internal procedure:

| Step | Timeframe | Action |
|---|---|---|
| 1. Acknowledge receipt | Within 48 hours | Send confirmation email to complainant |
| 2. Assess complaint | Within 7 days | Review whether the content appears infringing |
| 3. Act on valid complaints | Within 14 days | Remove/restrict access to the infringing room |
| 4. Notify room owner | After removal | Inform room owner of removal with reasons (DSA Art. 17) |
| 5. Counter-notice window | 14 days | Allow room owner to file a counter-notice disputing the claim |
| 6. Final decision | Within 7 days of counter-notice | Restore or maintain removal based on counter-notice validity |
| 7. Document outcome | Always | Record complaint, action taken, and outcome for audit |

### 5.4 Operator-Initiated Room Deletion

The operator needs a way to delete rooms without being the room owner. Check whether the current repository functions support operator-level deletion:

- `lib/db/roomRepository.ts` – verify whether a function exists to delete any room regardless of ownership.
- If not, add an operator-privileged deletion path.
- This capability should be protected and only accessible to the operator, not exposed via the public API.

### 5.5 Terms of Service Update

Add to the Terms of Service (GAP-010):

```
Urheberrecht und Inhaltsbeschwerden

Nutzer dürfen ausschließlich Inhalte hochladen oder erstellen, an denen 
sie die erforderlichen Rechte besitzen. Das Hochladen, Nachzeichnen oder 
Einbetten urheberrechtlich geschützter Werke Dritter ohne Genehmigung 
ist untersagt.

Inhaber von Urheberrechten können Beschwerden über mutmaßliche 
Urheberrechtsverletzungen an copyright@[ihre-domain.de] senden.

[Betreiber] wird nach Eingang einer begründeten Beschwerde unverzüglich 
tätig und wird betroffene Inhalte entfernen oder sperren. Der betroffene 
Nutzer wird über die Maßnahme informiert.
```

### 5.6 DSGVO Basis for Processing Complaint Data

Processing the complainant's personal data (name, email, description of infringement) requires a legal basis:

- **Legal basis:** Art. 6 Abs. 1 lit. c (compliance with a legal obligation – UrhG § 97 response) or Art. 6 Abs. 1 lit. f (legitimate interest – maintaining the hosting privilege)
- Add to privacy policy (GAP-002): Disclosure of complaint data processing, purpose, retention (e.g., 3 years for statute of limitations), and recipient (if any legal proceedings are initiated)

---

## 6. Counter-Notice Process (Gegendarstellung)

If a room owner believes their content was wrongfully removed, they should be able to submit a counter-notice:
1. Dispute the complainant's claim (provide evidence of own rights)
2. If counter-notice is valid and the complainant does not proceed with court action within 14 days, restore the content

This mirrors the DMCA notice-and-takedown model, adapted for German law.

---

## 7. Verification

1. `copyright@[ihre-domain.de]` or `abuse@[ihre-domain.de]` email is active and monitored.
2. Footer contains link to content complaint process.
3. Terms of Service includes copyright policy and complaint procedure.
4. Internal procedure document exists for handling complaints within 14 days.
5. Operator can delete any room regardless of ownership (internal function).
