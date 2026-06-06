# BUG-015 – Color/fill changes to selected objects are not undoable

**Status**: Open  
**Severity**: Low  
**File**: `lib/sketchgit/canvas/canvasEngine.ts`  
**Methods**: `updateStrokeColor()`, `updateFillColor()`

---

## Summary

When the user changes the stroke color or fill color of a selected canvas object, the change is applied and broadcast to peers correctly, but **no undo snapshot is saved beforehand**. Pressing Ctrl+Z after a color/fill change does not revert it; instead, undo targets the previous unrelated action (or does nothing if the stack is empty).

---

## Root Cause

`CanvasEngine` saves an undo snapshot in three places:

1. **`onMouseDown()`** – captured before every new drawing gesture (pen, rect, ellipse, line, arrow, text).
2. **`onKey()` Delete/Backspace branch** – captured before deleting the active object.
3. **`object:modified` event handler** – captured when Fabric.js fires after a move/resize/rotate completes (note: this is already the *post*-modification state and is separately tracked as BUG-012).

`updateStrokeColor()` and `updateFillColor()` both call `obj.set()` to mutate the active object and then call `markDirty()` + `onBroadcastDraw()`, but **neither calls `this.pushHistory()` before making the change**. The exact missing call is:

```ts
// lib/sketchgit/canvas/canvasEngine.ts  (~line 587)
updateStrokeColor(v: string): void {
  this.strokeColor = v;
  // …
  const o = this.canvas?.getActiveObject();
  if (o) {
    // ← pushHistory() is NOT called here
    o.set('stroke', v);
    this.canvas?.requestRenderAll();
    this.markDirty();
    this.onBroadcastDraw(true);
  }
}
```

The same omission exists in `updateFillColor()` (~line 602).

---

## Impact

- A user changes the color of a shape, then immediately presses Ctrl+Z expecting to undo the color change.
- The undo operation instead pops the last *drawing* snapshot (e.g. the state before the rectangle was created), unexpectedly reverting the shape itself rather than just the color.
- The color change can never be individually undone, and intermediate drawing work may be discarded.

---

## Steps to Reproduce

1. Draw any shape (e.g. a rectangle) on the canvas.
2. Select the shape.
3. Change its stroke or fill color using the color pickers.
4. Press **Ctrl+Z**.

**Expected**: The color reverts; the shape remains.  
**Actual**: The shape itself is removed (the undo jumps back to before the shape was drawn), or the color change is silently kept.

---

## Fix

Call `this.pushHistory()` at the start of the `if (o)` block in both `updateStrokeColor()` and `updateFillColor()`, before calling `obj.set()`:

```ts
if (o) {
  this.pushHistory();      // ← add this line
  o.set('stroke', v);
  this.canvas?.requestRenderAll();
  this.markDirty();
  this.onBroadcastDraw(true);
}
```

This mirrors the pattern already used in the Delete-key handler and is consistent with how every other user-initiated mutation is handled.
