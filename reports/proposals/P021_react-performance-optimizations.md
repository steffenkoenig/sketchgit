# P021 – React Performance Optimizations

## Title
Reduce Unnecessary React Re-Renders with useCallback, useMemo, and Component Splitting

## Brief Summary
`SketchGitApp.tsx` is a 280-line single component that re-renders every time session data changes, toolbar state updates, or any state variable changes. All button event handlers are recreated as new arrow functions on every render, the `call()` dispatch helper is redefined on every render, and there are no memoized child components. These patterns cause the entire toolbar—40+ buttons—to re-render needlessly, which is measurable in CPU cost when combined with the 100 ms real-time draw broadcast cycle. Splitting the component and applying `useCallback`/`useMemo`/`React.memo` corrects these issues.

## Current Situation
The entire application UI is rendered by a single component:

```typescript
// components/SketchGitApp.tsx
export default function SketchGitApp() {
  const appRef = useRef<SketchGitAppApi | null>(null);
  const [fabricReady, setFabricReady]  = useState(false);
  const { data: session, status }      = useSession();

  // Redefined on every render – not stable
  const call = (method: keyof SketchGitAppApi, ...args: any[]) => {
    const app = appRef.current;
    if (!app || typeof app[method] !== "function") return;
    (app[method] as (...methodArgs: any[]) => void)(...args);
  };

  return (
    <>
      {/* 40+ inline arrow functions, all recreated each render */}
      <button onClick={() => call("setTool", "select")}>…</button>
      <button onClick={() => call("setTool", "pen")}>…</button>
      {/* ...38 more buttons, each with inline arrow function */}
    </>
  );
}
```

When `session` updates (NextAuth polling), all 40+ `onClick` handlers are recreated and the entire JSX tree is diffed. The `session` update happens on every route focus in NextAuth's default configuration. Similarly, every `setState` call—including `fabricReady`—triggers a full re-render of the 280-line component.

## Problem with Current Situation
1. **Inline arrow functions break React's `memo` bailout**: Each render creates new function identity for every `onClick`. If any child component were wrapped in `React.memo`, it would still re-render because its `onClick` prop is always a new reference.
2. **No component boundaries prevent cascade re-renders**: The topbar, toolbar, timeline panel, and collab panel are all rendered in one component. A session change (which only affects the top-right auth UI) re-renders all drawing tools.
3. **`call()` dispatcher redefined every render**: `call` is defined with `const` inside the component body, so it is a new function reference on every render. Any child that receives it as a prop re-renders every time.
4. **Real-time update pressure**: The `CollaborationManager` triggers `app.*` calls at 100 ms intervals (draw-delta throttle). If these propagate state changes back to the React component, the re-render rate could reach 10 renders/second—each re-rendering 40+ buttons.
5. **No Suspense or lazy loading**: The entire component tree renders eagerly. Heavy sub-panels (timeline, collaboration panel) are always present in the DOM even when hidden.

## Goal to Achieve
1. Stabilize all event handler references with `useCallback` so they are created once per function identity change.
2. Extract independent UI regions into memoized sub-components: `<Toolbar>`, `<Topbar>`, `<TimelinePanel>`, `<CollabPanel>`.
3. Wrap sub-components with `React.memo` so they only re-render when their specific props change.
4. Memoize the `call()` dispatcher with `useCallback` so it is stable between renders.
5. Verify with React DevTools Profiler that no component renders more than once per user interaction.

## What Needs to Be Done

### 1. Stabilize the `call()` dispatcher with `useCallback`
```typescript
const call = useCallback((method: keyof SketchGitAppApi, ...args: unknown[]) => {
  const app = appRef.current;
  if (!app || typeof app[method] !== 'function') return;
  (app[method] as (...a: unknown[]) => void)(...args);
}, []); // appRef is stable; empty deps array is correct
```

