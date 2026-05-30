# SketchGit Technical Documentation
## Dependency Licensing & Architecture (Milestone 1.0)
- **Arrow Snap Crash (BUG-020 & BUG-021):** Resolved infinite re-entrancy loop on object modification by correctly canceling active animation frames during rebuild.
- **Dependency Licenses (P089):** Integrated `license-checker-rseidelsohn` into the CI pipeline. Allowed licenses are strictly listed in `reports/license-policy.md`.
- **Google Fonts (GAP-016):** Fonts are compiled natively using `next/font/google`.
- **Object Grouping and Alignment (Milestone 1.0)**: Added native `ActiveSelection` and `Group` support in `CanvasEngine` (`groupObjects`, `ungroupObjects`, `align*` methods). Replaced broken Fabric v7 group operations with manual object removal, instantiation of a new `Group` object configured with a `_isUserGroup` custom property to ensure proper tracking across branches via the `mergeEngine`. Keyboard shortcuts `Ctrl+G` and `Ctrl+Shift+G` were wired into the `onKey` handler.
