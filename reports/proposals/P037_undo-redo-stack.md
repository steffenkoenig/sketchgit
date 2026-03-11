# P037 – Undo/Redo Stack in CanvasEngine

## Title
Implement an Undo/Redo History Stack in the Canvas Engine with Ctrl+Z / Ctrl+Shift+Z Support

## Brief Summary
The canvas currently has no undo or redo capability. Every drawing action — adding an object, moving it, changing its colour, or accidentally erasing it — is permanent until the user creates a new commit or manually reverts to a previous one via git checkout. This is one of the most fundamental UX expectations for any graphical tool, and its absence makes the app significantly harder to use in practice. Fabric.js provides the building blocks needed (`canvas.getObjects()`, `loadFromJSON`) for a straightforward history-stack implementation without third-party dependencies.

## Current Situation
`canvasEngine.ts` handles all drawing events (`onMouseUp`, `object:modified`, eraser) and fires `markDirty()` plus `onBroadcastDraw()` after each change. There is no snapshot stack. The only way to "undo" is to restore a previous commit (which requires opening the timeline modal, clicking a commit, and calling checkout — a five-step process compared to Ctrl+Z).

The `onKey` handler already processes keyboard events but currently only handles tool shortcuts:
```typescript
private onKey(e: KeyboardEvent): void {
  if (e.code === 'Delete' || e.code === 'Backspace') { /* delete selected */ }
  if (e.ctrlKey || e.metaKey) {
    switch (e.key) {
      case 'z': // not handled
      case 'y': // not handled
    }
  }
  // … tool switching …
}
```

## Problem with Current Situation
1. **Accidental erasure is permanent**: A mis-click with the eraser tool, or pressing Delete with multiple objects selected, permanently removes canvas objects with no recovery path short of a full commit checkout.
2. **UX friction for iterative drawing**: The art of sketching is iterative. Without undo, users must commit before each experiment, polluting the git history with "test" commits.
3. **Disproportionate cost of mistakes**: A single accidental drag-move of a critical object requires either remembering its exact position or reverting an entire commit.
4. **Missing universal keyboard shortcut**: Ctrl+Z is arguably the most universal keyboard shortcut in desktop software. Its absence makes the app feel unfinished.

## Goal to Achieve
1. Maintain a bounded history stack (default: 50 states) inside `CanvasEngine`.
2. Push a new snapshot onto the stack after every user-initiated change (draw complete, object modified, eraser stroke complete, paste).
3. Pop states on Ctrl+Z (undo) and Ctrl+Shift+Z / Ctrl+Y (redo), then reload the canvas from the restored snapshot.
4. Broadcast the restored state to peers after an undo/redo (so collaborators see the change).
5. Clear the redo stack whenever a new user action occurs (standard behaviour).
6. Persist no extra data to the database; undo/redo is session-local and intentionally not reflected in commit history.

## What Needs to Be Done

### 1. Add history stack state to `CanvasEngine`
```typescript
private readonly MAX_HISTORY = 50;
private undoStack: string[] = [];  // canvas JSON snapshots
private redoStack: string[] = [];

/** Push a canvas snapshot. Call after every completed user action. */
private pushHistory(): void {
  const json = this.getCanvasData();
  this.undoStack.push(json);
  if (this.undoStack.length > this.MAX_HISTORY) {
    this.undoStack.shift(); // evict oldest
  }
  this.redoStack = []; // new action clears redo stack
}
```

### 2. Call `pushHistory()` at the right moments
Snap the state immediately *before* the destructive action so that undo restores the pre-action state:
- **`onMouseUp`**: after a shape, line, arrow, or pen stroke is finalised and added to the canvas.
- **`object:modified`**: in the Fabric.js event handler, after the modification is confirmed.
- **`eraser` completion**: after the erased object is removed in `onMouseUp`.
- **Delete key handler**: after selected objects are removed.

