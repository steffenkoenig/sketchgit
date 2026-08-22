# Skill: New Environment Variable

## Purpose
Add a new environment variable end-to-end: Zod schema, test coverage,
`.env.example` documentation, and the README reference table. Missing one of
these four locations is the single most common cause of "works locally, fails
in CI/prod" bugs in this repo — env vars are validated fail-fast at startup
(`lib/env.ts`'s `validateEnv()`), so an undocumented required var breaks
deployment, and an unvalidated optional var silently does nothing.

## When to Use
The request is to add a new configuration knob — e.g. "Add a new optional env
var `CANVAS_MAX_OBJECTS` with default 1000".

## Required Inputs
- Variable name (SCREAMING_SNAKE_CASE).
- Type (string, number, boolean, URL, enum).
- Required or optional; if optional, the default value.
- One-sentence description of what it controls.

## The Four Places to Update

### 1. `lib/env.ts` — the Zod schema (source of truth)
Add the field to `EnvSchema`, grouped near related vars with a `// ── <Feature
name> (P0NN) ──` section comment if it's part of a specific feature (follow
the existing pattern — every current field is grouped this way). Use
`.coerce.number()` for numeric env vars (all env vars arrive as strings),
`.enum([...])` for closed sets, `.string().url()` for URLs, and always set
`.default(...)` for optional vars so `Env` (the inferred type) never has an
`| undefined` a caller has to guard against unnecessarily.

```typescript
// ── <Feature> (P0NN) ────────────────────────────────────────────────────
CANVAS_MAX_OBJECTS: z.coerce.number().int().positive().default(1000),
```

### 2. `lib/env.test.ts` — test coverage
Add assertions (or extend an existing `describe` block) covering:
- The default value is used when the env var is unset.
- A custom value is parsed and coerced to the correct type.
- If required, validation fails without it (`safeParse` returns `success:
  false` or `validateEnv()` calls `process.exit(1)` — check how the existing
  required vars are tested for the exact pattern).

### 3. `.env.example` — commented documentation
Add a commented-out line (or an active one, if the var is required) with a
one-line comment above it explaining what it controls and its default. Group
it under an existing `# ─── <Feature> ───` header if one already covers this
area, or add a new one following the existing `# ─── Section Name
──────...──` divider style (see any existing section for the exact character
count/style to match).

### 4. `README.md` — the Environment Variables table
Add a row to the table under `## Environment Variables` (around line 211):
```markdown
| `CANVAS_MAX_OBJECTS` | — | Max objects per canvas before <effect> (default: 1000) |
```
Use `✅` in the Required column only for vars with no `.default()` in the Zod
schema (i.e. `lib/env.ts` would reject startup without them).

## Output Checklist
- [ ] Field added to `EnvSchema` in `lib/env.ts` with the correct Zod type.
- [ ] Test cases added/extended in `lib/env.test.ts`.
- [ ] Documented in `.env.example`.
- [ ] Row added to the table in `README.md`.
- [ ] `npx tsc --noEmit`, `npm run lint`, and `npm test` all pass.
- [ ] Grep the codebase for `process.env.<NAME>` to confirm nothing reads the
      raw env var directly, bypassing the validated `Env` type — reading from
      `validateEnv()`'s return value (or the module-level `env` it's usually
      assigned to) is the convention; a few pre-existing low-level modules
      (`lib/db/prisma.ts`, `lib/otelRegister.mjs`) read `process.env`
      directly because they must initialize before `validateEnv()` runs —
      only follow that exception if there's a genuine ordering constraint.
