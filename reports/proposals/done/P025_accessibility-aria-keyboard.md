# P025 – Accessibility: ARIA, Keyboard Navigation, and Screen Reader Support

## Title
Improve Application Accessibility: ARIA Roles, Keyboard Navigation, and Screen Reader Support

## Brief Summary
The application has no ARIA roles, labels, or landmark regions on its interactive controls. The toolbar buttons have no accessible names beyond emoji characters and tooltip `<span>` elements that are not read by screen readers. The DOM-based modal dialogs (`lib/sketchgit/ui/modals.ts`) do not trap focus, do not respond to the Escape key, and do not announce themselves to assistive technology. These gaps make the application unusable for keyboard-only users and inaccessible to users relying on screen readers, and they also violate WCAG 2.1 Level AA requirements.

## Current Situation

### 1. Toolbar buttons lack accessible names
Every toolbar button in `SketchGitApp.tsx` is identified only by an emoji or SVG icon with no accessible label:
```tsx
// components/SketchGitApp.tsx (lines 101-147)
<button className="tbtn on" id="tsel" onClick={() => call("setTool", "select")} title="select">
  <svg ...>...</svg>
  <span className="tt">Select (V)</span>  {/* tooltip span, hidden visually */}
</button>
<button className="tbtn" id="tpen" onClick={() => call("setTool", "pen")}>
  <svg ...>...</svg>  {/* no accessible name at all */}
</button>
```
The `title` attribute on the first button provides a browser tooltip but does not reliably translate to an accessible name in all screen reader + browser combinations. Most pen, line, arrow, and eraser buttons have neither a `title` nor an `aria-label`. Screen readers will announce these as "button" or read the hidden tooltip text inconsistently.

### 2. No `role="toolbar"` or keyboard navigation pattern
The toolbar has no `role="toolbar"` landmark. ARIA's toolbar role implies that arrow keys navigate between items (roving tabindex pattern). Without it, users must Tab through all 40+ buttons sequentially. The keyboard shortcut hints shown in tooltips (e.g., "Select (V)") are not wired to actual keyboard handlers in the React layer.

### 3. No `aria-pressed` on toggle buttons
The active drawing tool button has a CSS class `on` applied by the app engine, but no `aria-pressed` attribute. Screen readers cannot determine which tool is currently selected:
```typescript
// lib/sketchgit/app.ts – tool selection (approximate)
document.getElementById('tpen')?.classList.add('on');
// Missing: document.getElementById('tpen')?.setAttribute('aria-pressed', 'true');
```

### 4. DOM-based modals lack accessibility scaffolding
The commit, branch, and merge modals are created by injecting raw HTML via `modals.ts`:
```typescript
// lib/sketchgit/ui/modals.ts
export function showModal(id: string, html: string): void {
  const el = document.createElement('div');
  el.id = id;
  el.innerHTML = html; // (sanitized in P008, but still no ARIA)
  document.body.appendChild(el);
}
```
None of the modal containers have:
- `role="dialog"` – prevents screen readers from announcing the modal context
- `aria-modal="true"` – does not indicate to screen readers that background content is inert
- `aria-labelledby` – connecting the modal to its heading for context
- Focus trapping – Tab key leaves the modal and reaches background content
- Escape key handling – no keyboard dismissal

### 5. Color picker inputs have no labels
```tsx
<input type="color" id="strokeColorInput" defaultValue="#e2e2ef"
  onInput={(e) => call("updateStrokeColor", ...)} />
{/* No <label> element or aria-label */}
```
Color inputs without labels are announced as "color picker, edit" with no context about what the color controls.

### 6. Canvas element has no accessible alternative
The `<canvas>` element has no `role`, `aria-label`, or fallback content. Screen readers either skip it or describe it unhelpfully.

## Problem with Current Situation
1. **Screen reader unusable**: A user relying on VoiceOver, NVDA, or JAWS cannot determine which tool is active, what buttons do, or interact with modals.
2. **Keyboard-only navigation is impractical**: With 40+ buttons and no toolbar keyboard navigation pattern, keyboard-only users must Tab through every button to reach the one they want.
3. **WCAG 2.1 violations**: At minimum, the following criteria are violated:
   - 1.1.1 Non-text Content (buttons with only SVG icons and no text alternative)
   - 2.1.1 Keyboard (modals not closable by keyboard)
   - 2.4.3 Focus Order (focus leaves modal)
   - 4.1.2 Name, Role, Value (toggle buttons without `aria-pressed`)
4. **Legal risk**: In many jurisdictions, web applications must meet WCAG AA for both private-sector and public-sector users. Violations expose developers to legal complaints.

