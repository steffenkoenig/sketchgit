# SketchGit Technical Documentation
## Dependency Licensing & Architecture (Milestone 1.0)
- **Arrow Snap Crash (BUG-020 & BUG-021):** Resolved infinite re-entrancy loop on object modification by correctly canceling active animation frames during rebuild.
- **Dependency Licenses (P089):** Integrated `license-checker-rseidelsohn` into the CI pipeline. Allowed licenses are strictly listed in `reports/license-policy.md`.
- **Google Fonts (GAP-016):** Fonts are compiled natively using `next/font/google`.

## Object Grouping & 3-Way Merge Architecture (Milestone 1.1)
- **Fabric.js v7 Compatibility:** Since Fabric.js v7 deprecated `toGroup()` and `toActiveSelection()`, grouping is implemented manually. Selected objects are extracted from the canvas via `removeAll()` and wrapped in a `new Group(items)`. Ungrouping reverses this by taking the Group's children and placing them in an `ActiveSelection`.
- **Merge Engine Compatibility (`lib/sketchgit/git/mergeEngine.ts`):** `_groupObjects` arrays (which store the inner objects of a group) are deeply evaluated during a 3-way branch merge. Using stable `_id` identifiers on the group's children, the merge engine recursively compares properties. Non-overlapping property changes on the same child object resolve automatically. Conflicting modifications to the same property bubble up to the top-level group to avoid complex nested conflict resolution UI.

## Canvas Context Menus (Milestone 1.2)
- **Implementation:** Integrated a native DOM `contextmenu` event listener to `#canvas-wrap` within `CanvasEngine`. It intercepts the event, prevents the default browser context menu, and determines what actions are applicable based on `this.canvas.getActiveObjects()`. It dispatches a custom `sketchgit-context-menu` window event with client coordinates and context state variables (`hasSelection`, `canGroup`, `canUngroup`).
- **UI Architecture:** `<ContextMenu />` is rendered dynamically as a React portal overlay above the canvas container using `position: fixed`. It listens to the window event, sets its active coordinates, and relies on `call()` to communicate canvas manipulation intent back to the `CanvasEngine`. Scrolling, keypresses (Escape), or outside clicks close the menu seamlessly.

## Two-Factor Authentication (Milestone 2.0)
- **Implementation:** Integrated an email-based Two-Factor Authentication (2FA) flow into the existing NextAuth v5 credentials provider. A custom `CredentialsSignin` subclass is thrown to propagate the `2FA_REQUIRED` state to the client without exposing raw error strings, which are sanitized by default in NextAuth v5.
- **Verification:** OTP tokens are generated using `node:crypto`'s `randomInt` for CSPRNG security and are stored with a 10-minute expiry. They are verified seamlessly within the `authorize` callback if the `code` field is provided in the credentials payload.
