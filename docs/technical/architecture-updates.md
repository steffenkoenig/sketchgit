# Technical Architecture Updates

## Font Loading Strategy (GAP-016)

The application no longer uses external CDNs (like `fonts.googleapis.com`) for font loading. This change was implemented to prevent IP leakage to third parties, ensuring strict compliance with DSGVO (GDPR) and TTDSG regulations.

**Implementation Details:**
- `next/font/google` is now used to bundle and serve `Space_Grotesk` and `Fira_Code` locally.
- CSS variables (`--font-space-grotesk` and `--font-fira-code`) are injected into the HTML `className` and referenced in `tailwind.config.ts`.
- The `app/globals.css` file was updated to remove the external `@import` URL.

## Dependency License Compliance Pipeline (P089)

To protect the project from non-compliant restrictive copyleft licenses, we have integrated a new license scanning check into our CI pipeline.

**Implementation Details:**
- **Tooling:** We use `license-checker-rseidelsohn`.
- **Policy:** Defined in `reports/license-policy.md`.
- **Enforcement:** A new script `scripts/check-licenses.mjs` is executed during the GitHub Actions CI workflow (`.github/workflows/ci.yml`). If a production dependency violates the policy (e.g., includes a GPL or AGPL license), the CI build will fail.

## Object Grouping and Alignment (Milestone 1.1)

Introduced native "Object Grouping" capabilities to treat multiple Fabric objects as a unified component, and "Alignment" controls (Left, Right, Top, Bottom, Center H/V) in the contextual toolbar.

**Implementation Details:**
- **Merge Engine:** The 3-way merge engine handles standard properties and has been updated to deeply synchronize `_groupObjects` inside a group.
- **Grouping Logic:** Due to Fabric 7 lacking `toGroup()`/`toActiveSelection()`, ungrouping removes the group object and re-instantiates individual objects.
- **Alignment Logic:** ActiveSelection computes boundaries natively. The alignment coordinates recalculation executes `setCoords()` so bounding boxes properly update upon aligning grouped/selected elements.
