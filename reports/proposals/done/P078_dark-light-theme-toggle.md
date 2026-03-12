# P078 – Dark/Light Theme Toggle with `prefers-color-scheme` Support

## Title
Add a User-Selectable Dark/Light Theme Toggle to the Application UI, Respecting `prefers-color-scheme` as the Default, with CSS Custom Properties for All Colour Values

## Brief Summary
The application currently uses a hard-coded dark theme via inline CSS and Tailwind utility classes with literal colour values (e.g., `bg-slate-950/80`, `text-slate-200`). There is no way for users to switch to a light theme, and the application ignores the browser's `prefers-color-scheme` media feature. Migrating colour values to CSS custom properties (CSS variables) in a `:root` block, defining a `.theme-light` selector that overrides those variables, and storing the user's preference in a cookie (same pattern as the locale switcher in `AppTopbar.tsx`) adds full light theme support in a single CSS change plus a small React component.

## Current Situation
```css
/* From the application's global CSS */
:root { /* no CSS custom properties defined */ }
.bg-slate-950\/80 { /* literal Tailwind utility */ }
```

The canvas background is hard-coded in `canvasRenderer.ts`:
```typescript
const BACKGROUND_COLOR = '#0a0a0f';  // always dark
```

In `app/layout.tsx`:
```tsx
<html lang={locale}>
  <body className="bg-slate-950 text-slate-200 antialiased">
```

In `components/sketchgit/AppTopbar.tsx`:
```tsx
<nav className="bg-slate-950/80 ...">
```

The locale switcher (P050) uses a `NEXT_LOCALE` cookie + `window.location.reload()` pattern that could be reused for theme switching.

## Problem with Current Situation
1. **Ignores user preference**: Users who have `prefers-color-scheme: light` set in their OS settings receive the dark theme unconditionally.
2. **Not accessible for all users**: Some users with low-vision or photosensitivity require a light background. WCAG 2.1 Success Criterion 1.4.3 (Contrast) is satisfied for the dark theme, but the light theme may also be needed for some users.
3. **Hard-coded colour values**: Colours are scattered across 15+ component files and global CSS. Any future rebrand or colour adjustment requires changing dozens of files.
4. **Canvas background is always dark**: Even if the UI could be themed, the canvas area (`#0a0a0f`) is always dark. The canvas background should follow the theme.
5. **No CSS custom properties architecture**: Without CSS variables, there is no single source of truth for the application's colour palette. Tailwind utility classes are the de-facto colour system, but they are not overridable at runtime without JavaScript.

## Goal to Achieve
1. Define all application colours as CSS custom properties in `app/globals.css` in a `:root` block (dark theme as default).
2. Add a `.theme-light` CSS class on `<html>` that overrides the custom properties with light-theme colours.
3. Store the user's theme preference in a `THEME` cookie (same pattern as `NEXT_LOCALE`).
4. Apply the `THEME` cookie in `app/layout.tsx` by reading it server-side and setting the appropriate class on `<html>`.
5. Add a theme toggle button to `AppTopbar.tsx` alongside the locale switcher.
6. Update `canvasRenderer.ts` to use `process.env.CANVAS_BACKGROUND_LIGHT` / `CANVAS_BACKGROUND_DARK` for theming the export.
7. Respect `prefers-color-scheme` as the default when no cookie is set (client-side only, no server-side flash).

## What Needs to Be Done

### 1. Define CSS custom properties in `app/globals.css`
```css
/* Dark theme (default) */
:root {
  --bg-primary:   #0a0a0f;   /* main background */
  --bg-secondary: #13131f;   /* panel backgrounds */
  --bg-nav:       rgba(13, 13, 25, 0.85); /* topbar / toolbar */
  --text-primary: #e2e8f0;   /* slate-200 */
  --text-muted:   #94a3b8;   /* slate-400 */
  --border:       rgba(255, 255, 255, 0.08);
  --canvas-bg:    #0a0a0f;
  --accent:       #7c6eff;   /* violet-500 */
}

/* Light theme overrides */
.theme-light {
  --bg-primary:   #f8fafc;   /* slate-50 */
  --bg-secondary: #f1f5f9;   /* slate-100 */
  --bg-nav:       rgba(248, 250, 252, 0.9);
  --text-primary: #0f172a;   /* slate-900 */
  --text-muted:   #475569;   /* slate-600 */
  --border:       rgba(0, 0, 0, 0.12);
  --canvas-bg:    #ffffff;
  --accent:       #6d28d9;   /* violet-700 */
}
```

### 2. Update component Tailwind classes to use CSS variables
Tailwind supports CSS variable references via square brackets:
```tsx
// Before:
<body className="bg-slate-950 text-slate-200">

// After:
<body className="antialiased" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
```
Alternatively, use `@layer base` in `globals.css` to override Tailwind base styles:
```css
@layer base {
  body {
    background-color: var(--bg-primary);
    color: var(--text-primary);
  }
}
```

