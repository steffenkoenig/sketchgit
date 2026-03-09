# P005 – Enable TypeScript Strict Mode

## Title
Enable TypeScript Strict Mode and Remove `@ts-nocheck`

## Brief Summary
The core application file (`createSketchGitApp.ts`) suppresses all TypeScript checks with a `// @ts-nocheck` directive, and the project-wide TypeScript configuration has `strict: false`. This nullifies the primary benefit of using TypeScript—catching type errors at compile time—and makes refactoring unsafe. Progressively enabling strict TypeScript will surface latent bugs, improve IDE tooling, and make the codebase significantly safer to change.

## Current Situation
- `lib/sketchgit/createSketchGitApp.ts` begins with `// @ts-nocheck`. TypeScript does not analyse this file at all.
- `tsconfig.json` has `"strict": false`, which disables the following checks globally:
  - `strictNullChecks` – `null` and `undefined` assignable to any type
  - `noImplicitAny` – parameters without types default to `any`
  - `strictFunctionTypes` – unsafe function parameter variance allowed
  - `strictPropertyInitialization` – class properties may be used before being set
  - And several other checks
- `next.config.mjs` has `reactStrictMode: false`, which disables React's double-render warnings designed to surface side effects and non-idempotent lifecycle code.
- The rest of the codebase (React components, types file) uses TypeScript syntax but does not benefit from strict checking because the compiler is configured permissively.

## Problem with Current Situation
- **False confidence**: TypeScript is present but provides no safety net in the most complex part of the code.
- **Hidden bugs**: Without `strictNullChecks`, any variable can silently be `null` or `undefined` at runtime without a compile-time error.
- **Poor IDE experience**: Without type information in the main engine file, auto-complete, go-to-definition, find-all-references, and rename-symbol do not work reliably.
- **Risky refactoring**: Renaming a property or changing a function signature has no compiler-enforced impact analysis.
- **`any` proliferation**: Without `noImplicitAny`, untyped parameters default to `any`, which spreads across callers and defeats the type system entirely.
- **Inconsistency**: Types are defined in `components/sketchgit/types.ts` but the main engine file never references them, making the type definitions effectively unused in the largest file.

## Goal to Achieve
1. Remove `// @ts-nocheck` from `createSketchGitApp.ts`.
2. Enable `"strict": true` in `tsconfig.json`.
3. Ensure the project compiles without type errors under strict mode.
4. Re-enable `reactStrictMode: true` in `next.config.mjs`.
5. Establish that type errors will block the build, preventing regressions.

## What Needs to Be Done

### 1. Audit the existing types
Review `components/sketchgit/types.ts` for existing type definitions and move/extend them to `lib/sketchgit/types.ts` (created as part of P001). Consolidate into a single source of truth.

### 2. Create explicit interfaces for core data structures
Define strongly-typed interfaces for all major data objects:

| Interface | Fields |
|-----------|--------|
| `Commit` | `sha`, `message`, `parentSha`, `canvasJson`, `timestamp`, `branch` |
| `Branch` | `name`, `headSha` |
| `GitState` | `commits: Map<string, Commit>`, `branches: Map<string, Branch>`, `head: string \| null`, `detached: boolean` |
| `CanvasSnapshot` | `objects: FabricObjectJSON[]`, `background: string` |
| `ObjectDiff` | `id`, `prop`, `base`, `ours`, `theirs` |
| `Conflict` | `objectId`, `diffs: ObjectDiff[]` |
| `MergeResult` | `merged: CanvasSnapshot`, `conflicts: Conflict[]` |
| `PeerMessage` | Discriminated union of all WebSocket message types |

### 3. Remove `@ts-nocheck` and fix errors incrementally
After P001 extracts the engine into modules, work through each module:
1. Remove `@ts-nocheck` (or don't add it in the first place when creating new files).
2. Enable `strict: true` in `tsconfig.json`.
3. Fix each compiler error.

Common error categories expected:
- `Object is possibly 'null' or 'undefined'` → add null checks or non-null assertions where provably safe.
- `Parameter 'x' implicitly has an 'any' type` → add explicit type annotations.
- `Property 'x' does not exist on type 'y'` → fix property access or narrow the type.
- `Type 'x' is not assignable to type 'y'` → correct type mismatch or use a type assertion with justification.

### 4. Type Fabric.js objects
Fabric.js objects currently flow through the code as untyped or `any`. Either:
- Use the `fabric` npm package's built-in TypeScript declarations, or
- Define a minimal local interface for the Fabric.js object shape used by the merge engine (`{ _id?, type, left, top, width, height, stroke, fill, ... }`).

**Note**: Since Fabric.js is loaded from CDN (not via npm), its type declarations must be installed separately: `npm install --save-dev @types/fabric` or the Fabric.js 6.x npm package which includes types.

### 5. Re-enable React Strict Mode
Set `reactStrictMode: true` in `next.config.mjs`. This may reveal side-effectful code in `useEffect` or in component initialization (most likely in `SketchGitApp.tsx` where the engine is instantiated). Fix identified issues.

### 6. Add type checking to CI
Ensure `npm run build` (which already runs `tsc`) fails the CI pipeline on type errors. Optionally add `tsc --noEmit` as a separate CI step for faster feedback without a full build.

## What Components Are Affected
| Component | Impact |
|-----------|--------|
| `tsconfig.json` | Enable `"strict": true` |
| `next.config.mjs` | Enable `reactStrictMode: true` |
| `lib/sketchgit/createSketchGitApp.ts` | Remove `@ts-nocheck`; fix all type errors |
| `components/sketchgit/types.ts` | Expand and consolidate type definitions |
| `lib/sketchgit/` (new modules from P001) | Write with types from the start |
| `package.json` | Add `@types/fabric` or `fabric` (for types) as a dev dependency |

## Additional Considerations

### Progressive adoption strategy
If enabling `strict: true` globally produces too many errors to fix at once, use TypeScript's per-file `// @ts-strict-ignore` comment as a temporary suppression (note: this is distinct from `@ts-nocheck`—it still type-checks the file, just without strict mode). Aim to remove all suppressions within 2–4 weeks.

Alternatively, a `tsconfig.strict.json` extending the base config can be used to run strict checks only on new files until existing files are migrated.

### Interaction with P001
P001 (module decomposition) is the ideal time to introduce types because new files can be written with types from the start. P005 should be implemented in parallel with or immediately after P001.

### Expected errors
Based on the code analysis, the most likely categories of strict-mode errors in the main engine are:
- ~30–50 implicit `any` parameters in the drawing tool handlers and event listeners.
- ~10–20 potential `null` dereferences on canvas objects and commit lookups.
- ~5–10 type mismatches between Fabric.js object properties and internal merge types.

This is a manageable workload, especially when distributed across the module extraction work of P001.
