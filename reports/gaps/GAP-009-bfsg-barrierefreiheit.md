# GAP-009 – BFSG – Barrierefreiheit (Digital Accessibility)

**Status:** ⚠️ Partial  
**Priority:** 🟠 High  
**Category:** BFSG / EU Accessibility Act  
**Effort Estimate:** 16–40 hours (audit + implementation)  

---

## 1. Description

The **Barrierefreiheitsstärkungsgesetz (BFSG)** came into force in Germany on 28 June 2025, transposing EU Directive 2019/882 (European Accessibility Act – EAA). It mandates that products and services in listed categories meet **WCAG 2.1 Level AA** accessibility requirements. Web applications providing services to consumers may be covered. An accessibility statement must be published, and non-conformities documented.

---

## 2. Applicable Law

| Law / Regulation | Paragraph / Article | Requirement |
|---|---|---|
| BFSG 2021 (BGBl. I S. 2970) | § 1, § 3 | Scope: products and services provided to consumers |
| BFSG 2021 | § 4 | Accessibility requirements (refer to EN 301 549 / WCAG 2.1 AA) |
| BFSG 2021 | § 7 | Accessibility statement (Barrierefreiheitserklärung) |
| BFSG 2021 | § 10 | Enforcement body (Marktüberwachungsbehörde) |
| BFSG 2021 | § 20 ff. | Penalties for non-compliance |
| EU Directive 2019/882 | Art. 4 | Harmonised accessibility requirements |
| WCAG 2.1 Level AA | Success Criteria 1.1–4.1 | Technical standard referenced by EN 301 549 |
| BGG (Behindertengleichstellungsgesetz) | § 12 | Public sector (separately; BFSG covers private sector) |

### Scope Determination

BFSG § 3 Nr. 2 defines covered "services" as those provided to consumers via electronic communications. A web application operated commercially for end consumers in Germany **is covered** if it falls within the listed service categories. Online communication and information services are explicitly included.

**Conclusion:** SketchGit (collaborative drawing, offered to end users) is likely covered by BFSG. If the operator is a private individual operating non-commercially (Privatperson, nicht gewerblich), the BFSG may not apply under § 2 Abs. 2. This must be assessed based on the actual business model.

---

## 3. Current State

### Implemented

- ARIA labels on interactive elements (buttons, form fields)
- Semantic HTML (`<form>`, `<button>`, `<main>`)
- Dark/light theme toggle
- Keyboard navigation support in forms
- Focus management in modal dialogs
- `lang` attribute on `<html>` element
- `autoComplete` attributes on form fields

### Gaps Identified

The canvas interface (built on Fabric.js) poses inherent accessibility challenges:

| Gap | WCAG Criterion | Description |
|---|---|---|
| Canvas is not keyboard-navigable | 2.1.1 Keyboard | Fabric.js canvas is a bitmap; objects are not exposed to the accessibility tree |
| No alternative text for canvas content | 1.1.1 Non-text Content | Drawing content has no text equivalent |
| No screen reader announcements for drawing operations | 4.1.3 Status Messages | Add/remove/select actions not announced via ARIA live regions |
| No skip-to-content link | 2.4.1 Bypass Blocks | No way to bypass navigation |
| Colour contrast not audited | 1.4.3 Contrast (Minimum) | UI elements and text not verified against 4.5:1 ratio |
| Touch target sizes not verified | 2.5.8 Target Size (Minimum) – WCAG 2.2 | Toolbar buttons may be < 24×24 px |
| No accessibility statement page | BFSG § 7 | Required if BFSG applies |
| No formal WCAG 2.1 AA audit documented | BFSG § 4 | Required documentation |

---

## 4. What Needs to Be Done

### 4.1 Conduct a Formal WCAG 2.1 AA Audit

Use an automated tool for initial coverage:
- **axe-core** (free, integrates with browser DevTools via axe DevTools extension)
- **WAVE** (free browser extension)
- **Lighthouse** accessibility score

Then follow up with **manual testing:**
- Navigate entire app using keyboard only (Tab, Shift+Tab, Enter, Space, Arrow keys)
- Test with a screen reader (NVDA + Chrome on Windows; VoiceOver + Safari on macOS)
- Test with 200% browser zoom
- Verify all interactive elements are reachable and usable without a mouse

### 4.2 Canvas Accessibility – Minimum Requirements

The drawing canvas presents a fundamental accessibility challenge. At minimum:

1. **ARIA role and label:** Add `role="application"` and `aria-label="Zeichenfläche"` to the canvas element.
2. **ARIA live region:** Announce significant state changes (e.g., "Objekt hinzugefügt", "Commit gespeichert") via an ARIA live region (`aria-live="polite"`).
3. **Alternative description:** Provide a way to view a text description of the canvas (e.g., list of objects), perhaps toggled by a keyboard shortcut.
4. **Keyboard shortcuts:** Document existing keyboard shortcuts in a help dialog.
5. **Focus ring:** Ensure the selected Fabric.js object shows a visible focus ring.

**Note:** Full WCAG compliance for a complex canvas application may not be achievable without significant architectural work. BFSG § 7 Abs. 4 allows documenting a **disproportionate burden (unverhältnismäßige Belastung)** justification if full compliance would require fundamental alteration or excessive effort. This must be formally assessed and documented.

### 4.3 Non-Canvas UI Fixes

**Priority fixes for the non-canvas UI:**

| Fix | WCAG Criterion | Implementation |
|---|---|---|
| Add skip-to-content link | 2.4.1 | `<a href="#main-content" class="skip-link">Zum Inhalt springen</a>` at the top of the body |
| Verify colour contrast | 1.4.3 | Run Colour Contrast Analyser on all text/background combinations |
| Ensure all images have alt text | 1.1.1 | Review all `<img>` elements |
| Ensure error messages are associated via `aria-describedby` | 1.3.1 | Review form validation messages |
| Add visible focus indicators | 2.4.7 | Ensure `:focus` styles are never `outline: none` without replacement |

### 4.4 Accessibility Statement (Barrierefreiheitserklärung, BFSG § 7)

Create a page at `/barrierefreiheit` (or `/accessibility`) containing:

```
Barrierefreiheitserklärung

[Name des Betreibers] ist bestrebt, die Website SketchGit gemäß den 
Anforderungen des Barrierefreiheitsstärkungsgesetzes (BFSG) barrierefrei 
zugänglich zu machen.

Stand der Vereinbarkeit mit den Anforderungen
[Status: voll konform / teilweise konform / nicht konform]

Nicht barrierefreie Inhalte
Die folgenden Inhalte sind aus den folgenden Gründen nicht barrierefrei:
- Die interaktive Zeichenfläche (Canvas) ist nicht vollständig 
  tastatur- und screenreaderzugänglich. [Begründung der unverhältnismäßigen 
  Belastung, falls zutreffend]

Feedback und Kontakt
Bei Problemen mit der Barrierefreiheit wenden Sie sich bitte an:
E-Mail: [kontakt@example.com]

Wir bemühen uns, Ihre Anfrage innerhalb von 10 Arbeitstagen zu beantworten.

Schlichtungsverfahren
Wenn Sie auf unsere Rückmeldung nicht zufriedenstellend antworten,
können Sie sich an [zuständige Behörde] wenden.
```

### 4.5 Add Accessibility Testing to CI

Add automated accessibility testing to prevent regressions:

```bash
# Example with axe-playwright
npm install --save-dev @axe-core/playwright

# Run accessibility checks in Playwright tests
const { checkA11y } = require('@axe-core/playwright');
await checkA11y(page, null, { runOnly: ['wcag2a', 'wcag2aa'] });
```

---

## 5. Priority Order

1. **Immediate:** Create accessibility statement page (BFSG § 7) even if it documents known gaps
2. **Short-term (1–3 months):** Fix non-canvas UI gaps (skip link, contrast, focus indicators, ARIA errors)
3. **Medium-term (3–6 months):** Canvas accessibility improvements (ARIA live regions, keyboard shortcuts documentation)
4. **Long-term:** Formal WCAG 2.1 AA third-party audit; automated CI accessibility testing

---

## 6. Enforcement

BFSG enforcement is handled by the **Marktüberwachungsbehörden** of each German state. Penalties for non-compliance include fines. Additionally, consumers may enforce rights under the **BFSG § 15** feedback mechanism.

---

## 7. Verification

1. Accessibility statement page exists at `/barrierefreiheit` with required content.
2. Lighthouse accessibility score ≥ 90 on key pages (registration, dashboard, settings).
3. App can be navigated by keyboard alone (tested manually).
4. axe-core reports zero critical violations on key pages.
5. Screen reader testing performed and documented.
