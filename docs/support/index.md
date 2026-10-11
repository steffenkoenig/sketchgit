# SketchGit Support Documentation
## Bug Fixes (Milestone 1.0)
- Addressed bugs BUG-020 and BUG-021 which previously caused tab crashes when snapping arrows near boundaries. The engine now safely halts redundant animation frames.
- BUG-012: Moving and resizing objects can now be accurately undone with a single Ctrl+Z action.
- BUG-013: Fixed a WebSocket issue where switching rooms would orphan existing connections and cause continuous spurious reconnections.
- BUG-014: Switching branches via the timeline SVG label now instantly notifies peers and updates their presence panels.
- BUG-016: Password reset and forgot password endpoints are now properly rate-limited to protect against abuse.

## Known Constraints & Troubleshooting

### Object Grouping & Merging (Milestone 1.1)
- **Nested Conflict Resolution:** While standard group property changes merge automatically, overlapping edits to the *exact same property* on the exact same child object inside a group will bubble up and mark the *entire group* as conflicting. Non-overlapping property changes on the same child object will merge automatically. If users complain about missing deep-conflict UI for groups, inform them that they must choose between the two group states entirely during a branch merge.
- **Lost Objects in Groups:** If users experience objects disappearing when grouped, verify that they aren't placing very large groups far outside the viewport. Fabric.js culling may hide them.

### Canvas Context Menus (Milestone 1.2)
- **Menu Visibility:** If users report the right-click menu not appearing, ensure they are not overriding right-click behavior via system tools or extensions. The menu relies on the `contextmenu` HTML event.
- **Missing Group Option:** The "Group" option will only appear if *multiple* objects are selected. The "Ungroup" option will only appear if exactly *one* group object is selected. Inform users to left-click or drag-select multiple objects first before right-clicking to access these options.

### Two-Factor Authentication (Milestone 2.0)
- **Email Delivery Issues:** If users are not receiving 2FA codes, ensure the `RESEND_API_KEY` is correctly configured and the email provider is not bouncing messages. The emails contain a 6-digit code valid for 10 minutes.
- **Account Recovery:** Currently, if a user loses access to their email entirely, their account cannot be recovered automatically as SketchGit relies on the email address as the primary identity anchor for both password resets and 2FA.
