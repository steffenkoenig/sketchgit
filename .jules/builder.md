## Milestone 1.1 - Object Grouping and Alignment

**Current State Audit:** Verified the codebase. The canvas currently handles `ActiveSelection` inherently via Fabric, but lacks generic Grouping UI or methods. Fabric 7 lacks `toGroup()` and `toActiveSelection()` so groups must be constructed/destructed manually. Merge engine handles standard properties but needs updates for deep `_groupObjects` handling during a 3-way merge.

**Completed Items:**
- [x] Fix ungroup selection to correctly destroy Fabric groups.
- [x] Fix align selection to calculate boundaries and set coordinates correctly.
- [x] Unit test coverage passed for all alignment and grouping scenarios.
- [x] Update docs (customer, technical, support) with new functionality.

**Active Step:** Complete Pre-commit steps.
**Blockers/Constraints:** None.
