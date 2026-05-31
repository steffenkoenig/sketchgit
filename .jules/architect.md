
## Refactor Target
Implementation of Grouping and Alignment tools inside `canvasEngine.ts` and integration with the git `mergeEngine.ts` system via `objectIdTracker.ts`.

## Identified Structural Flaw
Previously, objects had to be handled individually, causing complex diagrams to fragment easily. Additionally, parsing of recursive nested Fabric.js group objects in the `objectIdTracker` was susceptible to call stack overflow or DoS vulnerabilities.

## Impact on Maintainability
Adding the MAX_DEPTH boundary check limits the potential memory load of deep merges, keeping the merge loop bounded and stable during multi-user simultaneous edits. Alignment and grouping abstract the individual transform updates into a singular batch object creation/deletion action.

## The Clean Architecture Blueprint
1. Utilize native Fabric.js `ActiveSelection` and `Group` classes via `groupObjects` and `ungroupObjects`.
2. Wrap modifications inside `pushHistory()` to preserve git tracking bounds.
3. Update `objectIdTracker.ts` methods (`buildObjMap`, `extractProps`) to recursively extract group children state while terminating recursion properly at `MAX_DEPTH = 10`.

## Verification & Refactor Logic
Added coverage to `canvasEngine.test.ts` for ensuring `ActiveSelection` correctly maps interactions to the internal `Group` element API. Integrated nested validation limit testing in `objectIdTracker.test.ts` to verify `MAX_DEPTH` boundaries behave as intended and accurately cap serialized strings.
