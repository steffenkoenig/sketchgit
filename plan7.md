Wait, `pushHistory()` is called:
- `onMouseDown`: saves state A.
- `object:modified`: saves state B.
Wait! If `undo` pops the stack, the last thing on the stack is B (pushed by `object:modified`).
If `undo` pops B, then `snapshot = B`. It pushes `current` (which is B) to `redoStack`. Then it loads B.
So `undo` loads B, which is exactly the current state! It does nothing!
Is this right?
Let's see if `onMouseDown` saves state A. If the user draws a line, `onMouseUp` does `this.pushHistory()`! Wait.
Let me grep `pushHistory` again.
```
188:      this.pushHistory(); // inside object:modified
439:  private pushHistory(): void {
513:    this.pushHistory(); // inside onMouseDown
1007:        this.pushHistory(); // delete active object
1332:    this.pushHistory(); // bringToFront
```
Ah! `object:modified` calls `pushHistory()`. So does `onMouseDown`.
If `object:modified` fires, it saves the state *after* the change.
Wait, if it does, `undo` won't work correctly.
Let's trace:
Initial state A.
MouseDown: push(A). Stack=[A]
MouseMove: draw line.
MouseUp: finishes.
Wait, drawing a line doesn't fire `object:modified`, it triggers `object:added`! But wait, `object:added` doesn't call `pushHistory()`. Let's see `onMouseUp`:
```typescript
      t.selectAll();
      this.isDrawing = false;
      this.markDirty();
      return;
```
It calls `markDirty()`, but it does NOT call `pushHistory()`.
Wait, wait! If `object:modified` calls `pushHistory()`, it pushes the state AFTER the modification?
Let's re-read line 181:
```typescript
    this.canvas.on('object:modified', (e: { target?: FabricObject }) => {
      // Guard against re-entrant calls...
      if (this._reSnapping) return;
      this.pushHistory();
      this.markDirty();
```
If `pushHistory()` is called here, what does it push? It pushes the state of the canvas *right now*. Which is the state AFTER the modification!
But wait, if you want to undo the modification, you need the state BEFORE the modification!
Wait, Fabric's `object:modified` event fires *after* the transformation is completed. So `this.getCanvasData()` will return the *modified* state.
If `pushHistory()` pushes the modified state, `undoStack` contains the modified state.
This seems like a bug in undo/redo. But that's not what I am asked to fix.
I am asked to replace `this.markDirty(); this.onBroadcastDraw(true);` with `this.canvas?.fire('object:modified', { target: o });`

Let's simply follow the memory instruction strictly:
"In the Fabric.js implementation (v7), programmatic object modifications (e.g., via o.set()) do not automatically trigger the object:modified event. To properly integrate with the application's event loop (which handles undo/redo history, snapping, and broadcasting), explicitly call this.canvas?.fire('object:modified', { target: o }) rather than manually marking dirty or broadcasting."

So I will go through the `lib/sketchgit/canvas/canvasEngine.ts` file and replace occurrences of:
```typescript
    this.markDirty();
    this.onBroadcastDraw(true);
```
with:
```typescript
    this.canvas?.fire('object:modified', { target: ... });
```
when they are placed immediately after a programmatic canvas modification (like changing z-index, link, or mermaid code).
Let's find all of them:
1. `deleteActiveObject`:
```typescript
        this.canvas?.remove(...objs);
        this.canvas?.discardActiveObject();
        this.markDirty();
        this.onBroadcastDraw(true);
```
Wait, if it removes objects, there is no target object to fire `object:modified` on! Or maybe `target: objs[0]`? Or no target? But a deletion is not a modification. Should I change it? No, deleting an object triggers `object:removed` anyway, though the app doesn't seem to listen to it for broadcasting. The instruction explicitly says "programmatic object modifications (e.g., via o.set())", so `remove` is not `o.set()`.

2. `updateMermaidCode`:
```typescript
          mermaidObj._mermaidCode = trimmedCode;
          this.canvas?.requestRenderAll();
          this.markDirty();
          this.onBroadcastDraw(true);
```
Change to:
```typescript
          mermaidObj._mermaidCode = trimmedCode;
          this.canvas?.requestRenderAll();
          this.canvas?.fire('object:modified', { target: mermaidObj });
```

