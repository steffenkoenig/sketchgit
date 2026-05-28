Let's see:
In `updateMermaidCode`:
```typescript
  1101	        try {
  1102	          mermaidObj._mermaidCode = trimmedCode;
  1103	          this.canvas?.requestRenderAll();
  1104	          this.markDirty();
  1105	          this.onBroadcastDraw(true);
```
In `bringToFront`:
```typescript
  1333	    this.canvas.bringObjectToFront(o);
  1334	    this.canvas.requestRenderAll();
  1335	    this.markDirty();
  1336	    this.onBroadcastDraw(true);
```
In `bringForward`:
```typescript
  1343	    this.canvas.bringObjectForward(o);
  1344	    this.canvas.requestRenderAll();
  1345	    this.markDirty();
  1346	    this.onBroadcastDraw(true);
```
In `sendBackward`:
```typescript
  1353	    this.canvas.sendObjectBackwards(o);
  1354	    this.canvas.requestRenderAll();
  1355	    this.markDirty();
  1356	    this.onBroadcastDraw(true);
```
In `sendToBack`:
```typescript
  1363	    this.canvas.sendObjectToBack(o);
  1364	    this.canvas.requestRenderAll();
  1365	    this.markDirty();
  1366	    this.onBroadcastDraw(true);
```
In `setObjectLink`:
```typescript
  1372	    (o as FabricObject & { _link?: string })._link = url.trim() || undefined;
  1373	    this.markDirty();
  1374	    this.onBroadcastDraw(true);
```
Wait, the memory rule says: "In the Fabric.js implementation (v7), programmatic object modifications (e.g., via o.set()) do not automatically trigger the object:modified event. To properly integrate with the application's event loop (which handles undo/redo history, snapping, and broadcasting), explicitly call this.canvas?.fire('object:modified', { target: o }) rather than manually marking dirty or broadcasting."

So my plan is to replace the manual `this.markDirty(); this.onBroadcastDraw(true);` with `this.canvas?.fire('object:modified', { target: o });` in ALL these places!

Wait! In `bringToFront()` etc, they call `this.pushHistory()` BEFORE they do `bringObjectToFront(o)`.
If I change them to `fire('object:modified', { target: o })`, the `object:modified` event listener WILL CALL `this.pushHistory()` AGAIN!
Is that a problem?
Let's see what `object:modified` does:
```typescript
    this.canvas.on('object:modified', (e: { target?: FabricObject }) => {
      // Guard against re-entrant calls...
      if (this._reSnapping) return;
      this.pushHistory();
      this.markDirty();
```
If we call `pushHistory()` before the move, we save the state BEFORE the move. Then we move it. Then we call `fire('object:modified')`, which calls `pushHistory()` AGAIN, saving the state AFTER the move!
Wait. If we save the state AFTER the move, when we press undo, we just go back to the state AFTER the move! That would be a bug! We need to push the state BEFORE the move.
Actually, if we look at `onMouseDown`, it calls `this.pushHistory()` BEFORE the drag starts. Then when the drag finishes, `object:modified` fires and calls `this.pushHistory()` AGAIN!
Wait, if it pushes again AFTER the modification, wouldn't it push the new state onto the undo stack?
Let's look at `pushHistory()` again.
```typescript
  private pushHistory(): void {
    const json = this.getCanvasData();
    this.undoStack.push(json);
    if (this.undoStack.length > this.MAX_HISTORY) {
      this.undoStack.shift(); // evict oldest to keep stack bounded
    }
  }
```
Wait, `pushHistory()` just pushes the CURRENT canvas data onto the stack.
If `onMouseDown` pushes the state BEFORE the user action, and `object:modified` pushes the state AFTER the user action? Wait, NO. `object:modified` shouldn't push the state AFTER.
Let's trace:
1. Canvas is A.
2. User clicks. `onMouseDown` calls `pushHistory()` -> Stack = [A].
3. User drags and releases. `object:modified` fires!
4. `object:modified` calls `pushHistory()` -> Stack = [A, B] (where B is the state after the drag).
Then when the user presses UNDO, it pops B from `undoStack`, and restores B! But wait, if it restores B, nothing changes!
Let me look at `undo()`.
