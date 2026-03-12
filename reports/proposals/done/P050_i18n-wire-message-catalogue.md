# P050 – Wire the Existing i18n Message Catalogue to the UI

## Title
Integrate `next-intl` to Consume the Pre-existing `messages/en.json` and `messages/de.json` Translation Files

## Brief Summary
The repository already contains a fully translated message catalogue in two languages: `messages/en.json` (English) and `messages/de.json` (German). These files cover every user-facing string in the application — toolbar tooltips, modal titles, toast messages, error messages, commit popup labels, and aria-live region text. Despite this substantial translation work, the files are never consumed. Every string in `SketchGitApp.tsx`, `mergeEngine.ts`, `collaborationManager.ts`, and `wsClient.ts` is hardcoded in English. Wiring `next-intl` (the standard Next.js i18n library, zero new concept) to read these files requires approximately 60–90 minutes of work and zero new translation effort — the catalogue is complete.

## Current Situation
### Translation files exist but are unused
```
messages/
  en.json   # 120+ keys across toolbar, topbar, modal, toast, errors, objectTypes, propLabels
  de.json   # same structure, fully translated to German
```

### Hardcoded strings throughout the codebase
Example — `mergeEngine.ts` line 45:
```typescript
export const OBJ_TYPE_LABELS: Record<string, string> = {
  rect: '▭ Rectangle',
  ellipse: '○ Ellipse',
  // … all duplicated in messages/en.json → objectTypes
};
```

Example — `collaborationManager.ts`:
```typescript
showToast('📥 Commit received: ' + (data.commit as { message: string })?.message);
// → messages/en.json: "toast.commitReceived": "📥 Commit received: {message}"
```

Example — `SketchGitApp.tsx`:
```tsx
<h1 id="nameModalTitle">👤 Welcome to SketchGit</h1>
// → messages/en.json: "modal.name.title": "👤 Welcome to SketchGit"
```

Example — error strings in `gitModel.ts`:
```typescript
this.onError('⚠ Detached HEAD — create a branch first!');
// → messages/en.json: "errors.detachedHeadCommit": "⚠ Detached HEAD — create a branch first!"
```

### `package.json` does NOT yet include `next-intl`
The i18n library needs to be added. Everything else (message files, string identification) is already done.

## Problem with Current Situation
1. **Dead translation work**: Two complete translation catalogues exist but are completely ignored. Any future update to English strings must be manually synchronised with both JSON files — a process that is not enforced and will inevitably drift.
2. **Non-functional German UI**: German-speaking users have no way to use the application in their language despite the translation being available.
3. **String duplication**: `OBJ_TYPE_LABELS` in `mergeEngine.ts` duplicates `messages/en.json → objectTypes`. `MergeConflict.propConflicts` display labels duplicate `propLabels`. Any change to the displayed text requires edits in two places.
4. **No locale switching**: Without `next-intl`, the app has no mechanism for URL-based locale selection (`/en/`, `/de/`) or browser locale detection.
5. **Lost effort**: The translation author (who translated 120+ keys into German) has produced work that currently has zero user impact.

## Goal to Achieve
1. Install `next-intl` and configure it for the `app/` directory (App Router).
2. Set up locale detection (browser `Accept-Language` header, with English as the default fallback).
3. Replace hardcoded strings in `SketchGitApp.tsx` and all modal JSX with `t('key')` calls.
4. Replace the `OBJ_TYPE_LABELS` map in `mergeEngine.ts` with a lookup from the message catalogue.
5. Replace toast strings in `collaborationManager.ts` with `messages/en.json` keys.
6. Provide a locale switcher button (EN/DE) in the topbar.
7. Zero new translation effort required — both catalogues are complete.

## What Needs to Be Done

### 1. Install `next-intl`
```bash
npm install next-intl
```

### 2. Create `i18n.ts` (next-intl configuration)
```typescript
// i18n.ts
import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';

export default getRequestConfig(async () => {
  const acceptLanguage = (await headers()).get('accept-language') ?? 'en';
  // Simple locale extraction: take the first language code
  const rawLocale = acceptLanguage.split(',')[0]?.split('-')[0]?.toLowerCase() ?? 'en';
  const locale = ['en', 'de'].includes(rawLocale) ? rawLocale : 'en';

  const messages = await import(`../messages/${locale}.json`);
  return { locale, messages: messages.default };
});
```

