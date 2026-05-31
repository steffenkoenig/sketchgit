## Refactor Target: lib/sketchgit/git/mergeEngine.ts
**Identified Structural Flaw:**
- **Monolithic Function Bloat:** The `threeWayMerge` function is overly long (~150 lines), violating single-responsibility and structural length limits. It handles canvas property merging, object iteration, property conflict detection, line-level merging for mermaid diagrams, and resolution packaging all in one block.
- **Cryptic Naming:** Several functions use ambiguous single-letter or short variables (`bVal`, `oVal`, `tVal`, `b`, `o`, `t`, `c`, `p`), demanding unnecessary cognitive load to determine if they represent base, ours, theirs, or parent commits.

**Impact on Maintainability:**
- **Cognitive Friction:** Developers attempting to modify conflict resolution logic (e.g., adding group merge support) must parse through 100+ lines of nested loop conditions. The obscure abbreviations mean the code doesn't self-document.
- **Testing Overhead:** It is impossible to test just the single-object conflict algorithm or the canvas-property merger without mocking the entire 3-way canvas envelope logic.

**The Clean Architecture Blueprint:**
- **Modularization:** Decompose `threeWayMerge` into isolated subroutines: `mergeCanvasProperties` (to handle root level overrides) and `mergeSingleObject` (to encapsulate the property-level diffing logic for an individual shape).
- **Self-Documenting Code:** Rename all cryptic variables systematically (`bVal` -> `baseValue`, `b` -> `baseLine`, `c` -> `commit`).
- **Idiomatic Typing:** Maintain strict type boundaries while reducing function lengths under standard thresholds.

**Verification & Refactor Logic:**
1. Develop a custom Node.js script to extract and rewrite `threeWayMerge` without triggering patch errors.
2. Ensure the extracted `mergeSingleObject` handles all `null` propagation and nested checks correctly.
3. Validate through existing comprehensive unit tests (`npx vitest run mergeEngine.test.ts`) that no behavioral regressions occurred.
