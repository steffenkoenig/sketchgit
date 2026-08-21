# GAP-016 – Google Fonts CDN (DSGVO / TTDSG – IP-Adressenübermittlung an Google)

**Status:** ❌ Open  
**Priority:** 🔴 Critical  
**Category:** DSGVO / TTDSG  
**Effort Estimate:** 1–2 hours  

---

## 1. Description

The application loads web fonts directly from Google's CDN via an `@import` rule in `app/globals.css`. Every user visiting any page of the application has their **IP address automatically transmitted to Google's servers** without prior consent. German courts (LG München I, January 2022) have found this to be a violation of DSGVO and TTDSG because Google's servers are located in the USA and the IP address constitutes personal data.

**This gap can be fully fixed in less than two hours and should be the first thing addressed before any public deployment.**

---

## 2. Evidence

**File:** `app/globals.css`, line 1:

```css
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@300;400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');
```

Every page render triggers a browser request to `https://fonts.googleapis.com`, which:
1. Sends the user's IP address to Google (US-based server)
2. Sends the `Referer` header (your domain)
3. Potentially sets Google cookies or tracking pixels

---

## 3. Applicable Law

| Law / Regulation | Article / Paragraph | Requirement |
|---|---|---|
| DSGVO 2016/679 | Art. 6 Abs. 1 | Processing (IP transfer) requires a legal basis |
| DSGVO 2016/679 | Art. 44 | Transfer of personal data to third countries requires adequacy decision or SCCs |
| TTDSG 2021 | § 25 Abs. 1 | Storing/accessing terminal equipment requires prior consent (except strictly necessary) |
| DSGVO 2016/679 | Art. 83 Abs. 5 | Fine: up to €20M or 4% global turnover |

---

## 4. Court Precedent

**LG München I, Urteil vom 20.01.2022, Az. 3 O 17493/20:**

The Landgericht München I (Munich Regional Court) ruled that embedding Google Fonts via a CDN URL without user consent:
- Constitutes an **unlawful transfer of personal data (IP address)** to a third country (USA) without adequate safeguards (at the time, Privacy Shield had been invalidated by Schrems II)
- Violates **DSGVO Art. 6 Abs. 1** (no legal basis for IP transfer to Google)
- Awarded **€100 damages** to the plaintiff data subject
- Required the operator to cease using the CDN-based Google Fonts immediately

The ruling applies to the current Google Fonts CDN integration in SketchGit.

**Additional rulings and guidelines:**
- OLG München, Beschluss vom 08.09.2022 – upheld the LG München I approach
- Bayerisches Landesamt für Datenschutzaufsicht (BayLDA) – repeated warnings about Google Fonts CDN usage
- EDPB Guidelines 05/2021 on transfers of personal data in international context

> **Note on EU-US Data Privacy Framework (DPF):** The DPF (Commission Decision 2023/1795) restored adequacy for US DPF-certified organisations. Google LLC is DPF-certified. However, even with DPF adequacy, **TTDSG § 25 requires prior consent** for accessing terminal equipment. Since Google Fonts is not strictly necessary for the service, consent remains required if using the CDN.

---

## 5. What Needs to Be Done

### 5.1 Option A – Self-Host the Fonts (Recommended)

This eliminates the legal issue entirely with no ongoing compliance overhead.

**Steps:**

1. Download the font files:
   ```bash
   # Using google-webfonts-helper (https://gwfh.mranftl.com/fonts)
   # Or manually download from Google Fonts and save to /public/fonts/
   ```

2. Download Fira Code and Space Grotesk as WOFF2 (all required weights):
   ```
   /public/fonts/
     fira-code-300.woff2
     fira-code-400.woff2
     fira-code-500.woff2
     fira-code-600.woff2
     space-grotesk-400.woff2
     space-grotesk-500.woff2
     space-grotesk-600.woff2
     space-grotesk-700.woff2
   ```

