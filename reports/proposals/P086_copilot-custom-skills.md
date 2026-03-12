# P086 – GitHub Copilot Custom Skills for SketchGit

## Status
Not Started

## Dimensions
Maintainability · Developer Experience

## Problem

Proposal P063 established Copilot Workspace configuration and custom instructions
(`.github/copilot-instructions.md`). These instructions describe the project's
conventions so that Copilot Chat and the Coding Agent follow them. However,
instructions are **passive** — they inform Copilot about conventions but do not
**automate** repetitive scaffolding tasks.

Developers on the project currently need to manually:
- Write boilerplate for new API route handlers (auth check, Zod parse, repository call,
  typed response, error handling — 30+ lines of structural code per endpoint).
- Write new WebSocket message type definitions across three files
  (`wsSchemas.ts`, `types.ts`, `server.ts`).
- Write factory functions in `lib/test/factories.ts` for new Prisma models.
- Add new environment variables across four files (`lib/env.ts`, `lib/env.test.ts`,
  `.env.example`, documentation).
- Create new proposal documents for the `reports/proposals/` directory with the
  required structure.

Each of these tasks is well-defined, repetitive, and error-prone (forgetting to update
one file is a common cause of CI failures).

## Proposed Solution

Create **GitHub Copilot Custom Skills** — declarative YAML skill definitions stored
in `.github/copilot/skills/` — that the Coding Agent can invoke to scaffold the
above patterns automatically.

### Skills to implement

#### Skill 1: `new-api-route`

**Prompt**: "Add a POST handler to /api/rooms/[roomId]/tags"

**Produces**:
- `app/api/rooms/[roomId]/tags/route.ts` with full boilerplate (auth, Zod schema,
  validate(), apiError(), NextResponse.json()).
- `app/api/rooms/[roomId]/tags/route.test.ts` with mocked auth and Prisma, covering
  400/401/403/201 cases.
- Exports the Zod schema as a named constant (required for P062 OpenAPI generation).

#### Skill 2: `new-ws-message-type`

**Prompt**: "Add a new WebSocket message type 'canvas-resize'"

**Produces**:
- A new Zod schema in `lib/api/wsSchemas.ts`.
- A new type string in `WsMessageType` union in `lib/sketchgit/types.ts`.
- A stub handler in `server.ts` inside the `wss.on('connection')` message handler.
- A test case in `lib/api/wsSchemas.test.ts`.

#### Skill 3: `new-factory`

**Prompt**: "Add a factory for the RoomInvitation model"

**Produces**:
- A `makeRoomInvitation()` factory function in `lib/test/factories.ts` using
  the factory conventions established by P077.
- A test case in `lib/test/factories.test.ts`.

#### Skill 4: `new-env-var`

**Prompt**: "Add a new optional env var CANVAS_MAX_OBJECTS with default 1000"

**Produces**:
- A Zod field in `EnvSchema` in `lib/env.ts` with the correct type and default.
- A test case in `lib/env.test.ts` for the default value and custom value.
- A commented-out example in `.env.example`.
- A row in the env vars table in `README.md`.

#### Skill 5: `new-proposal`

**Prompt**: "Create a new proposal for adding two-factor authentication"

**Produces**:
- A new `reports/proposals/P0NN_<slug>.md` with the next available proposal ID,
  using the full required structure (Status, Dimensions, Problem, Proposed Solution,
  Code Structure, Type Requirements, Linting, Test Requirements, Database/Data Impact,
  Repository Structure, GitHub Copilot Agents and Skills, Implementation Order,
  Effort Estimate, Dependencies).
- A new row in the "Not Started" table in `reports/proposals_summary.md`.

### Skill definition format

Each skill is a YAML file in `.github/copilot/skills/`:

```yaml
# .github/copilot/skills/new-api-route.yaml
name: new-api-route
description: Scaffold a new Next.js API route handler following SketchGit conventions
instructions: |
  Follow the API route pattern in .github/copilot-instructions.md exactly.
  Export the Zod schema as a named constant.
  Write a companion test file covering 400/401/403 and success cases.
  Use apiError() from lib/api/errors.ts for all error responses.
  Use validate() from lib/api/validate.ts for body parsing.
parameters:
  - name: routePath
    description: The route path relative to app/api/ (e.g. rooms/[roomId]/tags)
  - name: method
    description: HTTP method (GET, POST, PATCH, DELETE)
  - name: requiresAuth
    description: Whether the route requires authentication (true/false)
```

### Skill discovery

Add a `skills` section to `.github/copilot-instructions.md` listing all available
skills with one-line descriptions, so Copilot Chat surfaces them when a developer
asks "what can you automate in this repo?".

## Code Structure

```
.github/
  copilot/
    skills/
      new-api-route.yaml
      new-ws-message-type.yaml
      new-factory.yaml
      new-env-var.yaml
      new-proposal.yaml
  copilot-instructions.md    ← updated with skills section
```

## Type Requirements

Skill YAML files have no TypeScript types. They are pure configuration.
The templates referenced in skill instructions must be kept in sync with the actual
source patterns — this is the primary maintenance burden.

## Linting Requirements

Add `.github/copilot/skills/*.yaml` to the ESLint `ignorePatterns` list.

## Test Requirements

Skills are validated manually by:
1. Invoking each skill via Copilot Chat in a scratch branch.
2. Verifying that the generated files pass `npm run lint`, `npx tsc --noEmit`, and
   `npm test`.
3. Committing the test of the skill itself as a PR to the repo.

There is no automated test runner for skill YAML files at this time.

## Database / Data Impact

No database changes.

## Repository Structure

- New `.github/copilot/skills/` directory with five YAML files.
- Update `.github/copilot-instructions.md` with a skills inventory section.

## GitHub Copilot Agents and Skills

This proposal **is** about Copilot skills, so the "GitHub Copilot" section applies
recursively: the `new-proposal` skill can generate future skill proposals using the
template established here.

## Implementation Order

1. Create `.github/copilot/skills/` directory.
2. Write `new-api-route.yaml` (highest ROI — most frequently needed).
3. Write `new-ws-message-type.yaml`.
4. Write `new-factory.yaml`.
5. Write `new-env-var.yaml`.
6. Write `new-proposal.yaml`.
7. Update `.github/copilot-instructions.md` with the skills section.
8. Validate each skill manually in a scratch branch.

## Effort Estimate
Small (1 day). Each skill YAML is concise. The main work is writing clear, precise
instruction text that reliably produces conformant output.

## Dependencies
- P063 ✅ (Copilot workspace configuration — `.github/copilot-instructions.md` already
  exists as the source of truth for conventions)
- P014 ✅ (Zod validation — `new-api-route` skill relies on `validate()`)
- P068 ✅ (error codes — `new-api-route` skill relies on `apiError()`)
- P077 ✅ (test factories — `new-factory` skill extends the established pattern)
- P062 ✅ (OpenAPI — `new-api-route` skill exports named Zod schema for OpenAPI)
