# BUG-020 – `reSnapOnModified` missing re-entrancy guard causes infinite arrow rebuild loop

## Summary

When a user drags an existing arrow group and drops it near a shape, `reSnapOnModified`
is called from the `object:modified` handler and rebuilds the arrow. Because no re-entrancy
guard exists, and because `canvas.setActiveObject(newGroup)` — called at the end of
`reSnapOnModified` — can trigger another synchronous `object:modified` event via Fabric.js's
internal `discardActiveObject` → `endCurrentTransform` path (when `_currentTransform` is not
yet cleared at the moment `object:modified` fires), the handler re-enters recursively.  Each
recursive call removes the already-removed original group (a no-op) and then **adds a fresh
arrow group to the canvas without removing the previously-added one**, accumulating hundreds
of overlapping arrow objects.  The browser tab ultimately crashes with a call-stack overflow
or runs out of memory.

## Severity
`critical`

## Category
`Logic Errors`

## Current Behaviour

1. User draws an arrow (works correctly).
2. User picks up the arrow and drags it near a shape.
3. On mouse release:
   - Fabric.js fires `object:modified` for the original arrow group (`arrowA`).
   - The handler calls `reSnapOnModified(arrowA)`, which detects that an endpoint is within
     `SNAP_RADIUS (30 px)` of a shape border.
   - `rebuildArrowForMove(arrowA, …)` is called: `canvas.remove(arrowA)` removes the original
     group; `buildArrowGroup(…, selectAfter=false)` adds a new group `arrowB`.
   - Back in `reSnapOnModified`, `canvas.setActiveObject(arrowB)` is called.
   - Internally, `setActiveObject` calls `discardActiveObject`, which in Fabric.js v7 checks
     `this._currentTransform.target`.  If `_currentTransform` was not yet cleared when
     `object:modified` fired (i.e., Fabric.js fires the event **before** nulling the
     transform), `discardActiveObject` calls `endCurrentTransform` again, which fires a
     second `object:modified` event — with `e.target` still pointing to the original `arrowA`
     reference.
   - The handler re-enters: `reSnapOnModified(arrowA)` is called again.
     - `arrowA.getCenterPoint()` still returns its last valid position (Fabric.js objects
       retain coordinates after removal).
     - `dx/dy = 0` (position unchanged); `x1/y1/x2/y2` are the same snapped coordinates.
     - The snap check succeeds again (endpoints are still ≤ 30 px from the shape border).
     - `rebuildArrowForMove(arrowA, …)` is called a second time: `canvas.remove(arrowA)` is
       now a **no-op** (already removed); `buildArrowGroup` adds another new group `arrowC`
       **without removing `arrowB`**.
     - `canvas.setActiveObject(arrowC)` fires `object:modified` a third time → `arrowD` is
       created without removing `arrowC` → … → N-th arrow added, tab crashes.

The canvas visually fills with hundreds of overlapping arrow objects before the page becomes
unresponsive or the browser tab crashes.

## Expected Behaviour

`reSnapOnModified` should execute exactly **once** per user drag-and-drop interaction.  If
any internal Fabric.js operation fires a second `object:modified` during the handling of the
first, the re-entrant call should be silently ignored.  After a snap rebuild the canvas
should contain exactly one arrow group at the snapped position, and the tab should remain
fully responsive.

## Steps to Reproduce

1. Open any SketchGit room and draw a rectangle on the canvas.
2. Draw an arrow (arrow tool, drag to create a straight arrow).
3. Switch to the Select tool and click the arrow to select it.
4. Drag the arrow so that one of its endpoints moves within ~30 px of the rectangle's border.
5. Release the mouse button.
6. **Observed**: the canvas fills with duplicate arrow objects; the browser tab becomes
   unresponsive or crashes.
7. **Expected**: a single arrow is snapped to the rectangle; the canvas renders normally.

## Affected Files and Sections

| File | Lines / Symbol | Notes |
|------|---------------|-------|
| `lib/sketchgit/canvas/canvasEngine.ts` | L174–L181 / `object:modified` handler | No re-entrancy guard before `reSnapOnModified` call |
| `lib/sketchgit/canvas/canvasEngine.ts` | L1960–L2071 / `reSnapOnModified()` | Calls `rebuildArrowForMove` + `setActiveObject` with no guard |
| `lib/sketchgit/canvas/canvasEngine.ts` | L2303–L2343 / `rebuildArrowForMove()` | Calls `canvas.remove(grp)` then `buildArrowGroup`; second call becomes a no-op remove + new add |
| `lib/sketchgit/canvas/canvasEngine.ts` | L738–L846 / `buildArrowGroup()` | `canvas.add(grp)` with `renderOnAddRemove: true`; each call adds a new Group |
| `lib/sketchgit/canvas/canvasEngine.ts` | L2064 / `canvas.setActiveObject(newGrp)` | Triggers `discardActiveObject` → possible `endCurrentTransform` → fires `object:modified` again |