To avoid double-push, call `pushHistory()` inside `onMouseDown` at the start of each drawing gesture (capturing pre-action state) rather than after:
```typescript
private onMouseDown(e: TPointerEventInfo): void {
  // Snapshot before this gesture begins
  if (this.currentTool !== 'select') this.pushHistory();
  // … rest of handler
}
```

### 3. Implement `undo()` and `redo()` methods
```typescript
undo(): void {
  const snapshot = this.undoStack.pop();
  if (!snapshot) return;
  const current = this.getCanvasData();
  this.redoStack.push(current);
  this.loadCanvasData(snapshot);
  this.markDirty();
  this.onBroadcastDraw(true); // broadcast to peers immediately
}

redo(): void {
  const snapshot = this.redoStack.pop();
  if (!snapshot) return;
  const current = this.getCanvasData();
  this.undoStack.push(current);
  this.loadCanvasData(snapshot);
  this.markDirty();
  this.onBroadcastDraw(true);
}
```

### 4. Wire keyboard shortcuts in `onKey`
```typescript
if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
  e.preventDefault();
  if (e.shiftKey) {
    this.redo();
  } else {
    this.undo();
  }
  return;
}
if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
  e.preventDefault();
  this.redo();
  return;
}
```

### 5. Clear history on `loadCanvasData` (checkout/merge)
When the git model restores a different commit's canvas, the local undo history is stale. Clear both stacks on external data loads:
```typescript
loadCanvasData(data: string): void {
  this.undoStack = [];
  this.redoStack = [];
  this.canvas?.loadFromJSON(…).then(…);
}
```

### 6. Add tests in `canvasEngine.test.ts`
- After 3 `pushHistory` calls, `undoStack.length === 3`.
- `undo()` pops from `undoStack` and pushes to `redoStack`.
- `redo()` pops from `redoStack` and pushes to `undoStack`.
- New action after undo clears `redoStack`.
- Stack eviction: after `MAX_HISTORY + 1` pushes, stack length stays at `MAX_HISTORY`.
- `loadCanvasData` clears both stacks.

## Components Affected
| Component | Change |
|-----------|--------|
| `lib/sketchgit/canvas/canvasEngine.ts` | Add `undoStack`, `redoStack`; add `pushHistory()`, `undo()`, `redo()`; wire Ctrl+Z/Y in `onKey`; clear on `loadCanvasData` |
| `lib/sketchgit/canvas/canvasEngine.test.ts` | New tests for undo/redo behaviour |

## Data & Database Model
No changes. Undo/redo is session-local and ephemeral. It does not interact with the git commit model or the database.

## Testing Requirements
- Unit: `undo()` with empty stack is a no-op (no crash).
- Unit: `redo()` after a fresh `loadCanvasData` is a no-op.
- Unit: undo/redo round-trip restores the original canvas JSON.
- Unit: stack is bounded at `MAX_HISTORY`.
- Unit: new action after undo clears redo stack.

## Linting and Type Requirements
- `undoStack` and `redoStack` typed as `string[]` (canvas JSON snapshots).
- `pushHistory()` is `private`; `undo()` and `redo()` are `public` for testing.
- Keyboard event handler guards: `e.preventDefault()` must be called before `undo()`/`redo()` to prevent browser's native undo from firing.

## UX Considerations
- The undo stack is **not** shared between collaborators. Each user has their own local undo history. When a peer's draw arrives, it updates the canvas but does not corrupt the local undo stack (since the peer change is not user-initiated locally). This is consistent with how collaborative tools like Google Docs handle undo.
- After `undo()`, the broadcast ensures peers see the restored state — they will not have a redo option for the change (standard collaborative undo semantics).
- Consider a visual indicator (button state, toast) showing undo/redo availability as a future UX enhancement.

## Dependency Map
- Depends on: P001 ✅ (module decomposition), P022 ✅ (canvas rendering performance, `loadFromJSON` is correct)
- Complements: P037 enhances P033 (delta storage): undo pops a local snapshot, not a DB delta
- Independent of: P006 ✅ (draw-delta protocol handles broadcasting the restored state)
