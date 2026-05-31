## Milestone 1.0 - Bug Fixes & Compliance

**Current State Audit:** Verified the codebase before implementing changes. Confirmed that BUG-020 and BUG-021 were caused by unhandled event recursive loops and stale `requestAnimationFrame` references. Identified GAP-016 (GDPR violation with Google Fonts CDN). Confirmed absence of automated license checking (P089).

**Completed Items:**
- [x] Fix Arrow Snap Crash (BUG-020 & BUG-021) -> Attached Test: `npm test` passed
- [x] Eliminate Google Fonts CDN (GAP-016) -> Docs Updated: Customer, Technical, Support
- [x] Dependency License Scanning (P089) -> Docs Updated: Customer, Technical, Support

**Active Step:** Finished.
**Blockers/Constraints:** None.

## Milestone 1.1 - Object Grouping and Alignment

**Current State Audit:** Verified the codebase. The canvas currently handles `ActiveSelection` inherently via Fabric, but lacks generic Grouping UI or methods. Fabric 7 lacks `toGroup()` and `toActiveSelection()` so groups must be constructed/destructed manually. Merge engine handles standard properties but needs updates for deep `_groupObjects` handling during a 3-way merge.

**Completed Items:**

**Active Step:** Implementing Grouping and Alignment logic.
**Blockers/Constraints:** None.