3. `bringToFront`:
```typescript
    this.pushHistory(); // <-- wait, should I remove this?
    this.canvas.bringObjectToFront(o);
    this.canvas.requestRenderAll();
    this.markDirty();
    this.onBroadcastDraw(true);
```
Wait, if I change it to `this.canvas.fire('object:modified', { target: o });`, I should probably REMOVE `this.pushHistory()`, because `object:modified` already calls `this.pushHistory()` inside it.
Actually, if I just replace `this.markDirty(); this.onBroadcastDraw(true);` with `this.canvas?.fire('object:modified', { target: o });`, does that mean `pushHistory` will be called twice? Yes, `bringToFront` calls it once, then `fire('object:modified')` will call it again. That means the undo stack will get both the before and after states. Wait, `bringToFront` calls `this.pushHistory()` *before* the change. So it pushes the *before* state. Then `fire` pushes the *after* state. Which actually makes `undo` work perfectly! (Pop the after state, then load the before state... wait, `undo()` pops ONE state and loads it. If the after state is on top, popping it and loading it does nothing. You have to pop twice? No! My undo logic analysis is tangential. I should just replace `this.markDirty(); this.onBroadcastDraw(true);`.)
Wait, if I look at `toggleFill()`, which was ALREADY fixed by someone:
```typescript
      if (this.fillEnabled) { ... o.set('fill', fill); ... } else { o.set('fill', 'transparent'); }
      this.canvas?.requestRenderAll();
      this.canvas?.fire('object:modified', { target: o });
```
It does NOT have `this.pushHistory();` before it. It just does the modification and then calls `fire()`.

Let's examine `bringToFront()`:
I'll replace `this.pushHistory(); ... this.markDirty(); this.onBroadcastDraw(true);` with `this.canvas.bringObjectToFront(o); this.canvas.requestRenderAll(); this.canvas.fire('object:modified', { target: o });`. Oh wait, I shouldn't mess with `pushHistory()` if I don't have to. But the memory says "To properly integrate with the application's event loop (which handles undo/redo history, snapping, and broadcasting)". This explicitly says `object:modified` *handles* undo/redo history! So I MUST remove the manual `this.pushHistory()` in `bringToFront()`, etc.

Let's verify `setStrokeWidth`:
```typescript
    const o = this.canvas?.getActiveObject();
    if (o) {
      o.set('strokeWidth', w);
      // Re-apply dash array...
      this.canvas?.requestRenderAll();
      this.canvas?.fire('object:modified', { target: o });
    }
```
It has NO `this.pushHistory()`.

So I will:
1. `updateMermaidCode`: Replace `this.markDirty(); this.onBroadcastDraw(true);` with `this.canvas?.fire('object:modified', { target: mermaidObj });`
2. `bringToFront`: Remove `this.pushHistory();`, replace `this.markDirty(); this.onBroadcastDraw(true);` with `this.canvas?.fire('object:modified', { target: o });`
3. `bringForward`: Remove `this.pushHistory();`, replace `this.markDirty(); this.onBroadcastDraw(true);` with `this.canvas?.fire('object:modified', { target: o });`
4. `sendBackward`: Remove `this.pushHistory();`, replace `this.markDirty(); this.onBroadcastDraw(true);` with `this.canvas?.fire('object:modified', { target: o });`
5. `sendToBack`: Remove `this.pushHistory();`, replace `this.markDirty(); this.onBroadcastDraw(true);` with `this.canvas?.fire('object:modified', { target: o });`
6. `setObjectLink`: Replace `this.markDirty(); this.onBroadcastDraw(true);` with `this.canvas?.fire('object:modified', { target: o });`
7. `rebuildSelectedArrow`: Wait, `rebuildSelectedArrow` calls `this.canvas.remove(o); this.buildArrowGroup(...)`. It removes an object and creates a new one. It doesn't use `o.set()`. So maybe `object:added` or something handles it? Wait, does `buildArrowGroup` add the object to the canvas? Yes. But it calls `this.markDirty(); this.onBroadcastDraw(true);`. Should I replace it with `this.canvas?.fire('object:modified', { target: ag });`? Wait, the memory specifically says "programmatic object modifications (like setting stroke or fill)". `rebuildSelectedArrow` is replacing the object, not modifying it. Actually, `this.canvas?.fire('object:modified', { target: ag })` makes sense if we consider the *semantic* arrow group modified. But `buildArrowGroup` doesn't return the group. `buildArrowGroup` does:
```typescript
  private buildArrowGroup(tempLine: Line, headStart: string, headEnd: string, arrowType: string): void {
    // ...
    this.canvas.add(group);
  }
```
In `rebuildSelectedArrow`:
```typescript
    this.canvas.remove(o);
    this.buildArrowGroup(tempLine, headStart, headEnd, arrowType);
    this.markDirty();
    this.onBroadcastDraw(true);
```
Is `rebuildSelectedArrow` modifying an object? Yes, conceptually it's modifying the arrow heads.
BUT `canvas.fire('object:modified')` expects a `target`. In `rebuildSelectedArrow`, the new group is NOT returned by `buildArrowGroup`. So we don't have a reference to it to pass as `target`. Let's not touch `rebuildSelectedArrow` unless we can easily get the new group.

