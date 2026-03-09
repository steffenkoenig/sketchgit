# P008 – Replace `innerHTML` with Safe DOM Manipulation

## Title
Replace `innerHTML` with Safe DOM Manipulation to Eliminate XSS Risk

## Brief Summary
Several places in the application use `innerHTML` to construct UI elements that may incorporate user-provided or user-derived data. While current input sanitization mitigates the most obvious vectors, the pattern is inherently fragile and becomes a cross-site scripting (XSS) vulnerability whenever sanitization is incomplete or bypassed. Replacing `innerHTML` assignments with structured DOM construction or a templating approach will eliminate this class of vulnerability entirely.

## Current Situation
The conflict resolution modal and related UI sections are built by generating HTML strings and assigning them to `innerHTML`. For example, in the merge conflict UI (around lines 278–400 of `createSketchGitApp.ts`):

```javascript
objEl.innerHTML = headerHTML + propsHTML;
```

The modal also uses inline event handlers generated as strings:
```javascript
`onclick="selectConflictChoice('${objectId}', '${propName}', 'ours')"`
```

The `objectId` and `propName` values originate from the canvas object metadata, which itself may incorporate text entered by the user (e.g., text objects on the canvas, branch names, commit messages). These values flow through string interpolation into `innerHTML` and inline event handler attributes.

The server (`server.mjs`) does apply sanitization to room IDs, display names, and display colors using truncation and character whitelisting. However:
- Canvas object content (text shapes, labels) is not sanitized before being reflected back into the conflict UI.
- The sanitization logic is not co-located with the `innerHTML` assignments, creating a maintenance gap.
- The reliance on sanitization as the sole defence follows the "defence in depth" anti-pattern for XSS—if sanitization is missing in one code path, the vulnerability is open.

## Problem with Current Situation
- **XSS risk via canvas content**: A user who creates a text object with a payload such as `<img src=x onerror=alert(1)>` and commits it could trigger script execution in other participants' browsers when the conflict resolution modal is rendered, as the object type/content may flow into the `innerHTML` construction.
- **Inline event handlers as strings**: Attributes like `onclick="selectConflictChoice('${id}', '${prop}', 'ours')"` are evaluated by the browser's HTML parser. An attacker-controlled `id` or `prop` value containing a single quote and JavaScript code could break out of the attribute context.
- **Fragile maintenance**: Adding a new field to the conflict UI requires a developer to remember to sanitize the new value, with no structural enforcement. One omission restores the vulnerability.
- **Content Security Policy (CSP) incompatibility**: `innerHTML` and inline event handlers are fundamentally incompatible with a strict Content Security Policy, preventing the adoption of CSP as a security header (see Additional Considerations).

## Goal to Achieve
1. Eliminate all `innerHTML` assignments that include dynamic data.
2. Replace inline event handler strings with `addEventListener` calls.
3. Make XSS structurally impossible for the conflict modal and any similar UI, regardless of what data is passed.
4. Enable the adoption of a `script-src 'self'` Content Security Policy.

## What Needs to Be Done

### 1. Audit all `innerHTML` usages
Search the codebase for all `innerHTML` assignments:
```
grep -n "innerHTML" lib/ components/ --include="*.ts" --include="*.tsx" -r
```
Categorize each occurrence as:
- **Static HTML only** (no dynamic data) → safe, no change needed.
- **Dynamic data included** → must be replaced.

### 2. Replace `innerHTML` with DOM API construction
For each dynamic `innerHTML` assignment, replace with explicit DOM construction:

**Before:**
```javascript
objEl.innerHTML = `<div class="conflict-header">${objectType}: ${objectId}</div>`;
```

**After:**
```javascript
const header = document.createElement('div');
header.className = 'conflict-header';
header.textContent = `${objectType}: ${objectId}`;
objEl.appendChild(header);
```

`textContent` and `createTextNode()` do not parse HTML, making injection structurally impossible.

### 3. Replace inline event handler strings with `addEventListener`
**Before:**
```javascript
choiceBtn.setAttribute('onclick', `selectConflictChoice('${id}', '${prop}', 'ours')`);
```

**After:**
```javascript
const ourBtn = document.createElement('button');
ourBtn.textContent = 'Ours';
ourBtn.addEventListener('click', () => selectConflictChoice(id, prop, 'ours'));
```

The data values are never serialized into a string and parsed back—they flow directly as JavaScript values.

### 4. Refactor the conflict resolution modal
The conflict modal is the most complex `innerHTML` user (multiple nested loops generating HTML). After P001 (module decomposition), this modal will live in `lib/sketchgit/ui/modals.ts`. Rewrite it to use DOM construction rather than string concatenation.

Alternatively, if React components are used for the modal (which is architecturally cleaner—see Additional Considerations), React's JSX templating provides automatic XSS protection, as all interpolated values are escaped by default.

### 5. Migrate modal UIs to React components (recommended)
Currently, all modals are created imperatively with vanilla DOM manipulation inside `createSketchGitApp.ts`, while the outer shell is a Next.js/React application. The mismatch is the root cause of the `innerHTML` usage. Migrating the conflict modal, commit modal, branch modal, and name modal to proper React components would:
- Eliminate all `innerHTML` usage in these UIs.
- Enable React's built-in XSS protection.
- Make the modals testable (React Testing Library).
- Align with the rest of the application architecture.

### 6. Add a Content Security Policy header
Once `innerHTML` and inline handlers are removed, add a strict CSP:
```javascript
// server.mjs
res.setHeader(
  'Content-Security-Policy',
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
);
```
The CSP acts as a second layer of defence and will immediately block any XSS attempt that bypasses application-level sanitization.

### 7. Sanitize canvas object text content
Add a sanitization/escaping step when loading user-created text content from canvas JSON before displaying it anywhere in the UI. Use `DOMPurify` (browser) or `sanitize-html` (Node.js) for any case where HTML rendering of user content is intentional.

## What Components Are Affected
| Component | Impact |
|-----------|--------|
| `lib/sketchgit/createSketchGitApp.ts` (conflict modal, ~lines 278–400) | Replace `innerHTML` with DOM API or React component |
| `server.mjs` | Add `Content-Security-Policy` response header |
| `components/SketchGitApp.tsx` | Add React modal components for commit, branch, name, conflict |
| `package.json` | Optionally add `dompurify` for explicit sanitization |

## Additional Considerations

### React migration synergy
This proposal and P001 (module decomposition) are strongly synergistic. Once the engine is split into modules, the UI layer (modals) becomes a clean seam for React component adoption. The React migration eliminates the `innerHTML` problem structurally rather than requiring case-by-case fixes.

### DOMPurify
If any use case genuinely requires rendering HTML content (e.g., rich-text annotations in future), use `DOMPurify.sanitize()` before `innerHTML`. However, for the current feature set, all dynamic content can be rendered as plain text, so `textContent` is sufficient and safer.

### Testing
Unit tests (from P002) for the conflict modal should include payloads containing HTML characters (`<`, `>`, `"`, `'`, `&`) to verify they are rendered as text and not executed.
