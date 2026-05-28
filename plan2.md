The bug summary for BUG-010 shows that in the past, `updateStrokeColor` and `updateFillColor` didn't have *either* `markDirty()` or `fire('object:modified')`.
The "Suggested Fix" in the `BUG-010_color-change-not-dirty-not-broadcast.md` was to add `this.markDirty(); this.onBroadcastDraw(true);`.

However, as per the memory rule: "In the Fabric.js implementation (v7), programmatic object modifications (e.g., via `o.set()`) do not automatically trigger the `object:modified` event. To properly integrate with the application's event loop (which handles undo/redo history, snapping, and broadcasting), explicitly call `this.canvas?.fire('object:modified', { target: o })` rather than manually marking dirty or broadcasting."

So the *correct* pattern is `this.canvas?.fire('object:modified', { target: o });`!
Currently in `lib/sketchgit/canvas/canvasEngine.ts` around `1124` and `1146`, `this.canvas?.fire('object:modified', { target: o });` is ALREADY PRESENT.

Wait, if it's already present in `updateStrokeColor` and `updateFillColor`, where is it NOT present?
Let's review the methods in `canvasEngine.ts` that manually call `this.markDirty(); this.onBroadcastDraw(true);` instead of `this.canvas?.fire('object:modified', { target: o });` when an object is modified programmatically.

Let's look at `bringToFront()`, `bringForward()`, `sendBackward()`, `sendToBack()`, `setObjectLink()`, and `rebuildSelectedArrow()` (or wherever `buildArrowGroup` does it), etc.
Ah, the task specifically references "Rationale: Same as line 1124. The fix is explicitly shown and applied."
Let's see what is near line 1149 in `canvasEngine.ts`... Wait, I previously grepped the file:

```typescript
  1149
  1150	  toggleFill(): void {
  ...
  1168	      this.canvas?.requestRenderAll();
  1169	      this.canvas?.fire('object:modified', { target: o });
  1170	    }
```
Wait, the prompt says:
"Details:
File: lib/sketchgit/canvas/canvasEngine.ts:1149
Description: Programmatic object modifications (like setting stroke or fill) do not automatically fire the object:modified event, requiring manual dirtying and broadcasting."

Wait. The prompt literally says:
"Context:
      const pattern = (o as FabricObject & { _fillPattern?: string })._fillPattern as 'filled' | 'striped' | 'crossed' | undefined;
      o.set('fill', this.createFill(pattern ?? 'filled', v));
      (o as FabricObject & { _fillColor?: string })._fillColor = v;
      this.canvas?.requestRenderAll();
      // BUG-010 – same fix: mark dirty and broadcast so peers see the change.
      this.markDirty();
      this.onBroadcastDraw(true);
    }
"

This context matches line 1142-1147:
```typescript
  1142	      const pattern = (o as FabricObject & { _fillPattern?: string })._fillPattern as 'filled' | 'striped' | 'crossed' | undefined;
  1143	      o.set('fill', this.createFill(pattern ?? 'filled', v));
  1144	      (o as FabricObject & { _fillColor?: string })._fillColor = v;
  1145	      this.canvas?.requestRenderAll();
  1146	      this.canvas?.fire('object:modified', { target: o });
  1147	    }
```
In the codebase *right now*, lines 1146-1147 contain `this.canvas?.fire('object:modified', { target: o });`.
But the user prompt says the context *is* `this.markDirty(); this.onBroadcastDraw(true);`.
Is it possible the user's prompt is telling me to find *other* occurrences of `this.markDirty(); this.onBroadcastDraw(true);` and replace them with `this.canvas?.fire('object:modified', { target: o });`?

Let's look at `bringToFront`, `bringForward`, `sendBackward`, `sendToBack`, `setObjectLink`, etc.
```typescript
  bringToFront(): void {
    const o = this.canvas?.getActiveObject();
    if (!o || !this.canvas) return;
    this.pushHistory();
    this.canvas.bringObjectToFront(o);
    this.canvas.requestRenderAll();
    this.markDirty();
    this.onBroadcastDraw(true);
  }
```
If we look closely, `bringToFront` calls `this.pushHistory();` manually, and then `this.markDirty();` and `this.onBroadcastDraw(true);`.
But if we just call `this.canvas?.fire('object:modified', { target: o })`, it will automatically trigger `pushHistory`, `markDirty`, and `onBroadcastDraw` inside the event listener for `object:modified`!

Let's look at `CanvasEngine.ts` event listeners to confirm.
