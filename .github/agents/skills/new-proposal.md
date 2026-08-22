# Skill: New Proposal

## Purpose
Create a new optimization/feature proposal document in `reports/proposals/`
and register it in `reports/proposals_summary.md`, following the repo's
current proposal template exactly.

## When to Use
The request is to propose a new piece of work — e.g. "Create a proposal for
adding two-factor authentication" — as opposed to implementing something that
already has a proposal or bug report.

## Step 1 — Determine the Next Proposal ID
List `reports/proposals/*.md` and `reports/proposals/done/*.md`, extract every
`P<NNN>` prefix, and use one greater than the highest number found across
*both* directories. Proposal IDs are a single global sequence — do not reuse
a number just because a gap exists (a few historical duplicates exist from
past mistakes; don't add to them). Note: this codebase's structural convention
is one proposal per number, but a handful of legacy duplicates exist (e.g. two
different proposals both titled "P091" for unrelated features) — treat that as
a known wart to avoid repeating, not a pattern to follow.

## Step 2 — Write the Proposal File

Use the **current template** — verified against the five most recently added
proposals (`P092` through `P096`), all of which use this exact structure
(older proposals like `P001`-`P091` use a different, longer template; do not
copy those — the shorter template below is what's current):

```markdown
# P0NN – <Short, Specific Title>

## Goal
One or two sentences: what capability does this add, for whom.

## Problem
What's missing today and why it matters. Reference specific files/behavior
where relevant (e.g. "there is no `RoomPassword` field on the `Room` model").

## Proposed Changes
Numbered list of concrete changes — files touched, new models/endpoints/UI,
at the level of detail a developer could start from without re-deriving the
design. This is the section that actually gets implemented; keep it specific.

## Future Press Release
A short (3-6 sentence) "as if this shipped" announcement, written for an end
user, not a developer. This is a working-backwards forcing function — if you
can't write an honest, appealing press release for the feature, the scope or
value proposition probably needs rethinking before implementation starts.

## Definitions of Done

### Implementation
Bullet list of what must exist in code for this to be considered built.

### Testing
What test coverage is required — unit, integration, E2E — specific to this
feature's risk areas.

### Documentation
What user-facing or developer-facing docs need updating (README, in-app copy,
API docs).

### Security
Specific security considerations for this feature — auth checks, input
validation, injection risks, secrets handling. Not a generic checklist; name
the actual risks this feature introduces.

### Reliability
Failure modes and how they're handled — what happens on partial failure,
network loss, concurrent edits, etc.

### Accessibility
Specific ARIA/keyboard/screen-reader requirements if the feature has a UI
surface. State "N/A — no UI surface" explicitly if genuinely not applicable.

### GDPR compliance
Whether this feature processes personal data, and if so, what's required
(data minimization, export/deletion inclusion, consent). State "N/A" only if
genuinely no personal data is touched.
```

## Step 3 — Register in `reports/proposals_summary.md`

Add a row to the **"Proposals – Not Started"** table:
```markdown
| P0NN | <Title> | <Dimension(s), e.g. "Security, UX"> | [P0NN](proposals/P0NN_<slug>.md) |
```

Optionally (recommended for non-trivial proposals): add an entry to the
**"Dependency Map"** table noting which completed proposals this one builds
on, and a line under **"Recommended Implementation Order"** if there's an
obvious place in the existing sequence — but don't force either if the new
proposal is genuinely independent.

## Output Checklist
- [ ] Next available `P0NN` ID determined by scanning both
      `reports/proposals/` and `reports/proposals/done/`.
- [ ] `reports/proposals/P0NN_<kebab-case-slug>.md` created using the current
      (short) template — not the older long-form template.
- [ ] Row added to the "Not Started" table in `reports/proposals_summary.md`.
- [ ] Filename slug matches the title closely enough to be findable by grep.