### 3. Read theme cookie in `app/layout.tsx`
```tsx
import { cookies } from 'next/headers';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const theme = cookieStore.get('THEME')?.value ?? 'dark';
  const themeClass = theme === 'light' ? 'theme-light' : '';

  return (
    <html lang={locale} className={themeClass}>
      <body>…</body>
    </html>
  );
}
```

### 4. Add theme toggle button to `AppTopbar.tsx`
```tsx
function ThemeToggle() {
  const [theme, setTheme] = React.useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    // Read from cookie or fall back to prefers-color-scheme
    const cookieTheme = document.cookie.match(/THEME=(\w+)/)?.[1];
    if (cookieTheme) return cookieTheme as 'dark' | 'light';
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.cookie = `THEME=${next}; path=/; max-age=31536000; SameSite=Lax`;
    document.documentElement.classList.toggle('theme-light', next === 'light');
  }

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={theme === 'light'}
      className="text-slate-400 hover:text-slate-200 transition-colors px-1.5"
    >
      {theme === 'dark' ? '☀' : '🌙'}
    </button>
  );
}
```

### 5. Update `canvasRenderer.ts` to use the theme variable
```typescript
const BACKGROUND_COLOR_DARK = '#0a0a0f';
const BACKGROUND_COLOR_LIGHT = '#ffffff';

// The canvas background cannot be determined from a server-side cookie during export.
// Default to dark for all exports; the user can pass ?theme=light as an export query param.
export async function renderToSVG(
  json: object,
  theme: 'dark' | 'light' = 'dark',
): Promise<string> {
  const backgroundColor = theme === 'light' ? BACKGROUND_COLOR_LIGHT : BACKGROUND_COLOR_DARK;
  // … rest of implementation …
}
```

Add `theme` as a query parameter to the export endpoint:
```typescript
const QuerySchema = z.object({
  format: z.enum(["png", "svg", "pdf"]).default("png"),
  sha: z.string().max(64).optional(),
  theme: z.enum(["dark", "light"]).default("dark"),
});
```

### 6. Add i18n keys
`messages/en.json`:
```json
"topbar": {
  ...
  "switchToLight": "Switch to light theme",
  "switchToDark": "Switch to dark theme"
}
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `app/globals.css` | Add CSS custom properties for dark/light themes |
| `app/layout.tsx` | Read `THEME` cookie; apply `theme-light` class to `<html>` |
| `components/sketchgit/AppTopbar.tsx` | Add `ThemeToggle` component |
| `lib/export/canvasRenderer.ts` | Accept `theme` parameter; use themed background colour |
| `app/api/rooms/[roomId]/export/route.ts` | Add `theme` query param |
| `messages/en.json` | Add theme toggle i18n keys |
| `messages/de.json` | Add German theme toggle i18n keys |

## Additional Considerations

### Flash of unstyled content (FOUC)
When the page loads, there is a brief moment where the HTML has no class and the browser renders with the default `:root` styles (dark theme). If the user has chosen a light theme, this causes a dark flash before the cookie is read server-side and the `theme-light` class is applied. Because `app/layout.tsx` reads the cookie server-side (via `cookies()`), the HTML is rendered with the correct class on first load — no FOUC.

### `prefers-color-scheme` integration
The `prefers-color-scheme` media feature is handled client-side only in the `ThemeToggle` component's initializer. Server-side rendering cannot access media features. The cookie takes priority over the media feature; users who have set the OS preference but not the cookie will see the default dark theme on first visit. A small inline script in `<head>` can check both:
```html
<script>
  if (!document.cookie.includes('THEME=') &&
      window.matchMedia('(prefers-color-scheme: light)').matches) {
    document.documentElement.classList.add('theme-light');
  }
</script>
```
This script must have a nonce (P056) to comply with the CSP.

### Tailwind migration scope
Migrating all Tailwind utility classes to CSS variables is a large but incremental change. A two-phase approach is recommended:
1. Phase 1 (this proposal): Add CSS variables; update `body` and navigation backgrounds; add the toggle.
2. Phase 2 (follow-up): Systematically replace all remaining Tailwind colour utilities with `var(--*)` equivalents.

## Testing Requirements
- `app/layout.tsx` applies `class="theme-light"` to `<html>` when the `THEME=light` cookie is set.
- `app/layout.tsx` applies no theme class when the `THEME=dark` cookie is set.
- `ThemeToggle` sets the `THEME` cookie and toggles the `theme-light` class on `document.documentElement` when clicked.
- `renderToSVG(json, 'light')` uses `#ffffff` as the background colour.
- `renderToSVG(json, 'dark')` uses `#0a0a0f` as the background colour.
- CSS custom properties are present in `app/globals.css` for both `:root` and `.theme-light`.
- The locale switcher and theme toggle can be operated independently without affecting each other.

## Dependency Map
- Builds on: P050 ✅ (locale switcher pattern reused for theme cookie), P039 ✅ (export uses themed background), P056 ✅ (nonce-based CSP — inline script in `<head>` for FOUC prevention needs nonce)
- Complements: P025 ✅ (accessibility — light theme improves contrast for some users), P063 (Copilot instructions — CSS variable convention documented)
- Independent of: Redis, database, WebSocket, auth