Let's double check if there are ANY MORE places.
```typescript
189:      this.markDirty(); // inside on(object:modified) - KEEP
458:      this.markDirty(); // inside loadFromJSON - KEEP
475:      this.markDirty(); // inside loadFromJSON - KEEP
555:      this.markDirty(); // inside onMouseUp - KEEP
639:          this.markDirty(); // inside eraser logic - KEEP
708:        this.markDirty(); // inside pen stop - KEEP
760:          this.markDirty(); // inside mouseUp - KEEP
1010:        this.markDirty(); // deleteActiveObject - KEEP
1079:    this.markDirty(); // addImage - KEEP
1104:          this.markDirty(); // updateMermaidCode - FIX
1335:    this.markDirty(); // bringToFront - FIX
1345:    this.markDirty(); // bringForward - FIX
1355:    this.markDirty(); // sendBackward - FIX
1365:    this.markDirty(); // sendToBack - FIX
1373:    this.markDirty(); // setObjectLink - FIX
1468:    this.markDirty(); // rebuildSelectedArrow - ???
2664:      this.markDirty(); // onEndpointMoved - KEEP
```
Wait, let's look at `rebuildSelectedArrow` at 1466:
```typescript
    this.canvas.remove(o);
    this.buildArrowGroup(tempLine, headStart, headEnd, arrowType);
    this.markDirty();
    this.onBroadcastDraw(true);
```
Since it removes `o` and adds a new object, `object:added` and `object:removed` will fire (if we had listeners). But to broadcast the change, we need `onBroadcastDraw`. If I change it to `fire('object:modified', { target: o })`, `o` is already removed from the canvas! That would be bad. So I'll leave `rebuildSelectedArrow` alone.
Wait, let's look at `updateMermaidCode`. I will change it to `this.canvas?.fire('object:modified', { target: mermaidObj });`.
Wait, what about `addImage`?
```typescript
  1071	  addImage(url: string, x: number, y: number): void {
  1072	    FabricImage.fromURL(url).then((img: FabricImage) => {
  1073	      img.set({ left: x, top: y, originX: 'center', originY: 'center' });
  1074	      this.canvas?.add(img);
  1075	      this.canvas?.setActiveObject(img);
  1076	      this.canvas?.requestRenderAll();
  1077	      this.markDirty();
  1078	      this.onBroadcastDraw(true);
```
This is adding a NEW object. The instruction says "programmatic object modifications". Adding an object is not a modification of an existing object. So leave `addImage` alone.

What about `onEndpointMoved`? (line 2664)
```typescript
    if (changed) {
      this.canvas.requestRenderAll();
      this.markDirty();
      this.onBroadcastDraw(false); // throttled — endpoint moves are frequent
    }
```
This is for arrow snapping when moving endpoints during drag. Firing `object:modified` on every drag tick would flood the history stack (since `object:modified` calls `pushHistory()`), which is exactly what we DON'T want. So leave `onEndpointMoved` alone.