3. Replace the CDN `@import` in `app/globals.css` with local `@font-face` declarations:

   ```css
   /* Replace the @import url('https://fonts.googleapis.com/...') line with: */
   
   @font-face {
     font-family: 'Space Grotesk';
     font-style: normal;
     font-weight: 400;
     font-display: swap;
     src: url('/fonts/space-grotesk-400.woff2') format('woff2');
   }
   @font-face {
     font-family: 'Space Grotesk';
     font-style: normal;
     font-weight: 500;
     font-display: swap;
     src: url('/fonts/space-grotesk-500.woff2') format('woff2');
   }
   @font-face {
     font-family: 'Space Grotesk';
     font-style: normal;
     font-weight: 600;
     font-display: swap;
     src: url('/fonts/space-grotesk-600.woff2') format('woff2');
   }
   @font-face {
     font-family: 'Space Grotesk';
     font-style: normal;
     font-weight: 700;
     font-display: swap;
     src: url('/fonts/space-grotesk-700.woff2') format('woff2');
   }
   @font-face {
     font-family: 'Fira Code';
     font-style: normal;
     font-weight: 300;
     font-display: swap;
     src: url('/fonts/fira-code-300.woff2') format('woff2');
   }
   @font-face {
     font-family: 'Fira Code';
     font-style: normal;
     font-weight: 400;
     font-display: swap;
     src: url('/fonts/fira-code-400.woff2') format('woff2');
   }
   @font-face {
     font-family: 'Fira Code';
     font-style: normal;
     font-weight: 500;
     font-display: swap;
     src: url('/fonts/fira-code-500.woff2') format('woff2');
   }
   @font-face {
     font-family: 'Fira Code';
     font-style: normal;
     font-weight: 600;
     font-display: swap;
     src: url('/fonts/fira-code-600.woff2') format('woff2');
   }
   ```

4. **Alternatively**, use Next.js's built-in `next/font/google` which **automatically self-hosts** the fonts at build time (downloads fonts during `next build` and serves them from `/_next/static/`):

   In `app/layout.tsx`:
   ```typescript
   import { Space_Grotesk, Fira_Code } from 'next/font/google';
   
   const spaceGrotesk = Space_Grotesk({
     subsets: ['latin'],
     weight: ['400', '500', '600', '700'],
     variable: '--font-space-grotesk',
     display: 'swap',
   });
   
   const firaCode = Fira_Code({
     subsets: ['latin'],
     weight: ['300', '400', '500', '600'],
     variable: '--font-fira-code',
     display: 'swap',
   });
   ```

   The `next/font/google` approach is the **simplest and recommended solution**: Next.js handles downloading and hosting the fonts automatically with zero network requests to Google at runtime.

### 5.2 Option B – Cookie Consent Banner with Google Fonts (Not Recommended)

If fonts must come from Google CDN, add a cookie/consent banner and:
1. Block the Google Fonts `@import` until consent is given
2. This requires a full Consent Management Platform (CMP)
3. Use a system font fallback until consent

**This option is significantly more complex and inferior to Option A.**

### 5.3 CSP Header Update

After self-hosting fonts, update the Content-Security-Policy in `proxy.ts`:
- Remove `https://fonts.googleapis.com` and `https://fonts.gstatic.com` from `style-src` and `font-src` directives (if they were added there).
- Verify the CSP allows loading fonts from `'self'`.

---

## 6. Impact

Fixing this gap:
- Eliminates the LG München I risk immediately
- Requires no consent banner for fonts
- Improves performance (fonts served from your own CDN/server, no additional DNS lookup)
- Reduces external dependencies
- May improve Lighthouse performance score

---

## 7. Verification

1. Open browser DevTools → Network tab.
2. Load the application.
3. Confirm **zero requests** to `fonts.googleapis.com` or `fonts.gstatic.com`.
4. Confirm fonts render correctly (Space Grotesk for UI, Fira Code for code/canvas).
5. `curl -I https://[your-domain.com]` → check response headers; no `Link: <https://fonts.googleapis.com>` header.
6. Run `npm run build` → if using `next/font/google`, confirm font files appear in `.next/static/`.