### 2. Extract `<Toolbar>` as a memoized component
```typescript
// components/sketchgit/Toolbar.tsx
interface ToolbarProps {
  onSetTool:         (tool: string) => void;
  onZoomIn:          () => void;
  onZoomOut:         () => void;
  onResetZoom:       () => void;
  onToggleFill:      () => void;
  onSetStrokeWidth:  (w: number) => void;
  onUpdateStrokeColor: (color: string) => void;
  onUpdateFillColor: (color: string) => void;
}

const Toolbar = React.memo(function Toolbar(props: ToolbarProps) {
  return (
    <div id="toolbar">
      <button className="tbtn" onClick={() => props.onSetTool('select')}>…</button>
      {/* …rest of toolbar buttons… */}
    </div>
  );
});
```

Because `Toolbar` only receives stable `useCallback` references as props, `React.memo` will prevent it from re-rendering when unrelated state (e.g., `session`) changes.

### 3. Extract `<Topbar>` and `<TimelinePanel>` similarly
```typescript
// components/sketchgit/Topbar.tsx
const Topbar = React.memo(function Topbar({
  session, onCommit, onMerge, onBranch, onToggleCollab
}: TopbarProps) { ... });

// components/sketchgit/TimelinePanel.tsx
const TimelinePanel = React.memo(function TimelinePanel({ onScrollLeft, onScrollRight }: TimelinePanelProps) { ... });
```

### 4. Use `useMemo` for derived values
If any session-derived display values (e.g., user avatar URL, display name) require computation, memoize them:
```typescript
const avatarSrc = useMemo(
  () => session?.user?.image ?? generateInitialsAvatar(session?.user?.name),
  [session?.user?.image, session?.user?.name],
);
```

### 5. Lazy-load the collaboration panel with Suspense
The collaboration panel contains remote peer avatars and the room join UI. If it is not visible by default, load it lazily:
```typescript
const CollabPanel = lazy(() => import('./sketchgit/CollabPanel'));

// In render:
{collabVisible && (
  <Suspense fallback={<div className="collab-loading">…</div>}>
    <CollabPanel … />
  </Suspense>
)}
```

### 6. Pre-bind tool-specific callbacks
Instead of passing a generic `onSetTool` that accepts a string argument (which still requires an inline arrow function at the call site), provide pre-bound callbacks:
```typescript
const setToolSelect   = useCallback(() => call('setTool', 'select'),   [call]);
const setToolPen      = useCallback(() => call('setTool', 'pen'),       [call]);
const setToolLine     = useCallback(() => call('setTool', 'line'),      [call]);
// …one per tool
```
Pass these directly as `onClick` props—no inline arrow functions in JSX.

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `components/SketchGitApp.tsx` | Add `useCallback` for `call()`; split into sub-components; add `React.lazy` for CollabPanel |
| `components/sketchgit/Toolbar.tsx` | New file: memoized toolbar with pre-bound handlers |
| `components/sketchgit/Topbar.tsx` | New file: memoized topbar (auth UI, branch selector, git buttons) |
| `components/sketchgit/TimelinePanel.tsx` | New file: memoized timeline controls |
| `components/sketchgit/CollabPanel.tsx` | New file: lazily loaded collaboration panel |

## Additional Considerations

### Measuring before optimizing
Use the React DevTools Profiler (Flame Chart) to measure baseline render counts and durations before making changes. Confirm that re-renders are actually a bottleneck before investing in memoization. If the total render time for all 40 buttons is < 1 ms, the optimization provides negligible user-visible benefit.

### Risk of over-memoization
`useCallback` and `React.memo` add cognitive complexity and can introduce bugs if dependency arrays are incorrect. Apply them only where Profiler data shows measurable re-render cost. The `eslint-plugin-react-hooks` linter rule `exhaustive-deps` helps prevent stale-closure bugs.

### Relationship to P017 (orchestrator decomposition)
Splitting `SketchGitApp.tsx` into sub-components is easier after P017 decomposes the orchestrator, because each coordinator will have a focused public API that maps cleanly to a single React component's props. Doing P021 first is still valid, but expect some refactoring when P017 is implemented.

### Server-side rendering
`SketchGitApp.tsx` is already a client component (`'use client'`) and uses `useEffect`, so it never runs on the server. No SSR concerns apply to this optimization.
