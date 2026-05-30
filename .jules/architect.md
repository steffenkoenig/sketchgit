## Refactor Target: [lib/sketchgit/canvas/canvasEngine.ts]
**Identified Structural Flaw:** The core event handler functions (`onMouseDown`, `onMouseMove`, `onMouseUp`) within the `CanvasEngine` class have grown into monolithic, multi-responsibility routines (over 100 lines each) handling a deeply nested matrix of conditional logic based on the currently selected tool.
**Impact on Maintainability:** This bloat significantly increases cognitive friction when attempting to add new tools or modify existing behaviors. It tightly couples the interaction logic for completely distinct features (e.g., pen strokes vs. text placement) into a single execution path, blocking modular unit testing for isolated tools.
**The Clean Architecture Blueprint:** The `CanvasEngine` interaction loops will be cleanly decomposed. The main event handlers will act strictly as routers, delegating tool-specific execution logic to isolated, private subroutines (e.g., `handleMouseDownPen`, `handleMouseMoveEraser`, `handleMouseUpShape`). This matches modern controller-delegate patterns and ensures the code self-documents its distinct logical flows.
**Verification & Refactor Logic:**
1. Extract the Pen-tool branching logic from `onMouseDown` into a dedicated `handleMouseDownPen(p)` subroutine.
2. Extract the Text and Mermaid placement logic into `handleMouseDownText(p)` and `handleMouseDownMermaid(p)`.
3. Extract generic shape generation (Rect, Ellipse, Line) into `handleMouseDownShape(p)`.
4. Apply the same decomposition strategy to `onMouseMove` (Eraser, Pen, Shape resizing) and `onMouseUp` (Pen path conversion, Shape finalization).