## Root Cause Analysis

The root cause is a **missing re-entrancy guard** in the `object:modified` event handler and
in `reSnapOnModified`.

The trigger for re-entrancy is the interaction between two Fabric.js v7 behaviours:

1. **`object:modified` fires before `_currentTransform` is nulled.**  In the Fabric.js v7
   `_finalizeCurrentTransform` code path, the `object:modified` event is emitted while the
   internal `_currentTransform` object still references the dragged arrow.

2. **`setActiveObject` calls `discardActiveObject`**, which calls
   `endCurrentTransform` if `_currentTransform.target` matches the currently-discarded
   object.  Because `_currentTransform` still points to `arrowA` at the moment our handler
   calls `canvas.setActiveObject(newGrp)`, `discardActiveObject` fires a second
   `object:modified` for `arrowA`.

Once re-entrancy begins, the loop self-sustains because:
- The snapped endpoint coordinates are always within `SNAP_RADIUS` of the shape, so the snap
  check always returns `didSnap = true`.
- `canvas.remove(arrowA)` becomes a no-op after the first call; subsequent iterations
  **only add** new groups, never removing the previous ones.
- Each iteration ends with `canvas.setActiveObject(arrowN)`, which triggers another
  `object:modified`, continuing the chain.

The secondary amplifying factor is that `_gcx/_gcy` on the removed `arrowA` object still
return the pre-snap center; because the arrow was snapped to the shape border, the delta
computed in each re-entrant call is zero, meaning the endpoint positions fed into every
subsequent `rebuildArrowForMove` call are identical snapped positions — ensuring the snap
check always succeeds.

## Suggested Fix

Add a **private re-entrancy guard flag** (`private _reSnapping = false`) to `CanvasEngine`.
Check and set it at the entry point of `reSnapOnModified`, and reset it in a `finally` block:

- At the top of `reSnapOnModified`: if `this._reSnapping` is already `true`, return
  immediately.
- Set `this._reSnapping = true` before any snap/rebuild logic.
- Clear `this._reSnapping = false` in a `try/finally` block so it is always reset even if
  an exception is thrown mid-snap.

Alternatively, place the guard in the `object:modified` handler itself so the entire handler
body is skipped for re-entrant calls:

```
object:modified handler:
  if (this._reSnapping) return;
  this._reSnapping = true;
  try {
    pushHistory(); markDirty(); reSnapOnModified(e.target); onBroadcastDraw(true);
  } finally {
    this._reSnapping = false;
  }
```

No changes to the Fabric.js event-listener registration or to the snap/rebuild logic itself
are required; the guard alone breaks the recursive chain.

## Additional Notes

- **Related secondary defect (BUG-021)**: The `_attachmentRafId` pending rAF from the last
  `object:moving` event is never cancelled when `reSnapOnModified` rebuilds the arrow.
  Although harmless in the common case (the rAF targets the removed `arrowA` whose `_id` is
  not used as an attachment target), the stale callback should be cancelled by calling
  `cancelAnimationFrame(this._attachmentRafId)` and nulling both `_attachmentRafId` and
  `_attachmentRafTarget` at the start of `reSnapOnModified` for the arrow-group branch.

- **Fabric.js version context**: This defect is observed with Fabric.js `^7.2.0` (the version
  declared in `package.json`).  The precise point in Fabric.js v7's `_finalizeCurrentTransform`
  at which `_currentTransform` is nulled relative to the `object:modified` event fire determines
  whether the re-entrant trigger is exercised.  Different patch versions of Fabric.js 7 may clear
  `_currentTransform` before or after firing the event, making the bug intermittent across
  minor/patch upgrades.  The re-entrancy guard is required regardless.

- **Crash vs. "hundreds of arrows" symptom duality**: If re-entrancy runs on the synchronous
  call stack, a stack-overflow crash occurs before many arrows accumulate.  If the second
  `object:modified` is queued as a microtask or via Fabric.js's deferred event-bus, each
  iteration completes and renders before the next begins, producing the visible "hundreds of
  arrows" effect before the tab becomes unresponsive.

## Status
`open`
