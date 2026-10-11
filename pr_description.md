📐 Structural Target
- File: `lib/sketchgit/canvas/canvasEngine.ts`
- Logic: Canvas shape snapping and sketch-path generation logic
- Threshold Targets: Decomposition of monolithic methods over 50 lines

💡 The Structural Debt
- The `CanvasEngine` class had grown into a massive monolith (~3300 lines) that handled everything from user interaction and history tracking to highly specialized algorithmic logic like border-point snapping and deterministic sketch-path geometry generation.
- The mixing of algorithmic pure functions (like bounding box calculations) with stateful canvas mutations blocked modular testing and violated single-responsibility clean-code principles.

🔧 The Clean Blueprint
- Extracted the mathematical snapping logic (`reSnapOnModified`, `reSnapArrowGroup`, `updateAttachedLines`, etc.) and the sketch conversion logic (`tryConvertToSketch`, `makeSketchyPath`, etc.) out of `CanvasEngine` and into a dedicated, highly testable `SnappingManager` class in `lib/sketchgit/canvas/snappingLogic.ts`.
- Cleaned up private/public visibility boundaries to ensure `SnappingManager` acts as a discrete, decoupled controller that can be unit-tested without instantiating the entire Fabric.js interaction loop.

📄 Documentation Check
- Technical documentation is aligned. The `CanvasEngine` is now strictly a router/manager, delegating to specialized controllers.
