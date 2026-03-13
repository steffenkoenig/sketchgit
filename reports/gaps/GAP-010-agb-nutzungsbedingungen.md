# GAP-010 – AGB / Nutzungsbedingungen (Terms of Service)

**Status:** ❌ Open  
**Priority:** 🟠 High  
**Category:** BGB / German Contract Law  
**Effort Estimate:** 4–8 hours (legal drafting)  

---

## 1. Description

SketchGit has no Terms of Service (Nutzungsbedingungen / Allgemeine Geschäftsbedingungen – AGB). For a web service that concludes usage contracts with registered users, this creates liability risks and provides no contractual basis for terminating abusive accounts. German BGB and EU Consumer Rights Directive requirements for digital services apply.

---

## 2. Applicable Law

| Law / Regulation | Paragraph / Article | Requirement |
|---|---|---|
| BGB | §§ 305–310 | AGB-Recht: requirements for valid general terms |
| BGB | § 305 Abs. 2 | Terms must be incorporated into the contract (by clear reference) |
| BGB | § 307 | Unreasonable disadvantage clause (Generalklausel) |
| BGB | § 308 | Prohibitions with evaluation (e.g., excessive notice periods) |
| BGB | § 309 | Absolute prohibitions (e.g., no liability for intentional damage) |
| EU Directive 2019/770 | Art. 5–7 | Information requirements for digital content/services contracts |
| VRRL (Verbraucherrechterichtlinie) | Art. 6 | Pre-contractual information for distance contracts |
| DDG | § 5 | Must be accessible via the legal notice |
| DSGVO | Art. 13 | Privacy policy (separate document – see GAP-002) |

---

## 3. Current State

- No Terms of Service page exists.
- No reference to terms during registration (`/auth/register`).
- No cancellation policy (Widerrufsrecht) – relevant if the service is ever monetised.
- No content policy (what users may not draw/share).

---

## 4. Risk

| Risk | Detail |
|---|---|
| **No contractual basis to ban users** | Without ToS, terminating a user's access may create contractual liability claims |
| **Liability for user-generated content** | Without a content policy, operator may be liable for infringing or illegal drawings stored on server |
| **No limitation of liability** | Without disclaimer, operator bears unlimited liability for service failures |
| **Consumer right violations** | If service is offered to consumers (B2C), EU Consumer Rights Directive requirements must be met |

---

## 5. What Needs to Be Done

### 5.1 Create Terms of Service Page

Create `app/[locale]/terms/page.tsx` with the following sections:

---

#### Section 1 – Geltungsbereich (Scope)

```
Diese Nutzungsbedingungen gelten für die Nutzung des Dienstes SketchGit, 
betrieben von [Name/Firma, Adresse].

Mit der Registrierung oder der Nutzung des Dienstes erklärt der Nutzer 
sein Einverständnis mit diesen Nutzungsbedingungen.
```

#### Section 2 – Leistungsbeschreibung (Service Description)

```
SketchGit ist ein webbasiertes kollaboratives Zeichenbrett mit 
Versionskontrollfunktionen. Der Dienst ermöglicht es Nutzern, 
Zeichenbretter zu erstellen, zu bearbeiten und mit anderen zu teilen.

Anonyme Nutzung: Eine Registrierung ist nicht erforderlich. Ohne 
Registrierung gespeicherte Inhalte können nicht dauerhaft gesichert werden.
```

#### Section 3 – Registrierung und Zugang

```
Die Registrierung erfordert eine gültige E-Mail-Adresse. Der Nutzer ist 
verantwortlich für die Geheimhaltung seiner Zugangsdaten.

[Betreiber] behält sich vor, Konten zu sperren oder zu löschen, wenn 
Anhaltspunkte für einen Verstoß gegen diese Nutzungsbedingungen vorliegen.
```

#### Section 4 – Nutzungsrechte und Rechte an Inhalten

```
Der Nutzer räumt [Betreiber] eine nicht-exklusive, weltweite, kostenlose 
Lizenz ein, die hochgeladenen oder erstellten Inhalte zum Zweck der 
Bereitstellung des Dienstes zu speichern, zu verarbeiten und anzuzeigen.

Die Rechte an den Inhalten verbleiben beim Nutzer. [Betreiber] beansprucht 
keine Eigentumsrechte an Nutzungsinhalten.
```

**Note:** This is the critical intellectual property clause. Confirm with a lawyer that this is appropriate for the business model.

#### Section 5 – Verbotene Inhalte (Prohibited Content)