## Goal to Achieve
1. All interactive controls have a programmatically determinable accessible name (`aria-label` or visible text alternative).
2. The toolbar follows the ARIA toolbar pattern with roving tabindex and arrow-key navigation.
3. Active tool state is conveyed via `aria-pressed`.
4. All modal dialogs have `role="dialog"`, `aria-labelledby`, focus trapping, and Escape-key dismissal.
5. Color picker inputs have associated `<label>` elements.
6. The canvas element has an `aria-label` describing its purpose.

## What Needs to Be Done

### 1. Add `aria-label` to all toolbar buttons
```tsx
<button
  className="tbtn on"
  id="tsel"
  onClick={() => call("setTool", "select")}
  aria-label="Select tool"
  aria-pressed={activeTool === 'select'}
>
  <svg aria-hidden="true" focusable="false">...</svg>
</button>
```
Mark all decorative SVG icons with `aria-hidden="true"` and `focusable="false"` to prevent them from being announced separately.

### 2. Add `role="toolbar"` and implement roving tabindex
```tsx
<div role="toolbar" aria-label="Drawing tools" id="toolbar">
  {/* Only one button has tabIndex={0} at a time; others have tabIndex={-1} */}
  <button tabIndex={activeTool === 'select' ? 0 : -1} ...>Select</button>
  <button tabIndex={activeTool === 'pen'    ? 0 : -1} ...>Pen</button>
  {/* Arrow key handler moves tabIndex={0} between buttons */}
</div>
```

### 3. Update tool activation in `app.ts` to set `aria-pressed`
```typescript
// lib/sketchgit/app.ts – when setting active tool
function activateTool(toolId: string): void {
  document.querySelectorAll('[role="toolbar"] button').forEach(btn => {
    btn.setAttribute('aria-pressed', 'false');
    (btn as HTMLButtonElement).tabIndex = -1;
  });
  const activeBtn = document.getElementById(`t${toolId}`);
  activeBtn?.setAttribute('aria-pressed', 'true');
  (activeBtn as HTMLButtonElement | null)!.tabIndex = 0;
  activeBtn?.focus();
}
```

### 4. Add modal accessibility in `modals.ts`
```typescript
export function showModal(id: string, title: string, content: string): void {
  const headingId = `${id}-title`;
  const el = document.createElement('div');
  el.id = id;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', headingId);
  el.setAttribute('tabIndex', '-1'); // so focus can be moved to it

  // ... set content with a <h2 id={headingId}> heading ...

  document.body.appendChild(el);
  trapFocus(el);
  el.focus();
}

function trapFocus(el: HTMLElement): void {
  const focusable = el.querySelectorAll<HTMLElement>(
    'button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];

  el.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') { closeModal(el.id); return; }
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  });
}
```

### 5. Add labels to color picker inputs
```tsx
<label htmlFor="strokeColorInput" className="sr-only">Stroke colour</label>
<input type="color" id="strokeColorInput" ... />
```
Use a visually hidden `.sr-only` class (common in Tailwind: `sr-only`) to keep the label off-screen but available to screen readers.

### 6. Add `aria-label` to the canvas element
```html
<canvas id="canvas-el" aria-label="Sketch canvas – draw here using the toolbar tools" role="img">
  <!-- Fallback for no-canvas browsers -->
  Your browser does not support the canvas element required for SketchGit.
</canvas>
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `components/SketchGitApp.tsx` | Add `aria-label`, `aria-pressed`, `role="toolbar"`, `tabIndex` management, `htmlFor` on color labels |
| `lib/sketchgit/ui/modals.ts` | Add `role="dialog"`, `aria-modal`, `aria-labelledby`; implement `trapFocus()`; add Escape handler |
| `lib/sketchgit/app.ts` | Update tool-activation logic to set `aria-pressed` and manage roving tabindex |

## Additional Considerations

### Automated accessibility testing
Add `@axe-core/playwright` or `axe-playwright` to the test suite for automated WCAG checks. These tools can catch 30–40% of all accessibility violations automatically without manual inspection:
```typescript
import { checkA11y } from 'axe-playwright';

test('toolbar has no accessibility violations', async ({ page }) => {
  await page.goto('/');
  await checkA11y(page, '#toolbar');
});
```

### High-contrast mode
Test the application in Windows High Contrast mode and macOS Invert Colors mode. Custom CSS variables (`--tx3`, etc.) may need `forced-colors: active` media query overrides to ensure icons and borders are visible.

### Skip navigation link
Add a "Skip to main content" link as the first focusable element on the page, allowing keyboard users to bypass the navigation bars and reach the canvas directly.

### WCAG audit scope
The canvas element itself (`<canvas>`) is inherently inaccessible to screen readers (it is a bitmap surface with no semantic structure). Providing a full alternative interface for screen reader users is beyond the scope of this proposal. The goal here is to make all _controls_ accessible, so sighted keyboard users and switch-access users can operate the app, even if the canvas content itself is not screen-reader-readable.
