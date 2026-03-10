# P022 – Canvas Rendering Performance and Object Lifecycle

## Title
Improve Canvas Rendering Performance: Batch Renders, Reduce Object Churn, and Cache Arrows

## Brief Summary
The canvas engine creates and destroys Fabric.js objects at a high rate during active drawing: every `mousemove` event while using the pen tool recreates the entire path object from scratch, and every arrow stroke creates a new group of three primitives (line + polygon + group). These patterns cause excessive garbage collection pauses, inflate the Fabric.js internal object tree, and trigger implicit `renderAll()` calls more frequently than necessary. Switching the pen tool to in-place point appending, batching `renderAll()` calls with `requestAnimationFrame`, and caching arrow geometry reduces CPU usage and smooths perceived drawing performance.

## Current Situation

### 1. Pen tool rebuilds the entire path object on every mousemove
In `canvasEngine.ts`, the pen tool's `mousemove` handler removes the current path and re-adds a new one with all accumulated points:

```typescript
// canvasEngine.ts – pen tool mousemove handler (approximate)
canvas.remove(this.activePath);
this.activePath = new fabric.Path(this.buildSvgPath(this.penPoints), { ... });
canvas.add(this.activePath);
canvas.renderAll();
```

For a 2-second stroke at 60 fps, this creates and discards 120 complete `fabric.Path` objects. Each object instantiation runs the Fabric.js constructor (parsing SVG path data, computing bounding box, registering with the canvas object list).

### 2. Arrow creation produces three new objects per stroke
The arrow tool creates a group of three primitives on every `mouseup`:
```typescript
// canvasEngine.ts – arrow tool
const line    = new fabric.Line([x1, y1, x2, y2], { ... });
const head    = new fabric.Polygon([...arrowheadPoints], { ... });
const group   = new fabric.Group([line, head], { ... });
canvas.add(group);
```
For a canvas with 200 arrows, this means 600 individual Fabric.js objects. Each object participates in `renderAll()` traversal, increasing render time proportionally.

### 3. No requestAnimationFrame batching
Every call to `canvas.renderAll()` is synchronous and immediate. Rapid events (mousemove at 60+ fps, resize, remote draw-delta application) can trigger multiple `renderAll()` calls within the same animation frame:
```typescript
// Each of these lines may trigger an implicit renderAll:
canvas.add(newObject);
canvas.setActiveObject(obj);
canvas.requestRenderAll();  // may not be used consistently
```
The result is more re-renders per second than the display can show (> 60), wasting CPU on invisible intermediate states.

### 4. Large canvas serialization on every delta computation
The draw-delta system (P006) compares JSON snapshots of each object to detect changes. For complex objects like groups or paths with many points, `JSON.stringify(obj.toObject())` is called on every delta cycle (100 ms throttle). For a canvas with 500 objects, this is 500 serializations every 100 ms = 5,000 serializations/second.

## Problem with Current Situation
1. **GC pauses**: Creating and immediately discarding Fabric.js objects at 60 fps during pen strokes generates significant garbage. V8's minor GC ("scavenge") runs frequently to reclaim the short-lived objects, causing 1–5 ms pauses that manifest as hitching during smooth strokes.
2. **Render budget exceeded**: Multiple `renderAll()` calls per animation frame render invisible intermediate states. The canvas GPU upload happens multiple times per frame with no visible benefit.
3. **Bloated object tree**: 600 objects for 200 arrows (3× overhead) means `renderAll()` traverses 3× more objects than necessary. Switching to a flat `fabric.Line` with a custom arrowhead rendered via Fabric.js's `afterRender` hook, or using a cached group pattern, reduces traversal cost.
4. **Serialization cost**: 5,000 `JSON.stringify` calls per second (500 objects × 10 delta checks/sec) contributes measurable CPU time on lower-powered devices.

## Goal to Achieve
1. Reduce pen stroke object churn from O(events) to O(1): update the active path in-place instead of recreating it.
2. Batch all `renderAll()` calls to at most one per animation frame using `requestAnimationFrame`.
3. Replace the 3-object arrow representation with a 2-object (or single custom object) representation.
4. Reduce delta serialization cost by maintaining a dirty flag per object and only serializing dirty objects.

## What Needs to Be Done

