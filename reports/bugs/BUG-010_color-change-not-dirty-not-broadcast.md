# BUG-010 – Color/fill changes to selected objects not marked dirty or broadcast to peers

| Field | Value |
|---|---|
| **ID** | BUG-010 |
| **Severity** | Medium |
| **Category** | Canvas engine / Data persistence |
| **Status** | Open |

## Summary

`updateStrokeColor()` and `updateFillColor()` in `CanvasEngine` update the visual appearance of the currently-selected Fabric.js object but never call `markDirty()` or `onBroadcastDraw()`. Consequently:

1. The "unsaved changes" dirty indicator is not shown after a color change.
2. `CommitCoordinator.openCommitModal()` short-circuits with "Nothing new to commit" — the user **cannot commit a color-only change** through the normal commit flow.
3. The color change is **never broadcast to peers** in real time.

## Affected File

| File | Lines | Missing calls |
|---|---|---|
| `lib/sketchgit/canvas/canvasEngine.ts` | 587–600 | `markDirty()` and `onBroadcastDraw(true)` absent from `updateStrokeColor` and `updateFillColor` |

## Root Cause

### The two methods

```ts
// canvasEngine.ts — MISSING markDirty() and onBroadcastDraw()
updateStrokeColor(v: string): void {
  this.strokeColor = v;
  const dot = document.getElementById('strokeDot');
  if (dot) dot.style.background = v;
  const o = this.canvas?.getActiveObject();
  if (o) {
    o.set('stroke', v);
    this.canvas?.requestRenderAll();
    // markDirty() and onBroadcastDraw(true) NOT called
  }
}

updateFillColor(v: string): void {
  this.fillColor = v;
  const dot = document.getElementById('fillDot');
  if (dot) dot.style.background = v;
  const o = this.canvas?.getActiveObject();
  if (o) {
    o.set('fill', v);
    this.canvas?.requestRenderAll();
    // markDirty() and onBroadcastDraw(true) NOT called
  }
}
```

### Why Fabric.js does not save them automatically

The `canvas.on('object:modified', ...)` listener in `CanvasEngine.init()` would call `pushHistory()`, `markDirty()`, and `onBroadcastDraw(true)` — but that event is **only fired by the canvas after interactive user-gesture modifications** (drag, resize, rotate via control handles). Calling `obj.set(...)` programmatically does NOT fire `object:modified` in Fabric.js v7.

### The commit guard

```ts
// commitCoordinator.ts lines 136-137
openCommitModal(): void {
  if (!this.ctx.canvas.isDirty) { showToast('Nothing new to commit'); return; }
  // ...
}
```

Because `isDirty` is never set by the color-change methods, the user who selects an object, changes its stroke or fill, and then tries to commit will see the "Nothing new to commit" toast and be unable to proceed — **even though the canvas state has visually changed**.

## Impact

- A user who selects an object and changes only its color or fill cannot commit that change through the normal commit flow without first performing an unrelated canvas action (e.g. drawing a shape, moving an object) to set `isDirty`.
- Peers never see color/fill changes to selected objects in real time; the change is invisible to collaborators until the user accidentally triggers an unrelated dirty-making action.
- If the user refreshes or reconnects before another dirty action, the color change is lost entirely (it exists only locally in the browser's Fabric.js canvas).

## Suggested Fix

Call `markDirty()` and `onBroadcastDraw(true)` when an object is selected and its color is changed:

```ts
// canvasEngine.ts — CORRECT
updateStrokeColor(v: string): void {
  this.strokeColor = v;
  const dot = document.getElementById('strokeDot');
  if (dot) dot.style.background = v;
  const o = this.canvas?.getActiveObject();
  if (o) {
    o.set('stroke', v);
    this.canvas?.requestRenderAll();
    this.markDirty();
    this.onBroadcastDraw(true);
  }
}

updateFillColor(v: string): void {
  this.fillColor = v;
  const dot = document.getElementById('fillDot');
  if (dot) dot.style.background = v;
  const o = this.canvas?.getActiveObject();
  if (o) {
    o.set('fill', v);
    this.canvas?.requestRenderAll();
    this.markDirty();
    this.onBroadcastDraw(true);
  }
}
```
