# P055 – Replace `window.confirm()` in `cpRollback` with an Accessible Confirmation Modal

## Title
Replace the Single `window.confirm()` Call in `cpRollback` with an ARIA-compliant In-app Confirmation Dialog

## Brief Summary
`cpRollback()` in `commitCoordinator.ts` uses `window.confirm()` — the browser's native blocking confirmation dialog — to ask the user to confirm a destructive rollback action. This is the only `window.confirm()` call in the codebase. All other destructive-action confirmations in the application use the existing `openModal()` / `closeModal()` pattern (which P025 enhanced with focus trapping and ARIA attributes). The `window.confirm()` call violates P025's accessibility work in three ways: (1) it interrupts the main thread, (2) it cannot be styled to match the application's dark theme, and (3) screen readers encounter an unexpected browser dialog rather than the properly labelled ARIA modal that `openModal()` provides. A small `confirmModal` added to the JSX replaces the system dialog with an accessible in-app equivalent.

## Current Situation
```typescript
// lib/sketchgit/coordinators/commitCoordinator.ts, cpRollback()
cpRollback(): void {
  if (!this.popupSHA) return;
  const { git, canvas } = this.ctx;
  const sha = this.popupSHA;
  if (git.detached) { showToast('⚠ Not on a branch', true); this.closeCommitPopup(); return; }

  // ← window.confirm(): blocks the main thread, unstyled, not ARIA-labelled
  if (!confirm(`Rollback branch '${git.HEAD}' to ${sha.slice(0, 7)}? This cannot be undone.`)) return;

  this.closeCommitPopup();
  git.branches[git.HEAD] = sha;
  // …
}
```

The rest of the application consistently uses the project's own modal system:
```typescript
// All other confirmation flows use openModal/closeModal
openModal('commitModal');
openModal('mergeModal');
openModal('conflictModal');
// … P025 added focus-trap and Escape-key handling to all of these
```

## Problem with Current Situation
1. **Accessibility regression**: `window.confirm()` does not respect `role="dialog"`, `aria-modal`, or `aria-labelledby`. Screen readers (NVDA, JAWS, VoiceOver) announce a generic browser dialog box rather than a properly described confirmation. P025 invested significant effort in labelling all modals; `window.confirm()` bypasses all of that.
2. **Main-thread blocking**: `window.confirm()` is synchronous and blocks the JavaScript event loop while the dialog is open. No WebSocket messages are processed, no canvas rendering occurs, and no timers fire. For a collaborative canvas application where peers are drawing in real-time, a 10-second user pause before confirming a rollback stalls all incoming draw-delta processing.
3. **CSP and iframe restrictions**: Many enterprise environments, browser extensions, and embedded iframe contexts (including Next.js Preview Mode) suppress `window.confirm()`. In these environments, `confirm()` returns `false` immediately, making rollback silently impossible. The user sees no dialog and the rollback doesn't execute.
4. **Visual inconsistency**: The browser's native dialog is styled by the operating system (light grey in macOS, blue in Windows), not by the application's dark `#0a0a0f` theme. This creates a jarring visual context switch and may confuse users about which application they are interacting with.
5. **Untestable**: `window.confirm()` cannot be reliably mocked in jsdom (the Vitest test environment). This prevents adding automated tests for the rollback confirmation workflow, leaving the destructive action untested.

## Goal to Achieve
1. Add a `confirmModal` overlay to `SketchGitApp.tsx` with `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`.
2. The modal shows the rollback message: `"Rollback branch 'X' to 3abc123? This cannot be undone."` and two buttons: **Cancel** and **Rollback** (styled in warning red).
3. `cpRollback()` opens the confirm modal instead of calling `window.confirm()`. The actual rollback logic executes only when the user clicks **Rollback**.
4. The `CommitCoordinator` needs a way to open the confirm modal and receive the user's choice. Since coordinator methods are synchronous (called from the React dispatcher), the modal open/close must use the existing DOM-based pattern (`openModal` / `closeModal` with callbacks).
5. The confirm modal reuses all P025 accessibility infrastructure: focus trap, Escape-to-cancel, `aria-labelledby`.

## What Needs to Be Done

### 1. Add `confirmModal` overlay to `SketchGitApp.tsx`
```tsx
{/* P055: Accessible confirmation modal – replaces window.confirm() for destructive actions */}
<div className="overlay" id="confirmModal" role="dialog" aria-modal="true" aria-labelledby="confirmModalTitle">
  <div className="modal">
    <h2 id="confirmModalTitle">⚠ Confirm Action</h2>
    <p id="confirmModalMessage" className="info-box"></p>
    <div className="modal-actions">
      <button
        className="mbtn"
        onClick={() => call("cancelConfirm")}
        aria-label="Cancel and close"
      >Cancel</button>
      <button
        className="mbtn warn"
        id="confirmModalOkBtn"
        onClick={() => call("acceptConfirm")}
        aria-label="Confirm destructive action"
      >Confirm</button>
    </div>
  </div>
</div>
```

