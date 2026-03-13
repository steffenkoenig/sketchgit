# GAP-022 – Verarbeitung besonderer Datenkategorien (DSGVO Art. 9)

**Status:** ⚠️ Partial / Assessment Required  
**Priority:** 🟡 Medium  
**Category:** DSGVO Art. 9  
**Effort Estimate:** 4–6 hours (assessment + documentation + policy update)  

---

## 1. Description

Article 9 DSGVO prohibits the processing of "special categories of personal data" unless one of the specific conditions in Art. 9 Abs. 2 is met. SketchGit stores canvas drawings as arbitrary JSON without content classification. Users may create drawings that constitute or reveal special-category data (health diagrams, political maps, religious imagery, biometric sketches). While the operator does not intentionally seek to process such data, storing it as part of the drawing service creates a legal obligation to assess and document the risk.

---

## 2. Applicable Law

| Law / Regulation | Article | Requirement |
|---|---|---|
| DSGVO 2016/679 | Art. 9 Abs. 1 | Processing of special categories is **prohibited** by default |
| DSGVO 2016/679 | Art. 9 Abs. 2 | Processing permitted only under specific conditions (consent, vital interests, health care, etc.) |
| DSGVO 2016/679 | Art. 9 Abs. 3 | Processing health data requires healthcare professional secrecy obligation |
| DSGVO 2016/679 | Art. 25 | Data protection by design and by default |
| DSGVO 2016/679 | Art. 35 Abs. 3 lit. b | DPIA mandatory for large-scale special-category processing |
| BDSG 2018 | § 22 | German supplementary rules for special-category data |
| DSGVO 2016/679 | Art. 83 Abs. 5 | Fine: up to €20M or 4% global turnover |

### Special Categories Under Art. 9 Abs. 1

| Category | Example in SketchGit context |
|---|---|
| Racial or ethnic origin | Drawing depicting racial profiling; ethnographic map |
| Political opinions | Political poster, voting diagram |
| Religious or philosophical beliefs | Religious symbol, ritual diagram |
| Trade union membership | Union-related drawing |
| Genetic data | DNA sequence diagram |
| Biometric data (for unique identification) | Fingerprint sketch used for identification |
| Health data | Medical diagram, patient flow chart |
| Sex life or sexual orientation | Explicit content |

---

## 3. Current State

**File:** `prisma/schema.prisma`, line 117:
```prisma
canvasJson Json
```

The `canvasJson` field stores arbitrary Fabric.js JSON without any content classification, tagging, or special-category data flag.

**File:** `server.ts` (canvas save logic):
Drawing data is validated as valid JSON (structural check only) but not classified for content type.

**Current special-category protections:**
- ✅ Canvas data is protected by room RBAC (not public by default)
- ✅ Database stores data per room (not globally accessible)
- ✅ Account deletion cascades to room data (user can remove their rooms)
- ❌ No content classification
- ❌ No explicit consent for special-category data
- ❌ No heightened access controls for sensitive rooms
- ❌ No automatic deletion of potentially sensitive data after shorter retention period

---

## 4. Legal Analysis

### 4.1 Does SketchGit "Process" Special-Category Data?

DSGVO Art. 4 Nr. 2 defines "processing" broadly as any operation on personal data, including **storing**. If a user draws a medical diagram about themselves, SketchGit stores that drawing and therefore "processes" health data.

**However**, the EDPB has noted that:
- Processing is incidental to the primary purpose
- The data is not processed for the purpose of identifying special-category characteristics
- The controller may have no knowledge of the nature of the content

### 4.2 Applicable Exception

**Art. 9 Abs. 2 lit. a – Explicit Consent:**
If users explicitly consent to storing potentially sensitive drawings, this satisfies Art. 9 Abs. 2 lit. a. This is the most practical legal basis for a general-purpose drawing tool.

**Art. 9 Abs. 2 lit. e – Manifestly Made Public:**
Data that the data subject has manifestly made public is exempt. If a room is shared publicly, this may apply to the drawing content the user chose to share. However, most SketchGit rooms are private (access-controlled).

### 4.3 Risk Level