### 1. Update pen path in-place instead of replacing it
Fabric.js `fabric.Path` does not directly support appending points after creation, but drawing can be done using `fabric.PencilBrush` (Fabric.js's built-in freehand drawing tool) or by accumulating points in a `fabric.Polyline` and converting to a `Path` only on `mouseup`:
```typescript
// On mousemove: update polyline points in-place
this.activeLine.set('points', [...this.penPoints]);
this.activeLine.setCoords();
canvas.requestRenderAll(); // Schedule, don't force
```
On `mouseup`, convert the polyline to a permanent optimized `Path` (using path simplification if desired) and replace the temporary polyline. This reduces object churn from O(N events) to exactly 1 temporary + 1 final.

### 2. Use `requestRenderAll()` instead of `renderAll()`
Replace all `canvas.renderAll()` calls with `canvas.requestRenderAll()`. Fabric.js 5.x's `requestRenderAll()` schedules the render with `requestAnimationFrame`, automatically deduplicating multiple calls within the same frame:
```typescript
// Before
canvas.add(obj);
canvas.renderAll(); // Renders immediately

// After
canvas.add(obj);
canvas.requestRenderAll(); // Batched; renders once per frame
```
A codebase-wide search confirms that `renderAll()` is called in multiple places; all should be changed.

### 3. Replace 3-object arrow group with a custom Fabric.js object
Define a single `ArrowObject` class that extends `fabric.Object` and draws the line + arrowhead in its `_render()` method using Canvas 2D API directly:
```typescript
class ArrowObject extends fabric.Object {
  x1: number; y1: number; x2: number; y2: number;

  _render(ctx: CanvasRenderingContext2D): void {
    const dx = this.x2 - this.x1, dy = this.y2 - this.y1;
    const len = Math.hypot(dx, dy);
    // draw line and arrowhead directly on ctx
    ...
  }
}
```
This reduces the object count for 200 arrows from 600 to 200—a 3× reduction in `renderAll()` traversal cost.

### 4. Add per-object dirty flags to the delta system
Instead of serializing all objects every 100 ms, track which objects have changed since the last broadcast using Fabric.js's `object:modified` and `object:added` events:
```typescript
canvas.on('object:modified', (e) => this.dirtyIds.add(e.target?.data?.id));
canvas.on('object:added',    (e) => this.dirtyIds.add(e.target?.data?.id));
```
In the delta flush, serialize only objects in `dirtyIds`:
```typescript
flushDelta(): void {
  if (this.dirtyIds.size === 0) return;
  const delta = [...this.dirtyIds].map(id => serializeObject(this.objectMap[id]));
  this.wsClient.send({ type: 'draw-delta', modified: delta });
  this.dirtyIds.clear();
}
```
This reduces delta serialization from O(all objects) to O(changed objects), which is typically O(1) for normal drawing interactions.

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `lib/sketchgit/canvas/canvasEngine.ts` | Replace `renderAll()` with `requestRenderAll()`; rewrite pen tool to update in-place; replace arrow group with `ArrowObject` |
| `lib/sketchgit/realtime/collaborationManager.ts` | Add dirty-flag tracking; serialize only dirty objects in delta flush |

## Additional Considerations

### Fabric.js PencilBrush
Fabric.js ships a built-in `PencilBrush` that handles freehand drawing with smooth path creation. Using it for the pen tool would replace the custom mousemove/path-rebuild logic entirely and benefit from Fabric.js's internal optimizations (path smoothing, deferred rendering). This is the simplest path to resolving the object churn issue.

### Path simplification
Long pen strokes accumulate hundreds of points. Apply the Ramer-Douglas-Peucker algorithm on `mouseup` to reduce the point count (e.g., from 300 points to 20) before storing the final path. This reduces:
- Canvas JSON size (smaller commits, faster serialization in P006 delta)
- `renderAll()` cost for complex strokes
- Merge conflict surface (fewer properties to compare per object)

### Canvas performance profiling
Use Chrome DevTools' Performance panel to record a 5-second drawing session and identify the specific functions consuming the most CPU time. Focus optimization effort on the top-3 hotspots rather than applying all changes simultaneously.

### Testing
Add Vitest tests for `ArrowObject._render()` using a mock `CanvasRenderingContext2D` and for the dirty-flag flush logic (assert only dirty objects are serialized). These are unit-testable without a full DOM environment using `canvas` npm package or by mocking the context.
