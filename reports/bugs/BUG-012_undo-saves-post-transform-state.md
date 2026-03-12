# BUG-012 – Undo saves post-transform state; move/resize cannot be undone

**ID**: BUG-012  
**Severity**: Medium  
**File**: `lib/sketchgit/canvas/canvasEngine.ts`  
**Reported**: 2026-03-12

---

## Summary

The undo stack in `CanvasEngine` saves the **post-modification** canvas state when an object is moved or resized, because `pushHistory()` is called from the `object:modified` Fabric.js event, which fires **after** the transformation is already applied. Pressing Ctrl+Z after a move or resize therefore restores the already-modified state — undo appears to do nothing visible for one full keypress.

---

## Affected Code

```typescript
// lib/sketchgit/canvas/canvasEngine.ts  line ~97
this.canvas.on('object:modified', () => {
  this.pushHistory();           // ← saves state AFTER the transform
  this.markDirty();
  this.onBroadcastDraw(true);
});
```

`pushHistory()` captures `getCanvasData()` at call time and pushes it onto `undoStack`.  When `object:modified` fires, Fabric.js has already applied the move/resize/rotate, so the snapshot is identical to the current canvas state.

---

## How to Reproduce

1. Open the canvas app with the select tool active.
2. Draw a rectangle (pen/rect tool), then switch back to the select tool.
3. Drag the rectangle to a new position and release the mouse.
4. Press **Ctrl+Z** once.
   - **Expected**: the rectangle returns to its original position.
   - **Actual**: nothing visually changes; the undo appears to be a no-op.
5. Press **Ctrl+Z** a second time.
   - The rectangle disappears entirely (the initial-draw snapshot is popped),
     skipping the pre-move state entirely.

---

## Root Cause

`object:modified` is the correct event for detecting that a user-driven transformation completed, but it fires **after** Fabric.js has written the new coordinates into the object. At that point `getCanvasData()` already returns the transformed state. The undo stack entry that was intended to be "the state to restore" is actually "the current state", so loading it produces no visible change.

For **new drawing gestures** (pen, rect, ellipse, etc.) the code correctly calls `pushHistory()` from `onMouseDown()` **before** the new object is added — those operations undo correctly. Object moves and resizes are the only affected operations.

---

## Fix

Listen for `before:transform` (fires before Fabric.js applies the transformation) to capture the pre-modification snapshot, and keep `object:modified` solely for dirty-marking and broadcasting:

```typescript
// Capture state BEFORE the transformation (P037 undo support)
this.canvas.on('before:transform', () => {
  this.pushHistory();
});

// After modification: only mark dirty and broadcast
this.canvas.on('object:modified', () => {
  this.markDirty();
  this.onBroadcastDraw(true);
});
```

`before:transform` fires once per user gesture (not per frame), making it a direct replacement for the `onMouseDown` guard that already protects new-drawing gestures.

---

## Impact

- Users who move or resize objects cannot undo those operations with a single Ctrl+Z. The undo stack requires an extra "phantom" keypress that does nothing visible, then removes the entire drawn shape rather than reverting it to its previous position.
- Redo after the phantom undo reloads the same transformed state, so the redo history is also corrupted.
- Affects the select tool (move, resize, rotate); does **not** affect new shapes drawn with the pen/rect/ellipse/line tools, object deletion (Delete key), or eraser strokes — those all save pre-action snapshots correctly.
