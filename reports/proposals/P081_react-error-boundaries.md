# P081 – React Error Boundaries for Graceful UI Failure Isolation

## Status
Not Started

## Dimensions
Reliability · UX · Maintainability

## Problem

The SketchGit client contains complex rendering logic spread across the canvas engine
(`lib/sketchgit/canvas/canvasEngine.ts`), multiple coordinators, and several React
components. If any of these throw an unhandled JavaScript exception during rendering or
an event callback, React 19 will unmount the **entire component tree** and display a
blank screen. Users lose their unsaved work with no explanation or recovery path.

Concrete scenarios where this is likely:

| Scenario | Source |
|----------|--------|
| Fabric.js throws while deserialising a malformed `canvasJson` blob | `canvasEngine.ts` |
| A merge conflict payload is structurally unexpected | `mergeCoordinator.ts` |
| An i18n key is missing and `useTranslations()` throws | Any rendered component |
| A timeline entry references a commit SHA that is not in the local DAG | `timelineRenderer.ts` |
| A WebSocket message arrives with an unexpected shape after partial reconnect | `wsClient.ts` |

None of the existing proposals (P001–P080) addresses client-side error containment at
the React component boundary.

## Proposed Solution

Introduce **React Error Boundary** class components (the only mechanism React supports
for catching render-phase errors) at strategic boundaries in the component tree:

1. **`AppErrorBoundary`** – top-level boundary that catches any uncaught error across
   the whole application. Shows a full-page fallback with a "Reload" button and logs
   a structured error via `logger` (P036).
2. **`CanvasErrorBoundary`** – wraps the Fabric.js canvas area. On error, unmounts the
   canvas, shows an inline "Canvas error — click to retry" message, and attempts to
   restore the last known snapshot from the LRU cache (P030).
3. **`TimelineErrorBoundary`** – wraps the commit timeline panel. Hides the timeline
   on error without affecting the canvas.
4. **`ModalErrorBoundary`** – wraps modal dialogs (commit, merge, branch) so a dialog
   crash cannot kill the rest of the UI.

All boundaries must:
- Call `logger.error()` with the structured `Error` object and React `errorInfo`.
- Fire a `room-event` (P074) of type `CLIENT_ERROR` so the activity feed records the
  incident (server-side, keyed by session so it does not reveal PII).
- Render an accessible fallback (`role="alert"`, `aria-live="assertive"`) with a
  translated error headline from `messages/en.json` / `messages/de.json`.

### Fallback component requirements

- Show the localized error title from `errors.renderError` i18n key.
- Offer a "Retry" button that calls `this.setState({ hasError: false })` to attempt
  re-mount.
- Never display raw `error.message` or stack traces to end users.
- Pass `error` to `logger.error()` at `warn` level for canvas/modal boundaries,
  `error` level for the app-level boundary.

## Code Structure

```
components/
  errors/
    AppErrorBoundary.tsx        ← top-level, full-page fallback
    CanvasErrorBoundary.tsx     ← canvas area, snapshot-restore logic
    TimelineErrorBoundary.tsx   ← timeline panel
    ModalErrorBoundary.tsx      ← dialog container
    ErrorFallback.tsx           ← shared accessible fallback UI
```

All boundary components are class-based (React requirement for `componentDidCatch`).
The shared `ErrorFallback` presentational component can be a function component and
is reused by all boundaries via a `FallbackComponent` prop pattern.

## Type Requirements

- Boundaries must be typed with `React.Component<Props, { hasError: boolean; error: Error | null }>`.
- `ErrorFallback` receives `{ error: Error; resetError: () => void }` props.
- No `@ts-ignore` or `as unknown` casts allowed (P005).

## Linting Requirements

- `@typescript-eslint/no-floating-promises` (P042): `componentDidCatch` must `void`
  any async logger call.
- ESLint `no-console` rule (already enforced): use `logger` from
  `lib/sketchgit/logger.ts`, not `console.error`.

## Test Requirements

Tests belong in `components/errors/*.test.tsx` and use Vitest + React Testing Library.

| Test case | Assertion |
|-----------|-----------|
| `AppErrorBoundary` catches a thrown child | fallback renders with retry button |
| Retry button resets `hasError` state | child re-renders after click |
| `CanvasErrorBoundary` calls `logger.error` | spy on logger mock |
| Fallback has `role="alert"` | accessible landmark present |
| i18n key `errors.renderError` is present in `en.json` | translation rendered |
| No `error.message` text visible in fallback | security: no raw messages leaked |

## Database / Data Impact

No schema changes required. The `CLIENT_ERROR` room event type must be added to the
`RoomEventType` enum in `prisma/schema.prisma` and `RoomEvent.eventType` to enable the
audit trail integration.

## Repository Structure

- New `components/errors/` directory keeps all boundary code co-located.
- Add i18n keys `errors.renderError`, `errors.canvasError`, `errors.timelineError`,
  `errors.modalError` to `messages/en.json` and `messages/de.json`.
- Add `CLIENT_ERROR` to `RoomEventType` enum in schema.

## GitHub Copilot Agents and Skills

- The `.github/copilot-instructions.md` should reference the boundary hierarchy so
  future agents know to wrap new top-level components in the appropriate boundary.
- A custom Copilot skill can scaffold a new boundary component with the correct class
  shape, logger wiring, and i18n keys when asked to "add error boundary for X".

## Implementation Order

1. Add `errors.renderError` (and variant) i18n keys to `messages/en.json` / `de.json`.
2. Create `ErrorFallback.tsx`.
3. Create the four boundary components.
4. Write unit tests.
5. Wire `AppErrorBoundary` into `app/layout.tsx`.
6. Wire `CanvasErrorBoundary`, `TimelineErrorBoundary`, `ModalErrorBoundary` into the
   appropriate render sites in `components/`.
7. Add `CLIENT_ERROR` to `RoomEventType` and generate a migration.

## Effort Estimate
Medium (2–3 days). No new dependencies needed (React's built-in class component API
is sufficient).

## Dependencies
- P036 ✅ (client-side logger — `logger.error` available)
- P009 ✅ (i18n — `useTranslations` available for fallback text)
- P068 ✅ (error codes — ensures fallback does not expose internal codes to users)
- P074 ✅ (activity feed — `CLIENT_ERROR` room event target)
