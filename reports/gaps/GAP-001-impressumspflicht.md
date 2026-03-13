# GAP-001 – Impressumspflicht (Legal Notice Obligation)

**Status:** ❌ Open  
**Priority:** 🔴 Critical  
**Category:** German Telemedia Law  
**Effort Estimate:** 2–4 hours  

---

## 1. Description

SketchGit is a publicly accessible web service operated from Germany. German law requires every commercially or professionally operated telemedia service to display a fully populated legal notice (Impressum) that is at all times directly reachable from every page. The application currently has no Impressum page at any URL.

---

## 2. Applicable Law

| Law / Regulation | Paragraph / Article | Requirement |
|---|---|---|
| Digitale-Dienste-Gesetz (DDG) | § 5 DDG | Legal notice obligation for telemedia services |
| EU E-Commerce Directive 2000/31/EC | Art. 5 | Information society services must disclose provider identity |
| Rundfunkstaatsvertrag (MStV) | § 18 MStV | Extended notice for journalism/editorial content providers |

> **Note:** The DDG (Digitale-Dienste-Gesetz) replaced the Telemediengesetz (TMG) in May 2024. The § 5 obligation is substantively identical but now codified in DDG. References to § 5 TMG in older guidance still apply since § 5 DDG carries the same content requirement.

### § 5 Abs. 1 DDG – Required Information

The legal notice must contain:

1. Name and address of the provider (natural person or legal entity)
2. Information enabling fast contact and direct communication, including an electronic address (email)
3. Where applicable: registered trade name, commercial register court and number
4. Where applicable: supervisory authority with address
5. Where applicable: VAT identification number (§ 27a UStG) or equivalent tax identifier
6. Where applicable: professional title, country of award, professional chamber, professional law with link

---

## 3. Current State

- No `/impressum` or `/legal-notice` route exists in `app/`.
- No links to a legal notice in the navigation, footer, or any page.
- `messages/en.json` and `messages/de.json` contain no Impressum-related strings.
- The canvas main page has no footer at all.

---

## 4. Risk

| Risk | Detail |
|---|---|
| **Abmahnung** | Competitors or specialized law firms routinely send cease-and-desist letters with cost demands of €1,000–€5,000 for a missing Impressum. |
| **Bußgeld** | Regulatory fines of up to €50,000 (§ 16 Abs. 2 DDG). |
| **Immediate action** | Courts can issue an injunction within 24 hours via einstweilige Verfügung. |

---

## 5. What Needs to Be Done

### 5.1 Create the Impressum Page

Create a route `app/[locale]/impressum/page.tsx` (or `app/impressum/page.tsx` if locale is handled differently) that renders a static page with all required information.

**Minimum required content for a private individual operator:**

```
Angaben gemäß § 5 DDG

[Vorname Nachname]
[Straße Hausnummer]
[PLZ Ort]
Deutschland

Kontakt:
E-Mail: [kontakt@example.com]
Telefon: [+49 XXX XXXXXXXX]  ← required if available

Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: DE[XXXXXXXXX]  ← if applicable
```

**For a legal entity (GmbH, UG, etc.):**

```
Angaben gemäß § 5 DDG

[Firmenname] GmbH
Geschäftsführer: [Name]
[Straße Hausnummer]
[PLZ Ort]

Handelsregister: Amtsgericht [Stadt], HRB [Nummer]
USt-IdNr.: DE[XXXXXXXXX]
```

### 5.2 Accessibility Requirement

The Impressum must be "unmittelbar erreichbar" (§ 5 Abs. 1 DDG) – reachable within **at most two clicks** from any page.

- Add a **persistent footer** to the app layout (`app/layout.tsx` or a shared layout component) with a link to `/impressum`.
- The footer should also be accessible from the canvas page (`/`).

### 5.3 i18n

Add translations for both locales:

```json
// messages/de.json – add under a new "impressum" key
{
  "footer": {
    "impressum": "Impressum",
    "privacy": "Datenschutzerklärung",
    "terms": "Nutzungsbedingungen"
  }
}

// messages/en.json – add
{
  "footer": {
    "impressum": "Legal Notice",
    "privacy": "Privacy Policy",
    "terms": "Terms of Service"
  }
}
```

### 5.4 Route Structure

```
app/
  [locale]/
    impressum/
      page.tsx        ← static server component
```

The page content itself may be written in German only (legally sufficient); an English translation is a courtesy.

---

## 6. Implementation Notes

- The Impressum page should be a **server component** with no client-side JavaScript requirements.
- Content can be stored as a static string or in `messages/*.json`; since it contains legal addresses, direct hardcoding in the component or a dedicated CMS entry is simpler.
- Do **not** use `noindex` meta tags on the Impressum page; it must be publicly crawlable.
- The footer link must appear even when the user is not authenticated and on the main canvas page.
- For a SaaS deployment, also consider placing the link in the authentication pages (`/auth/signin`, `/auth/register`).

---

## 7. Verification

After implementation:
1. Navigate to the root URL `/` – check that a footer link to `/impressum` is visible.
2. Navigate to `/impressum` – verify all required fields (name, address, email) are present.
3. Check the German locale `/de/impressum` returns HTTP 200.
4. Validate with [eRecht24 Impressum-Prüfer](https://www.e-recht24.de/impressum-generator.html) or equivalent.
