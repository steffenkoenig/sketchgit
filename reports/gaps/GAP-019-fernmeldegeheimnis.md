# GAP-019 – Fernmeldegeheimnis (TTDSG § 3 – Telecommunications Secrecy)

**Status:** ✅ Classification Confirmed – Minor Documentation Remaining  
**Priority:** 🟢 Low  
**Category:** TTDSG / Telecommunications Law  
**Effort Estimate:** 1–2 hours (documentation only)  

---

## 1. Description

**Confirmed classification:** SketchGit is a **collaborative tool, not a telecommunications service**. Drawing data is application state, not interpersonal communications. TTDSG § 3 (Fernmeldegeheimnis) therefore does **not apply** to SketchGit's WebSocket layer.

This gap document records that determination for the internal compliance record (Verarbeitungsverzeichnis, GAP-008), describes why the classification is correct, specifies the guard conditions that would change it, and lists the two remaining minor disclosure tasks: a privacy policy clause about server-side WebSocket processing, and the WSS/TLS deployment requirement already covered by DSGVO Art. 32 (GAP-013).

---

## 2. Applicable Law (for Reference)

| Law / Regulation | Paragraph / Article | Status for SketchGit |
|---|---|---|
| TTDSG 2021 | § 3 | ✅ **Does not apply** – SketchGit is not a telecommunications service |
| TKG 2021 | § 1, § 3 | ✅ **Does not apply** – SketchGit is not a provider of telecommunications services |
| EU Electronic Communications Code (ECC) 2018/1972 | Art. 2(4) | ✅ **Does not apply** – WebSocket is application-layer state, not signal conveyance |
| EU ePrivacy Directive 2002/58/EC | Art. 5 | ✅ **Does not apply** – no interpersonal communications service |
| DSGVO 2016/679 | Art. 32 | ⚠️ **Applies independently** – WSS/TLS required for data in transit (see GAP-013) |

---

## 3. Classification Reasoning (for Internal Record)

### 3.1 Legal Definition of a Telecommunications Service

Under TKG § 3 Nr. 65 and EU ECC Art. 2(4), an "electronic communications service" must consist **wholly or mainly** in the **conveyance of signals** – i.e., the transmission of information between persons at their direction. The three recognised sub-types are:

1. Internet access services (ISPs)
2. **Interpersonal communications services** (email, messaging, VoIP)
3. Other signal-conveyance services (broadcasting)

### 3.2 Why SketchGit Does Not Meet This Definition

| Criterion | SketchGit | Conclusion |
|---|---|---|
| Primary purpose is conveyance of signals | ❌ No – primary purpose is collaborative drawing | Not a telecom service |
| WebSocket payload is interpersonal communication | ❌ No – payload is application state (canvas JSON, cursor positions, branch names, commit hashes) | Not a telecom service |
| One-to-one private communication channel | ❌ No – all room members receive all drawing events simultaneously | Not a telecom service |
| User-to-user messaging or chat | ❌ No – no such feature exists | Not a telecom service |
| Users have a confidentiality expectation between individuals | ❌ No – drawings are visible to all room members by design | Not a telecom service |

**Confirmed conclusion:** SketchGit is a collaborative application tool. The WebSocket layer synchronises shared application state (drawing canvas, git-like version history, presence indicators) among all participants in a room. This is functionally equivalent to collaborative editing in tools such as Google Docs or Figma, which are likewise not classified as telecommunications services. TTDSG § 3 does not apply.

### 3.3 Guard Conditions – When This Classification Must Be Re-evaluated

The classification remains valid as long as the following remain true:

> - No user-to-user text chat, direct messages, or private message threads are added.
> - No voice or video communication features are added.
> - No feature creates a private one-to-one communication channel where one user expects the content to be confidential from the server and other room members.

**If any of the above features are introduced**, a new TTDSG § 3 assessment must be conducted before the feature ships. If the assessment concludes that TTDSG § 3 applies, additional obligations arise: transport encryption of message payloads end-to-end, staff Verschwiegenheitsverpflichtungen, and potentially TKG notification obligations.

---

## 4. Remaining Minor Tasks

### 4.1 Record the Classification in the Internal Compliance Record

Append the following to the Verarbeitungsverzeichnis (GAP-008):

```
TTDSG § 3 Klassifizierungsvermerk
Datum: [YYYY-MM-DD]
Erstellt von: [Name des Betreibers]

Ergebnis: SketchGit ist kein Telekommunikationsdienst im Sinne des 
TTDSG § 3 / TKG § 3 Nr. 65. Das Fernmeldegeheimnis findet keine Anwendung.

Begründung:
1. Der primäre Zweck des Dienstes ist kollaboratives Zeichnen, nicht die 
   Übermittlung interpersoneller Kommunikation.
2. WebSocket-Nutzdaten bestehen aus Anwendungszustand (Canvas-JSON, 
   Cursor-Positionen, Branch-Namen, Commit-Hashes) – keine persönlichen 
   Nachrichten oder Sprachkommunikation.
3. Alle Raummitglieder empfangen alle Zeichenereignisse gleichzeitig; 
   keine Eins-zu-eins-Vertraulichkeitserwartung besteht.
4. Keine Nutzer-zu-Nutzer-Messaging-Funktion vorhanden.

Überprüfung erforderlich bei: Einführung von Chat, Direktnachrichten, 
Sprach- oder Videokommunikation.
```

### 4.2 Add a WebSocket Processing Disclosure to the Privacy Policy

The privacy policy (GAP-002) should include a brief, plain-language paragraph under a "Echtzeit-Zusammenarbeit" (Real-time Collaboration) section:

```
Echtzeit-Zusammenarbeit

Für die Echtzeit-Synchronisierung von Zeichendaten verwenden wir 
WebSocket-Verbindungen. Der Server empfängt und verteilt dabei 
Anwendungszustand (Zeichenkoordinaten, Versionshistorie, Anwesenheitsdaten) 
an alle Mitglieder des jeweiligen Raums.

Diese Datenübertragung dient ausschließlich der Bereitstellung des 
kollaborativen Dienstes und wird nicht für andere Zwecke ausgewertet 
(Art. 6 Abs. 1 lit. b DSGVO).

SketchGit ist kein Telekommunikationsdienst. Das Fernmeldegeheimnis 
gemäß TTDSG § 3 findet keine Anwendung.
```

### 4.3 WSS/TLS in Production (DSGVO Art. 32)

Ensuring all WebSocket connections use WSS (WebSocket over TLS) is a DSGVO Art. 32 obligation independent of TTDSG. This is addressed in GAP-013 (IT-Sicherheit). Cross-reference: confirm TLS is enforced at the reverse proxy before production go-live.

---

## 5. Summary

| Item | Required | Status |
|---|---|---|
| TTDSG § 3 classification | Confirmed – does not apply | ✅ Confirmed |
| Internal compliance record entry | Yes | ❌ Not yet written |
| Privacy policy WebSocket disclosure | Yes (DSGVO transparency) | ❌ Not yet written |
| WSS/TLS for WebSocket | Yes (DSGVO Art. 32, GAP-013) | ⚠️ Deployment-dependent |
| Re-evaluation trigger defined | Yes | ✅ Documented above |

---

## 6. Verification

1. VVT (GAP-008) contains the dated TTDSG classification record.
2. Privacy policy contains a "Echtzeit-Zusammenarbeit" section explicitly stating SketchGit is not a telecommunications service.
3. No user-to-user chat or private messaging feature exists in the codebase.
4. Feature development checklist includes a TTDSG re-evaluation item for any future communication features.