### 2. Add `showConfirm()` and callback state to `CommitCoordinator`
```typescript
// commitCoordinator.ts

/** Pending confirmation callback; called with true (confirmed) or false (cancelled). */
private pendingConfirm: ((confirmed: boolean) => void) | null = null;

/**
 * Open the accessible confirmation modal.
 * The `onResult` callback receives true when the user clicks Confirm,
 * false when they cancel or press Escape.
 */
private showConfirm(message: string, confirmLabel: string, onResult: (ok: boolean) => void): void {
  const msgEl = document.getElementById('confirmModalMessage');
  if (msgEl) msgEl.textContent = message;
  const okBtn = document.getElementById('confirmModalOkBtn');
  if (okBtn) okBtn.textContent = confirmLabel;

  this.pendingConfirm = onResult;
  openModal('confirmModal');
}

/** Called when the user clicks the Confirm button. */
acceptConfirm(): void {
  const cb = this.pendingConfirm;
  this.pendingConfirm = null;
  closeModal('confirmModal');
  cb?.(true);
}

/** Called when the user clicks Cancel or presses Escape (via the focus trap). */
cancelConfirm(): void {
  const cb = this.pendingConfirm;
  this.pendingConfirm = null;
  closeModal('confirmModal');
  cb?.(false);
}
```

### 3. Update `cpRollback()` to use `showConfirm()`
```typescript
cpRollback(): void {
  if (!this.popupSHA) return;
  const { git } = this.ctx;
  const sha = this.popupSHA;
  if (git.detached) { showToast('⚠ Not on a branch', true); this.closeCommitPopup(); return; }

  const branch = git.HEAD;
  this.closeCommitPopup();

  this.showConfirm(
    `Rollback branch '${branch}' to ${sha.slice(0, 7)}? This cannot be undone.`,
    '⚠ Rollback',
    (confirmed) => {
      if (!confirmed) return;
      const { git, canvas } = this.ctx;
      git.branches[branch] = sha;
      git.detached = null;
      canvas.loadCanvasData(git.commits[sha].canvas);
      canvas.clearDirty();
      this.refresh();
      showToast('Rolled back to ' + sha.slice(0, 7));
    },
  );
}
```

### 4. Expose `acceptConfirm` and `cancelConfirm` in the public API (`app.ts`)
```typescript
// app.ts – add to the returned object
acceptConfirm: () => commit.acceptConfirm(),
cancelConfirm: () => commit.cancelConfirm(),
```

And add to `SketchGitAppApi` in `components/sketchgit/types.ts`:
```typescript
acceptConfirm: () => void;
cancelConfirm: () => void;
```

### 5. Tests
```typescript
// commitCoordinator.test.ts
it('cpRollback: opens confirmModal instead of calling window.confirm', () => {
  const confirmSpy = vi.spyOn(window, 'confirm');
  const openModalSpy = vi.spyOn(modalModule, 'openModal');
  coord.cpRollback();
  expect(confirmSpy).not.toHaveBeenCalled();
  expect(openModalSpy).toHaveBeenCalledWith('confirmModal');
});

it('cpRollback: does not rollback when user cancels', () => {
  coord.cpRollback();
  coord.cancelConfirm(); // simulate user pressing Cancel
  expect(git.branches[git.HEAD]).toBe(originalSha); // unchanged
});

it('cpRollback: rolls back when user confirms', () => {
  const targetSha = 'oldsha';
  coord.cpRollback(); // opens modal
  coord.acceptConfirm(); // simulate user clicking Confirm
  expect(git.branches['main']).toBe(targetSha);
});
```

## Components Affected
| Component | Change |
|-----------|--------|
| `components/SketchGitApp.tsx` | Add `confirmModal` overlay JSX |
| `lib/sketchgit/coordinators/commitCoordinator.ts` | Add `showConfirm()`, `acceptConfirm()`, `cancelConfirm()`; update `cpRollback()` |
| `lib/sketchgit/app.ts` | Expose `acceptConfirm`, `cancelConfirm` in public API |
| `components/sketchgit/types.ts` | Add `acceptConfirm`, `cancelConfirm` to `SketchGitAppApi` |

## Data & Database Model
No changes.

## Testing Requirements
- `cpRollback()` does not call `window.confirm()`.
- `cpRollback()` opens `#confirmModal` via `openModal()`.
- Cancel → no rollback, modal closed, focus restored.
- Confirm → rollback executed, modal closed.
- Escape key → same as Cancel (handled by existing P025 focus-trap Escape handler).
- Modal has correct `aria-labelledby="confirmModalTitle"` and `role="dialog"`.

## Reusability
The `showConfirm()` helper is intentionally generic: it accepts any message, button label, and callback. Future destructive actions (e.g., "Delete branch", "Clear canvas") can reuse the same confirmation flow without adding new modal types.

## Dependency Map
- Depends on: P017 ✅ (CommitCoordinator + AppContext), P025 ✅ (openModal focus-trap, Escape handling)
- Complements: P053 (rollback broadcast — both fix cpRollback(); should be implemented together)
- Severity: **Low-Medium** — accessibility and UX improvement; no data loss risk from current behavior