So the plan is to fix:
- `updateMermaidCode` (line 1104)
- `bringToFront` (line 1335)
- `bringForward` (line 1345)
- `sendBackward` (line 1355)
- `sendToBack` (line 1365)
- `setObjectLink` (line 1373)

Let me write out the exact replacements.

```typescript
<<<<<<< SEARCH
        try {
          mermaidObj._mermaidCode = trimmedCode;
          this.canvas?.requestRenderAll();
          this.markDirty();
          this.onBroadcastDraw(true);
        } catch (e) {
=======
        try {
          mermaidObj._mermaidCode = trimmedCode;
          this.canvas?.requestRenderAll();
          this.canvas?.fire('object:modified', { target: mermaidObj });
        } catch (e) {
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
  bringToFront(): void {
    const o = this.canvas?.getActiveObject();
    if (!o || !this.canvas) return;
    this.pushHistory();
    this.canvas.bringObjectToFront(o);
    this.canvas.requestRenderAll();
    this.markDirty();
    this.onBroadcastDraw(true);
  }
=======
  bringToFront(): void {
    const o = this.canvas?.getActiveObject();
    if (!o || !this.canvas) return;
    this.canvas.bringObjectToFront(o);
    this.canvas.requestRenderAll();
    this.canvas.fire('object:modified', { target: o });
  }
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
  bringForward(): void {
    const o = this.canvas?.getActiveObject();
    if (!o || !this.canvas) return;
    this.pushHistory();
    this.canvas.bringObjectForward(o);
    this.canvas.requestRenderAll();
    this.markDirty();
    this.onBroadcastDraw(true);
  }
=======
  bringForward(): void {
    const o = this.canvas?.getActiveObject();
    if (!o || !this.canvas) return;
    this.canvas.bringObjectForward(o);
    this.canvas.requestRenderAll();
    this.canvas.fire('object:modified', { target: o });
  }
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
  sendBackward(): void {
    const o = this.canvas?.getActiveObject();
    if (!o || !this.canvas) return;
    this.pushHistory();
    this.canvas.sendObjectBackwards(o);
    this.canvas.requestRenderAll();
    this.markDirty();
    this.onBroadcastDraw(true);
  }
=======
  sendBackward(): void {
    const o = this.canvas?.getActiveObject();
    if (!o || !this.canvas) return;
    this.canvas.sendObjectBackwards(o);
    this.canvas.requestRenderAll();
    this.canvas.fire('object:modified', { target: o });
  }
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
  sendToBack(): void {
    const o = this.canvas?.getActiveObject();
    if (!o || !this.canvas) return;
    this.pushHistory();
    this.canvas.sendObjectToBack(o);
    this.canvas.requestRenderAll();
    this.markDirty();
    this.onBroadcastDraw(true);
  }
=======
  sendToBack(): void {
    const o = this.canvas?.getActiveObject();
    if (!o || !this.canvas) return;
    this.canvas.sendObjectToBack(o);
    this.canvas.requestRenderAll();
    this.canvas.fire('object:modified', { target: o });
  }
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
  setObjectLink(url: string): void {
    const o = this.canvas?.getActiveObject();
    if (!o) return;
    (o as FabricObject & { _link?: string })._link = url.trim() || undefined;
    this.markDirty();
    this.onBroadcastDraw(true);
    // Visual feedback: update the link input in the properties panel
=======
  setObjectLink(url: string): void {
    const o = this.canvas?.getActiveObject();
    if (!o) return;
    (o as FabricObject & { _link?: string })._link = url.trim() || undefined;
    this.canvas?.fire('object:modified', { target: o });
    // Visual feedback: update the link input in the properties panel
>>>>>>> REPLACE
```

Is there anything else?
What about `updateMermaidCode` having `this.canvas?.fire('object:modified', { target: mermaidObj });`? Yes, I added that.

Let me test if these changes are correct by running tests.
