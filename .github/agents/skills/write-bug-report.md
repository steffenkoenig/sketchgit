# Skill: Write Bug Report

## Purpose
Produce well-structured bug report Markdown files in `reports/bugs/` and maintain the consolidated `reports/bugs/bug_summary.md` file.

---

## Individual Bug Report

### File Naming
Each individual report is saved as:

```
reports/bugs/<BUG-ID>_<kebab-case-summary>.md
```

Examples:
- `reports/bugs/BUG-001_missing-null-check-in-branch-coordinator.md`
- `reports/bugs/BUG-002_floating-promise-in-ws-client-reconnect.md`

Use `create` to write the file if it does not exist. Use `edit` if the file already exists.

### Individual Report Template

```markdown
# <BUG-ID> – <Short Summary>

## Summary
<!-- One or two sentences describing the bug. -->

## Severity
`<critical | high | medium | low>`

## Category
`<one of the ten categories from the scan skill>`

## Current Behaviour
<!-- What actually happens today. Be specific: include the erroneous value,
     the wrong code path taken, or the observable symptom. -->

## Expected Behaviour
<!-- What should happen instead. -->

## Steps to Reproduce
1. <!-- First step -->
2. <!-- Second step -->
3. <!-- Observed result -->

## Affected Files and Sections

| File | Lines / Symbol | Notes |
|------|---------------|-------|
| `path/to/file.ts` | L42–L55 / `functionName()` | Brief note |

## Root Cause Analysis
<!-- Explain why the bug exists: wrong assumption, missing guard, copy-paste error, etc. -->

## Suggested Fix
<!-- High-level description of the fix. Do NOT write code. Reference the pattern or
     helper that should be used (e.g., "use the existing `safeBranchName()` helper",
     "add a null guard before the property access", "await the promise"). -->

## Additional Notes
<!-- Any edge cases, related code paths, or links to relevant proposals. -->

## Status
`open`
```

---

## Bug Summary File

### File Location
```
reports/bugs/bug_summary.md
```

### Behaviour
- If `bug_summary.md` does not exist, create it with the full template below.
- If it already exists, update it by appending new rows to the table and updating counts in the header.

### Summary File Template

```markdown
# Bug Summary

This document lists all bugs identified by the automated bug-scanner agent.

Last updated: <!-- ISO 8601 date, e.g. 2026-03-12 -->

---

## Statistics

| Severity | Count |
|----------|-------|
| critical | 0 |
| high     | 0 |
| medium   | 0 |
| low      | 0 |
| **Total** | **0** |

---

## Bug Registry

| Bug ID | Summary | Severity | Category | Status | Report |
|--------|---------|----------|----------|--------|--------|
<!-- One row per bug. Example row:
| BUG-001 | Missing null check in BranchCoordinator.checkout | high | Null / Undefined Safety | open | [report](BUG-001_missing-null-check-in-branch-coordinator.md) |
-->
```

### Status Values
A bug's status in the registry must be one of:

| Status | Meaning |
|--------|---------|
| `open` | Identified; no fix started |
| `in-progress` | A fix is actively being implemented |
| `fixed` | Fix merged to the main branch |
| `wont-fix` | Accepted risk or out of scope |
| `duplicate` | Covered by another bug report |

### Updating an Existing Summary
When adding new bugs to an existing `bug_summary.md`:
1. Append a new row for each bug to the **Bug Registry** table.
2. Increment the relevant **Statistics** counts.
3. Update the **Last updated** date to today's date.

---

## Workflow

1. After confirming each individual bug via the **scan-codebase-for-bugs** skill, call this skill once per bug to write the individual report file.
2. After all individual reports are written, call this skill once more to create or update `bug_summary.md` with all discovered bugs.
