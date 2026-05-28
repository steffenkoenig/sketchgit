Ah, wait. In `onMouseDown`, we see `this.pushHistory();` being called *before* the drag/draw gesture starts.
And in `on('object:modified')`, we have:
```typescript
    this.canvas.on('object:modified', (e: { target?: FabricObject }) => {
      // Guard against re-entrant calls...
      if (this._reSnapping) return;
      this.pushHistory();
      this.markDirty();
```
Wait! If `this.canvas.on('object:modified')` calls `this.pushHistory()`, doesn't it capture the state *after* the change?
If `on('object:modified')` captures the state *after* the change, why does `bringToFront` call `this.pushHistory()` *before*?
Let me check `this.pushHistory()`.
