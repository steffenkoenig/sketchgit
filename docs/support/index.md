# SketchGit Support Documentation
## Bug Fixes (Milestone 1.0)
- Addressed bugs BUG-020 and BUG-021 which previously caused tab crashes when snapping arrows near boundaries. The engine now safely halts redundant animation frames.

## Known Constraints & Troubleshooting

### Object Grouping & Merging (Milestone 1.1)
- **Nested Conflict Resolution:** While standard group property changes merge automatically, overlapping edits to the *exact same property* on the exact same child object inside a group will bubble up and mark the *entire group* as conflicting. Non-overlapping property changes on the same child object will merge automatically. If users complain about missing deep-conflict UI for groups, inform them that they must choose between the two group states entirely during a branch merge.
- **Lost Objects in Groups:** If users experience objects disappearing when grouped, verify that they aren't placing very large groups far outside the viewport. Fabric.js culling may hide them.
