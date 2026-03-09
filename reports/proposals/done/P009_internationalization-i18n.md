# P009 – Internationalization (i18n) Support

## Title
Internationalization (i18n) Support

## Brief Summary
The application's user-facing text is a mix of English (most labels) and German (object-type labels in the conflict resolution UI). There is no localization infrastructure. Adding i18n support will unify the language, eliminate hardcoded German strings, and lay the groundwork for serving users in multiple languages.

## Current Situation
The conflict resolution modal in `createSketchGitApp.ts` contains a hardcoded object-type label map with German strings:

```javascript
const typeLabels = {
  'rect':     '▭ Rechteck',
  'ellipse':  '○ Ellipse',
  'path':     '✏ Pfad',
  'line':     '╱ Linie',
  'i-text':   '✎ Text',
  'group':    '⊞ Gruppe',
};
```

All other user-facing text—buttons, toasts, modal titles, placeholder text, toolbar tooltips—is hardcoded as English string literals scattered throughout the component files and the engine.

There is no `i18n` library, no locale detection, no translation file format, and no mechanism to switch languages at runtime.

## Problem with Current Situation
- **Inconsistency**: The application presents itself in English, but the conflict UI unexpectedly switches to German for object type names. This is confusing to all users who are not German speakers.
- **No localization path**: Any future attempt to translate the application requires hunting through all files for string literals with no structure or tooling to assist.
- **Maintenance burden**: When new UI strings are added, there is no reminder or enforcement to add translations, so gaps accumulate.
- **International reach**: The application is hosted publicly. Without localization, non-English users face an inferior experience, and German-speaking users receive an inconsistent hybrid.

## Goal to Achieve
1. Replace all German strings with English equivalents immediately (a quick fix).
2. Extract all hardcoded UI strings into a structured locale file format.
3. Integrate a lightweight i18n library that supports locale detection and dynamic switching.
4. Enable contributors to add new language translations without modifying source code.

## What Needs to Be Done

### 1. Immediate fix: replace German labels with English
This is a one-line change that resolves the inconsistency without any infrastructure:
```javascript
const typeLabels = {
  'rect':    '▭ Rectangle',
  'ellipse': '○ Ellipse',
  'path':    '✏ Path',
  'line':    '╱ Line',
  'i-text':  '✎ Text',
  'group':   '⊞ Group',
};
```

### 2. Choose an i18n library

#### Option A – `next-intl` (recommended for Next.js)
- First-class Next.js App Router support.
- Server and client component compatible.
- TypeScript-safe message keys.
- Simple JSON message files per locale.
- Supports pluralization, date/number formatting.

#### Option B – `react-i18next`
- Widely used, large ecosystem.
- Works with any React setup.
- More boilerplate than `next-intl` for App Router.

#### Option C – Custom solution
- Simple object lookup (`t('key')`) without a library.
- Sufficient for a small string count.
- Does not support pluralization, formatting, or locale detection.

**Recommended**: `next-intl` for full App Router integration, or a simple custom solution if the string count remains small (< 100 strings) and only English is needed initially.

### 3. Create a message file structure
```
messages/
├── en.json     # English (primary)
├── de.json     # German (secondary, where the type labels already exist)
└── [locale].json
```

Example `en.json` structure:
```json
{
  "toolbar": {
    "select": "Select",
    "pen": "Pen",
    "line": "Line",
    "arrow": "Arrow",
    "rect": "Rectangle",
    "ellipse": "Ellipse",
    "text": "Text",
    "eraser": "Eraser"
  },
  "topbar": {
    "commit": "Commit",
    "newBranch": "New Branch",
    "merge": "Merge"
  },
  "modal": {
    "commit": {
      "title": "Create Commit",
      "placeholder": "Commit message…",
      "confirm": "Commit",
      "cancel": "Cancel"
    },
    "conflict": {
      "title": "Merge Conflicts",
      "chooseOurs": "Keep Ours",
      "chooseTheirs": "Use Theirs"
    }
  },
  "objectTypes": {
    "rect":    "▭ Rectangle",
    "ellipse": "○ Ellipse",
    "path":    "✏ Path",
    "line":    "╱ Line",
    "i-text":  "✎ Text",
    "group":   "⊞ Group"
  },
  "toast": {
    "committed": "Committed: {message}",
    "branchCreated": "Branch \"{name}\" created",
    "merged": "Merged \"{branch}\" into \"{target}\""
  }
}
```

### 4. Integrate `next-intl` into the Next.js App Router

Follow the `next-intl` App Router setup:
- Add `i18n.ts` configuration file for supported locales and default locale.
- Update `app/layout.tsx` to wrap with `NextIntlClientProvider`.
- Update `app/page.tsx` to pass the locale.
- Add locale detection middleware (`middleware.ts`).

### 5. Replace hardcoded strings
Replace all string literals in component files and (after P001) in the extracted UI modules with `t('key')` calls from `next-intl`'s `useTranslations` hook (in React components) or `getTranslations()` (in server components / non-React modules).

### 6. Add a language switcher (optional)
Add a simple locale dropdown to the topbar or settings panel that persists the selected locale in a cookie.

### 7. Contribute a German translation
Since some German strings already exist (the object type labels), contribute a full `de.json` as the first complete non-English translation to validate the infrastructure.

## What Components Are Affected
| Component | Impact |
|-----------|--------|
| `lib/sketchgit/createSketchGitApp.ts` | Replace hardcoded German and English strings with `t()` calls |
| `components/sketchgit/LeftToolbar.tsx` | Replace toolbar button labels |
| `components/sketchgit/AppTopbar.tsx` | Replace topbar button labels |
| `components/SketchGitApp.tsx` | Replace modal titles, placeholder text |
| `app/layout.tsx` | Wrap with `NextIntlClientProvider` |
| New `messages/` directory | Add `en.json` and `de.json` |
| New `middleware.ts` | Locale detection and routing |
| `package.json` | Add `next-intl` |

## Additional Considerations

### Scope of Step 1
The immediate fix (replacing German labels with English) can be done in minutes and independently of all i18n infrastructure work. It should be treated as a quick bug fix and deployed as soon as possible.

### Non-React modules
After P001, some UI code will remain in non-React TypeScript modules (e.g., timeline renderer, toast). For these, a simple `t(key)` function that reads from the active locale's message map (loaded once at startup) is sufficient, without requiring a React hook.

### Right-to-left language support
If Arabic, Hebrew, or other RTL languages are added in the future, Tailwind CSS's `rtl:` variant can handle layout mirroring. This is out of scope for the initial i18n implementation but should be kept in mind when choosing CSS patterns.

### String extraction tooling
`next-intl` and `react-i18next` both have companion CLI tools and IDE plugins that can scan source files and extract string literals into message files automatically. These tools are useful for the initial migration to reduce manual effort.