```
Es ist verboten, über SketchGit folgende Inhalte zu speichern oder zu teilen:

- Inhalte, die gegen geltendes deutsches oder europäisches Recht verstoßen
- Urheberrechtlich geschützte Inhalte ohne Genehmigung des Rechteinhabers
- Inhalte, die zum Hass gegenüber Gruppen aufstacheln (§ 130 StGB)
- Sexuell explizite Inhalte, insbesondere Darstellungen von Minderjährigen
- Inhalte, die andere Personen beleidigen, bedrohen oder verleumden
- Viren, Malware oder schädlichen Code

[Betreiber] ist berechtigt, entsprechende Inhalte ohne Vorankündigung zu 
entfernen und betroffene Konten zu sperren.
```

#### Section 6 – Verfügbarkeit und Haftung (Availability and Liability)

```
[Betreiber] übernimmt keine Garantie für eine ununterbrochene Verfügbarkeit 
des Dienstes. Wartungsarbeiten werden nach Möglichkeit angekündigt.

Für den Verlust von Nutzerdaten (z.B. durch Systemfehler) haftet [Betreiber] 
nur bei Vorsatz oder grober Fahrlässigkeit.

Die Haftung für leichte Fahrlässigkeit ist – soweit gesetzlich zulässig – 
ausgeschlossen, außer bei Verletzung von Leben, Körper oder Gesundheit.
```

**Legal note:** § 309 Nr. 7 BGB prohibits excluding liability for death/personal injury caused by intentional or grossly negligent acts. This clause is standard and permissible.

#### Section 7 – Kündigung und Datenlöschung

```
Nutzer können ihr Konto jederzeit selbst über die Kontoeinstellungen löschen. 
Dabei werden alle personenbezogenen Daten gelöscht (Art. 17 DSGVO).

[Betreiber] kann Konten mit angemessener Frist kündigen oder bei schwerem 
Verstoß gegen diese Bedingungen fristlos sperren.
```

#### Section 8 – Änderungen der Nutzungsbedingungen

```
[Betreiber] behält sich vor, diese Nutzungsbedingungen zu ändern. Nutzer 
werden über wesentliche Änderungen per E-Mail oder beim nächsten Login 
informiert. Bei fehlender Widerspruchsmeldung innerhalb von [30] Tagen 
gelten die Änderungen als angenommen.

Hinweis: Eine erzwungene Zustimmung per Opt-Out ist bei AGB-Änderungen 
nach § 308 Nr. 5 BGB nur unter engen Voraussetzungen wirksam. Konsultieren 
Sie einen Anwalt für die genaue Formulierung.
```

#### Section 9 – Anwendbares Recht und Gerichtsstand

```
Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des 
UN-Kaufrechts (CISG).

Gerichtsstand für Streitigkeiten mit Unternehmern ist [Ort des Betreibers]. 
Für Verbraucher gilt der gesetzliche Gerichtsstand.
```

#### Section 10 – Streitbeilegung (Dispute Resolution)

EU Regulation 524/2013 on Online Dispute Resolution (ODR) requires businesses offering online services to consumers to provide a link to the EU ODR platform:

```
Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung 
(OS) bereit: https://ec.europa.eu/consumers/odr/

Wir sind nicht verpflichtet und nicht bereit, an einem 
Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
```

**Note:** Even if not participating in mediation, the ODR link is mandatory if offering services to EU consumers online (§ 36 VSBG).

---

### 5.2 Reference in Registration Form

The registration form must display a checkbox or notice:

```
☐ Ich habe die Nutzungsbedingungen und die Datenschutzerklärung gelesen 
  und stimme diesen zu.
```

Under BGB § 305 Abs. 2, terms must be explicitly pointed out at the time of contract conclusion.

### 5.3 ODR Link in Footer

The EU ODR platform link (§ 36 VSBG) must appear in the footer alongside the Impressum link.

---

## 6. Legal Drafting Recommendation

The terms outlined here are a structural guide, not a finalised legal text. Before deployment, consult:
- A German lawyer (Rechtsanwalt) specialising in IT/internet law
- Or use a generator service like [IT-Recht Kanzlei](https://www.it-recht-kanzlei.de/) or [eRecht24](https://www.e-recht24.de/) which provides regularly updated templates

---

## 7. Verification

1. Terms of Service page accessible at `/terms` (HTTP 200).
2. Registration form contains explicit reference to and acceptance of ToS.
3. Footer contains links to: Impressum, Privacy Policy, Terms, ODR Platform.
4. Content policy clearly prohibits illegal content.
5. Liability limitation clause reviewed by a lawyer.
