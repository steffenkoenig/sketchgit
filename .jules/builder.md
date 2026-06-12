## Milestone 1.1 - Object Grouping and Alignment

**Current State Audit:** Verified the codebase. The canvas currently handles `ActiveSelection` inherently via Fabric, but lacks generic Grouping UI or methods. Fabric 7 lacks `toGroup()` and `toActiveSelection()` so groups must be constructed/destructed manually. Merge engine handled standard properties but failed out entirely when deep `_groupObjects` had non-overlapping property modifications during a 3-way merge.

**Completed Items:**
- [x] Fix ungroup selection to correctly destroy Fabric groups.
- [x] Fix align selection to calculate boundaries and set coordinates correctly.
- [x] Unit test coverage passed for all alignment and grouping scenarios.
- [x] Deep 3-way merging of `_groupObjects` in `mergeEngine.ts` -> Attached Test: `successfully deep merges non-overlapping properties within _groupObjects`
- [x] Deep 3-way merging conflict triggering for child object property conflicts -> Attached Test: `returns null (raises conflict) when the same property of a child object is modified differently`
- [x] Update docs (customer, technical, support) with new functionality.

**Active Step:** Complete.
**Blockers/Constraints:** None.


## Bug Fixes (Milestone 1.0)
**Current State Audit:** Verified fixes for BUG-012, BUG-013, BUG-014, BUG-015, and BUG-016.
**Completed Items:**
- [x] Fixed undo state post-transform (BUG-012)
- [x] Fixed WsClient.connect orphaning sockets (BUG-013)
- [x] Fixed timeline branch peer notification (BUG-014)
- [x] Verified fix for color change undo (BUG-015)
- [x] Rate limited forgot-password and reset-password routes (BUG-016)
- [x] Updated docs/support/index.md
**Active Step:** Complete.
**Blockers/Constraints:** None.

## Milestone 1.2 - Canvas Context Menus
**Current State Audit:** Verified the codebase. The canvas lacks context menus, users need to use properties panel for layer ordering and delete key for deletion.
**Completed Items:**
- [x] Added `deleteSelection` method to `CanvasEngine`.
- [x] Implemented right-click interception in `CanvasEngine` that emits `sketchgit-context-menu` event.
- [x] Added `ContextMenu` React component acting as portal overlay.
- [x] Added grouping, layer manipulation, and delete buttons to ContextMenu.
- [x] Verify tests run successfully without regressions.
- [x] Updated docs (customer, technical, support).

**Active Step:** Complete.
**Blockers/Constraints:** None.
