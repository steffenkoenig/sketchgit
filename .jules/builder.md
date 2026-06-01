## Milestone 1.1 - Object Grouping and Alignment

**Current State Audit:** Verified the codebase. The canvas currently handles `ActiveSelection` inherently via Fabric, but lacks generic Grouping UI or methods. Fabric 7 lacks `toGroup()` and `toActiveSelection()` so groups must be constructed/destructed manually. Merge engine handled standard properties but failed out entirely when deep `_groupObjects` had non-overlapping property modifications during a 3-way merge.

**Completed Items:**
- [x] Deep 3-way merging of `_groupObjects` in `mergeEngine.ts` -> Attached Test: `successfully deep merges non-overlapping properties within _groupObjects`
- [x] Deep 3-way merging conflict triggering for child object property conflicts -> Attached Test: `returns null (raises conflict) when the same property of a child object is modified differently`
- [x] Docs Updated: Technical, Support

**Active Step:** Complete.
**Blockers/Constraints:** None.
