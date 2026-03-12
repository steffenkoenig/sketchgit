# BUG-019 – `threeWayMerge()` uses ancestor canvas structure; discards "ours" canvas-level changes

## Summary
The clean-merge return path in `threeWayMerge()` reconstructs the result from `baseData` (the common ancestor), not `oursData`; any canvas-level property changed on "our" branch (e.g. `backgroundColor`, `backgroundImage`, `version`) is silently reverted to the ancestor value.

## Severity
`medium`

## Category
`Logic Errors`

## Current Behaviour
At the end of `threeWayMerge()` (line 169–172 of `lib/sketchgit/git/mergeEngine.ts`), when no object-level conflicts are found, the function builds the merged canvas as:

```typescript
const baseParsed = JSON.parse(baseData) as Record<string, unknown>;
baseParsed.objects = resultObjects;
return { result: JSON.stringify(baseParsed), autoMerged: true };
```

`baseParsed` is the **common ancestor** canvas snapshot.  Only the `objects` array is replaced with the merged object list.  All other top-level properties of the Fabric.js canvas JSON (for example `backgroundColor`, `backgroundImage`, `backgroundVpt`, `version`) retain the **ancestor's** values.

If the user on "our" branch changed the canvas background colour (or any other canvas-level setting) since the divergence point, that change is lost in the merged result.  The background silently reverts to the ancestor colour with no warning or conflict indicator.

## Expected Behaviour
The merged canvas envelope should be built from `oursData` (the current branch HEAD), not from `baseData`, so that canvas-level changes made on "our" branch are preserved.  The 3-way merge should only overwrite canvas-level properties if "theirs" also changed them (true conflict at the canvas level) or if only "theirs" changed them (fast-forward theirs into ours).  Object-level merge correctness is unaffected.

## Steps to Reproduce
1. Create a base commit with a dark background (`backgroundColor: "#0a0a0f"`).
2. Create branch `feature` from `main`; on `main`, change the canvas background to white and commit.
3. On `feature`, add a new shape and commit (do not change background).
4. Switch to `main` and merge `feature` into `main`.
5. Observe that the merged canvas reverts to `"#0a0a0f"` (the ancestor value) — the white background set in step 2 is gone.

## Affected Files and Sections

| File | Lines / Symbol | Notes |
|------|---------------|-------|
| `lib/sketchgit/git/mergeEngine.ts` | L169–L172 / `threeWayMerge()` | `baseParsed` should be `oursParsed` |

## Root Cause Analysis
The clean-merge code path was written to reuse the ancestor canvas as the structural template for the merged result, then replace its `objects` array with the merged object list.  This is correct for `objects` but incorrect for top-level canvas metadata: those properties should come from `oursData` (the branch we are merging into), not from `baseData`.  The three-way merge logic for individual objects correctly distinguishes "ours", "theirs", and "base", but no equivalent logic exists for canvas-level properties outside the `objects` array.

## Suggested Fix
Replace `JSON.parse(baseData)` with `JSON.parse(oursData)` on line 169 so the canvas envelope (all properties except `objects`) comes from "ours".  This preserves our canvas-level changes and correctly inherits any canvas-level changes exclusive to "theirs" only if a property-level 3-way merge for top-level fields is also implemented; at minimum, using `oursParsed` as the base prevents silent reversion of "our" changes.

For a complete fix, apply the same 3-way property merge logic used for individual objects to the top-level canvas properties: take "theirs" value when only "theirs" changed it since the ancestor, keep "ours" value when only "ours" changed it, and raise a conflict when both sides changed the same property to different values.

## Additional Notes
Properties tracked in `MERGE_PROPS` are object-level only; no canvas-level properties are currently tracked.  The most commonly affected property in practice is `backgroundColor` (set when a user chooses a canvas background colour via the settings modal).  The conflict modal (`conflictModal`) has no mechanism to display canvas-level conflicts, so a full fix should either extend the conflict UI or adopt a simpler "ours always wins for canvas-level props" policy.

## Status
`open`