### 3. Update `next.config.mjs` to enable next-intl plugin
```javascript
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['fabric'],
  // … existing headers() config …
};

export default withNextIntl(nextConfig);
```

### 4. Update `app/layout.tsx` to provide locale context
```tsx
import { NextIntlClientProvider, useMessages } from 'next-intl';
import { getLocale } from 'next-intl/server';

export default async function RootLayout({ children }: RootLayoutProps) {
  const locale = await getLocale();
  const messages = useMessages();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

### 5. Replace hardcoded strings in `SketchGitApp.tsx`
```tsx
// Before:
<h2 id="commitModalTitle">● Commit Changes</h2>

// After:
const t = useTranslations('modal.commit');
// …
<h2 id="commitModalTitle">{t('title')}</h2>
```

### 6. Replace `OBJ_TYPE_LABELS` in `mergeEngine.ts`
The current `OBJ_TYPE_LABELS` map is a pure function of locale. Replace it with a function that accepts a locale parameter:
```typescript
// mergeEngine.ts – receive labels map from caller rather than hardcoding
export function getObjLabel(
  obj: Record<string, unknown> | null | undefined,
  typeLabels: Record<string, string>,
): string {
  if (!obj) return 'Object';
  const type = (obj.type as string) || 'object';
  const base = typeLabels[type] ?? type;
  const id = obj._id ? (obj._id as string).slice(4, 10) : '?';
  return `${base} #${id}`;
}
```

The caller (merge conflict UI) passes `t.raw('objectTypes')` as `typeLabels`.

### 7. Add a locale switcher to `AppTopbar`
```tsx
// components/sketchgit/AppTopbar.tsx
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';

// Add a simple EN/DE toggle button
<button onClick={() => router.push(`?locale=${locale === 'en' ? 'de' : 'en'}`)}>
  {locale.toUpperCase()}
</button>
```

Note: For a full locale-switcher implementation, use `next-intl`'s `useRouter` to navigate to the same path with the opposite locale cookie set.

### 8. Tests
- Render `SketchGitApp` with `locale=de` → modal titles appear in German.
- `getObjLabel({ type: 'rect', _id: 'obj_123456' }, deLabels)` → `"▭ Rechteck #123456"` (German label from `messages/de.json`).
- `i18n.ts` with `Accept-Language: de-DE` → returns `locale = 'de'`.
- `i18n.ts` with unknown locale `'ja'` → falls back to `'en'`.

## Components Affected
| Component | Change |
|-----------|--------|
| `package.json` | Add `next-intl` dependency |
| `i18n.ts` | **New file** – next-intl request config |
| `next.config.mjs` | Wrap config with `withNextIntl` plugin |
| `app/layout.tsx` | Add `NextIntlClientProvider` + locale attribute |
| `components/SketchGitApp.tsx` | Replace hardcoded strings with `useTranslations()` |
| `lib/sketchgit/git/mergeEngine.ts` | Parameterise `getObjLabel` with `typeLabels` argument |
| `lib/sketchgit/realtime/collaborationManager.ts` | Use translated toast strings |
| `components/sketchgit/AppTopbar.tsx` | Add locale switcher button |
| `.github/workflows/ci.yml` | No change required |

## Data & Database Model
No changes. Locale preference is stateless (determined from request headers or a cookie).

## Testing Requirements
- Locale detection: `Accept-Language: de` → German UI strings.
- Locale detection: `Accept-Language: ja` → falls back to English.
- `getObjLabel` with German labels → German object type names.
- Toast messages use translated strings, not hardcoded English.
- CI: `npm run lint` must still pass (no new ESLint violations from `t()` calls).

## Linting and Type Requirements
- `next-intl` ships TypeScript types; `useTranslations('modal.commit')` is fully typed when a `global.d.ts` type augmentation is added (standard `next-intl` setup).
- `messages/en.json` becomes the type source of truth via `typeof import('./messages/en.json')`.
- The German translation file (`messages/de.json`) already matches the English key structure exactly — no structural changes needed.

## Dependency Map
- Depends on: P021 ✅ (React memoization — translated strings are stable references; no re-render impact)
- No blocking dependencies — can be implemented at any time as an isolated PR
- Enables: support for additional languages by adding new `messages/<locale>.json` files with zero code changes