For a general-purpose collaborative drawing tool that does not specifically target health, political, or religious use cases, the risk is **low to medium**:
- Most users will create non-sensitive drawings
- Sensitive drawings (medical diagrams, etc.) are typically stored in private, access-controlled rooms
- The operator has no way to prevent or even detect special-category data in canvas JSON

---

## 5. What Needs to Be Done

### 5.1 Add General Consent Statement to Registration / Terms

The simplest approach is to obtain **general explicit consent** for the possibility of special-category data processing at registration.

Add to the Terms of Service (GAP-010) and Privacy Policy (GAP-002):

```
Besondere Kategorien personenbezogener Daten

Unser Dienst ist eine allgemeine Zeichenanwendung und verarbeitet keine 
besonderen Kategorien personenbezogener Daten im Sinne von Art. 9 DSGVO 
gezielt oder absichtlich.

Falls Sie in Ihren Zeichnungen dennoch Daten speichern, die gemäß Art. 9 Abs. 1 
DSGVO als besondere Kategorien eingestuft werden könnten (z. B. Gesundheitsdaten, 
religiöse Überzeugungen, politische Meinungen), erklären Sie sich durch die 
Nutzung unseres Dienstes ausdrücklich damit einverstanden, dass wir diese Daten 
im Rahmen der normalen Diensterbringung (Speicherung, Synchronisierung) 
verarbeiten (Art. 9 Abs. 2 lit. a DSGVO).

Wir empfehlen, keine besonders sensiblen persönlichen Daten in öffentlich 
zugänglichen Zeichenräumen zu speichern.
```

**English version for the en locale:**
```
This service is a general-purpose drawing application and does not intentionally 
process special categories of personal data (GDPR Art. 9). If you include 
special-category data (health information, religious beliefs, political opinions) 
in your drawings, you explicitly consent to processing of such data for service 
delivery purposes (GDPR Art. 9(2)(a)).
```

### 5.2 Document the Assessment

Create an internal assessment document:

```
Bewertung: Art. 9 DSGVO – Besondere Kategorien personenbezogener Daten
Datum: [YYYY-MM-DD]

Ergebnis: SketchGit verarbeitet keine besonderen Kategorien personenbezogener 
Daten als Kerntätigkeit. Nutzer könnten theoretisch solche Daten in Zeichnungen 
speichern (z. B. medizinische Diagramme).

Rechtsgrundlage: Art. 9 Abs. 2 lit. a DSGVO (ausdrückliche Einwilligung) 
– erteilt durch Nutzungsbedingungen bei Registrierung.

Risikominimierung:
- Rooms sind standardmäßig zugangskontrolliert (nicht öffentlich)
- RBAC verhindert unberechtigten Zugriff
- Nutzer können Inhalte und Räume selbst löschen

Empfehlung: Kein DPIA gemäß Art. 35 erforderlich, da keine großangelegte 
gezielte Verarbeitung besonderer Kategorien.
```

### 5.3 Prohibition on Certain Special-Category Content

The Terms of Service (GAP-010) should explicitly prohibit content that would require special-category processing without a valid legal basis (e.g., storing biometric data of third parties for identification purposes):

```
Verboten ist insbesondere:
- Das Speichern biometrischer Daten Dritter zum Zweck der Identifikation 
  ohne deren ausdrückliche Einwilligung
- Das Erstellen von Inhalten, die auf die Gesundheit, die ethnische Herkunft 
  oder andere besondere Kategorien Dritter ohne deren Einwilligung schließen lassen
```

### 5.4 DPIA Trigger Assessment (Art. 35 Abs. 3 lit. b)

A **Data Protection Impact Assessment (DPIA)** is mandatory under Art. 35 Abs. 3 lit. b for:
- Large-scale processing of special-category data

Since SketchGit does not *intentionally* process special-category data and processes it only incidentally, a DPIA is **not mandatory** at launch. However, if a feature is added that specifically targets health data (e.g., "Medical Drawing Mode"), a DPIA becomes mandatory.

Document this assessment in the internal DPIA register.

---

## 6. Verification

1. Terms of Service contains explicit consent clause for incidental special-category data.
2. Privacy policy discloses the possibility of special-category data and the consent legal basis.
3. Internal assessment document exists confirming that large-scale intentional processing of special-category data does not occur.
4. DPIA trigger assessment is documented (not required at launch).
