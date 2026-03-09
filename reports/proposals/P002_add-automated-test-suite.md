# P002 – Add an Automated Test Suite

## Title
Add an Automated Test Suite

## Brief Summary
The application currently has zero automated tests of any kind. This means the most complex and critical logic—the 3-way merge engine and the Git graph model—is completely unvalidated, making regressions invisible and safe refactoring impossible. Introducing a layered test suite (unit → integration → end-to-end) will protect existing behaviour and enable confident changes going forward.

## Current Situation
There are no test files anywhere in the repository. The `package.json` does not define a `test` script. No test runner, assertion library, or end-to-end framework is installed. The only validation that happens is manual, ad-hoc testing in the browser.

## Problem with Current Situation
- **Silent regressions**: Any code change can silently break the merge engine, Git graph traversal, or collaboration protocol with no automated signal.
- **Blocked refactoring**: P001 (module decomposition) and other improvements require a safety net. Without tests, large-scale refactoring is high-risk.
- **Algorithm distrust**: The 3-way merge is the highest-value feature. Its correctness currently relies entirely on the developer's mental model.
- **No contract for collaboration messages**: The WebSocket message schema can drift without notice.
- **Developer confidence**: New contributors are afraid to change code they do not fully understand when there is no test coverage to catch mistakes.

## Goal to Achieve
Establish a comprehensive, automated test suite that:
1. Covers the core business logic (merge engine, Git model) with unit tests.
2. Validates interaction between subsystems with integration tests.
3. Catches UI and collaboration regressions with end-to-end tests.
4. Runs automatically in CI on every pull request.

## What Needs to Be Done

### 1. Choose and configure a test runner
**Recommended: Vitest**
- Zero-config with Vite/Next.js projects.
- Compatible with TypeScript out of the box.
- Fast watch mode and inline coverage reports.
- Drop-in Jest-compatible API.

Alternatively, Jest with `ts-jest` if Vitest is not preferred.

### 2. Unit tests for the merge engine (`mergeEngine.ts` after P001)
These are the highest-priority tests because the merge algorithm is the most complex and most critical piece of logic.

Key scenarios to cover:
| Test Case | Description |
|-----------|-------------|
| Fast-forward merge | No divergence; result equals theirs |
| Identical edits | Both branches make same change; auto-merge |
| Non-overlapping edits | Each branch changes different properties; auto-merge |
| Conflicting edits | Same property changed differently; returns conflict list |
| Object added on one branch | New object present in result |
| Object deleted on one branch | Deleted object absent from result |
| Object added on both branches | Detected as conflict or auto-merged by ID |
| LCA found correctly | `findLCA()` traverses graph and returns correct base commit |
| Circular graph guard | `findLCA()` does not loop infinitely on malformed graphs |

### 3. Unit tests for the Git model (`gitModel.ts` after P001)
| Test Case | Description |
|-----------|-------------|
| Initial commit | Creates first commit, sets HEAD |
| Second commit | Appends to parent chain |
| Create branch | New branch points at current commit |
| Checkout branch | HEAD moves, detached state cleared |
| Checkout commit (detached) | HEAD detached flag set correctly |
| Rollback | Branch pointer rewound to target commit |
| Invalid operations | Committing in detached state returns/throws expected error |

### 4. Unit tests for object ID tracking (`objectIdTracker.ts` after P001)
| Test Case | Description |
|-----------|-------------|
| New object gets `_id` | Stable UUID assigned once |
| Existing `_id` preserved | Repeated calls do not regenerate ID |
| `buildObjMap()` | Returns correct id→object map |

### 5. Integration tests
Test that committing a canvas state, checking out a branch, making changes, and merging produces the correct merged canvas state end-to-end (without a real browser or Fabric.js—mock the canvas layer).

### 6. End-to-end tests (optional but recommended)
**Recommended: Playwright**
- Automates a real browser, matching the actual user experience.
- Tests keyboard shortcuts, canvas interactions, modal flows, and collaboration.

Key e2e scenarios:
- Draw a shape, commit, create a branch, draw another shape, merge back.
- Conflict resolution modal: choose "ours" and verify result.
- WebSocket collaboration: two browser instances in same room see each other's changes.

### 7. Configure CI
Add a GitHub Actions workflow (`.github/workflows/test.yml`) to run unit and integration tests on every push and pull request.

### 8. Coverage reporting
Configure Vitest's built-in V8 coverage reporter and set a minimum threshold (e.g., 70% for the `lib/` directory) to prevent coverage regressions.

## What Components Are Affected
| Component | Impact |
|-----------|--------|
| `package.json` | Add Vitest (and optionally Playwright) as dev dependencies; add `test` and `test:coverage` scripts |
| `vitest.config.ts` | New configuration file |
| `lib/sketchgit/` | Each extracted module (from P001) gets a co-located `.test.ts` file |
| `.github/workflows/` | New CI workflow file |
| `tsconfig.json` | Possibly extend with a `tsconfig.test.json` for test-specific settings |

## Additional Considerations

### Dependency on P001
The unit tests are far easier to write against the extracted modules from P001 than against the current monolithic factory. It is strongly recommended to implement P001 before this proposal, or at minimum to extract the merge engine and Git model first.

### Test data fixtures
Create a small set of shared JSON fixtures representing canvas states (simple shape lists) to use across multiple test cases, keeping tests DRY.

### Mocking Fabric.js
Fabric.js is a DOM-dependent library. Tests for the merge and Git layers must not depend on it. After P001, the merge engine and Git model will have no Fabric.js dependency, making them natively unit-testable in a Node.js environment.

### Expected timeline impact
Bootstrapping the test infrastructure and writing the first round of unit tests will likely take 2–4 days of focused effort. The long-term benefit is that any subsequent change (including P001, P003, etc.) can be validated automatically in seconds.
