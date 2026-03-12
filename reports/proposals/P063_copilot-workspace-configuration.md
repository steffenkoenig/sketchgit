# P063 – GitHub Copilot Workspace Configuration

## Title
Add a `.github/copilot-instructions.md` File and GitHub Copilot Custom Instructions to Accelerate AI-Assisted Development Consistent with Project Conventions

## Brief Summary
GitHub Copilot supports repository-level custom instructions via `.github/copilot-instructions.md`. This file is automatically injected as context into every Copilot Chat conversation within the repository, guiding the AI to generate code that matches the project's conventions—TypeScript strict mode, Zod validation, Prisma patterns, Pino logging, and the existing module decomposition. Without it, Copilot generates generic code that requires significant manual cleanup to align with established patterns.

## Current Situation
The repository has no `.github/copilot-instructions.md` file. When developers use GitHub Copilot Chat or the Copilot Coding Agent to add new features (e.g., "add a new API endpoint" or "add a new WebSocket message type"), Copilot:
- May generate `console.log()` instead of `logger.info()` (P010, P036).
- May write Zod schemas inline in route handlers instead of exporting them as named constants (P014, P062).
- May create interactive Prisma transactions (`$transaction(async (tx) => …)`) that are incompatible with PgBouncer transaction-mode pooling (P060).
- May miss the `validate()` helper from `lib/api/validate.ts` and write manual error handling.
- May place new server-side utilities in `lib/` without following the `lib/sketchgit/` vs `lib/server/` vs `lib/db/` module boundaries.
- May generate `useEffect` without cleanup functions, missing P020's resource cleanup pattern.

### Relevant files
```
.github/                    ← only contains dependabot.yml and workflows/
lib/api/validate.ts         ← shared validation helper (not in Copilot's default context)
lib/sketchgit/logger.ts     ← structured logger (Copilot defaults to console.*)
eslint.config.mjs           ← ESLint rules including no-floating-promises (P042)
```

## Problem with Current Situation
1. **Convention drift in AI-generated code**: Copilot generates idiomatic TypeScript but does not know about project-specific conventions such as "always use `logger` from `lib/sketchgit/logger.ts`" or "WebSocket schemas live in `lib/api/wsSchemas.ts`".
2. **Redundant review cycles**: Reviewers spend time correcting AI-generated code that violates project conventions instead of reviewing logic. This reduces the productivity benefit of AI assistance.
3. **Inconsistent error handling patterns**: The project uses `validate()` from `lib/api/validate.ts` to return standardized 422 responses. Copilot-generated route handlers typically use ad-hoc error handling.
4. **Security pattern gaps**: Copilot may generate auth checks without the `getAuthSession()` helper from `lib/authTypes.ts`, or may miss the nonce-based CSP pattern.
5. **No agent skill files**: The repository does not define any `.github/agents/` skill files that would allow GitHub Copilot Coding Agent to execute targeted tasks (e.g., "add a new API endpoint following the project's route template").

## Goal to Achieve
1. Create `.github/copilot-instructions.md` with repository-level instructions covering:
   - Module structure and where to place new files.
   - Logging conventions (always use `logger`, never `console.*` in `lib/sketchgit/**`).
   - Validation pattern (export Zod schemas as named constants; use `validate()` helper).
   - Database access patterns (use `lib/db/roomRepository.ts` functions; batch Prisma transactions).
   - Auth pattern (use `getAuthSession()` from `lib/authTypes.ts`).
   - React patterns (cleanup in `useEffect`, no floating promises, `useCallback` for stable references).
   - Testing conventions (Vitest, `lib/**/*.test.ts` pattern, mock Prisma with `vi.mock`).
2. Document GitHub Copilot workspace configuration in the repository README.

## What Needs to Be Done

### 1. Create `.github/copilot-instructions.md`
The file content should cover the following sections:

#### Architecture Overview
- The application is a Next.js 16 app with a custom WebSocket server (`server.ts`).
- `proxy.ts` replaces `middleware.ts` (Next.js 16 limitation); all middleware logic lives there.
- Client-side canvas engine: `lib/sketchgit/` (browser code, uses Fabric.js).
- Server-side: `lib/db/` (Prisma), `lib/server/` (utilities), `lib/api/` (Zod schemas, validation helper).
- Auth: NextAuth v5, anonymous-first. Use `getAuthSession(session)` from `lib/authTypes.ts`.

#### Logging
- In `lib/sketchgit/**/*.ts`: use `logger` from `lib/sketchgit/logger.ts`. Never use `console.*` directly (ESLint enforces this).
- In server-side files (`server.ts`, `lib/db/**`, `app/api/**`): use `pino` logger imported from the shared instance.
- Never use `console.log()` in production code; `console.error()` is allowed only in `logger.ts` itself.

#### Validation Pattern for API Routes
```typescript
// Export the Zod schema as a named constant (for OpenAPI generation, P062)
export const MySchema = z.object({ … });

export async function POST(req: NextRequest) {
  const session = await auth();
  const authSession = getAuthSession(session);
  if (!authSession) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body: unknown = await req.json().catch(() => null);
  if (body === null) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const v = validate(MySchema, body);
  if (!v.success) return v.response;

  // … business logic using v.data
}
```

#### Database Access Pattern
- Use `lib/db/roomRepository.ts` or `lib/db/userRepository.ts` functions; do not write raw Prisma queries in route handlers.
- All multi-table writes must use Prisma batch transactions (`prisma.$transaction([…])` array form).
- **Do not use interactive transactions** (`$transaction(async (tx) => …)`) — incompatible with PgBouncer transaction-mode pooling (P060).
- Never import `prisma` directly in a route handler; always call repository functions.

#### Testing Conventions
- Test files: `lib/**/*.test.ts` or `app/api/**/*.test.ts`.
- Test framework: Vitest.
- Mock Prisma client: `vi.mock('@/lib/db/prisma', () => ({ prisma: { … } }))`.
- Tests must not require a real database; use in-memory mocks.
- Coverage thresholds: 70% lines, functions, statements; 69% branches (see `vitest.config.ts`).

#### WebSocket Message Handling
- New WebSocket message types must have a corresponding Zod schema in `lib/api/wsSchemas.ts`.
- All message handlers in `server.ts` must validate the incoming payload before any DB operation.

#### React Conventions
- Always return a cleanup function from `useEffect` if the effect creates timers, event listeners, or WebSocket connections.
- Wrap callbacks passed to child components in `useCallback` with an explicit dependency array.
- Avoid floating promises: `useEffect(() => { void asyncFn(); return () => {} }, [])`.
- Use `useTranslations()` from `next-intl` for all user-visible strings.

### 2. Create `.github/agents/add-api-endpoint.md` (Copilot Agent skill)
A skill file that gives Copilot Coding Agent a template for adding a new API endpoint:
```markdown
# Skill: Add a new REST API endpoint

1. Create `app/api/<resource>/route.ts`.
2. Export the Zod request schema as a named constant.
3. Follow the validation pattern from `.github/copilot-instructions.md`.
4. Create `app/api/<resource>/route.test.ts` with Vitest unit tests.
5. Add the endpoint to `lib/api/openapi.ts` (P062).
```

### 3. Update `README.md`
Add a "GitHub Copilot Integration" section explaining:
- How to use Copilot Chat within the repository (it automatically reads `.github/copilot-instructions.md`).
- How to invoke the Copilot Coding Agent for specific tasks.
- Pointer to the agent skill files in `.github/agents/`.

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `.github/copilot-instructions.md` | New file: repository-level Copilot instructions |
| `.github/agents/add-api-endpoint.md` | New file: Copilot Coding Agent skill |
| `README.md` | Add "GitHub Copilot Integration" section |

## Additional Considerations

### Keeping instructions up to date
The `.github/copilot-instructions.md` file should be treated as living documentation. When a new convention is established (e.g., if P065 replaces bcrypt with argon2), the instructions should be updated in the same PR as the code change.

### Privacy
The `copilot-instructions.md` file is committed to the public repository. It should not contain secrets, API keys, or internal infrastructure details. It should only describe coding conventions.

### Scope of effect
Repository-level Copilot instructions apply to all Copilot Chat conversations within the repository context (IDE extensions, GitHub.com Chat, and the Coding Agent). They do not affect Copilot autocomplete suggestions (inline code completions).

### GitHub Copilot agent `.github/agents/` directory
Note: The `.github/agents/` directory is used by GitHub Copilot Coding Agent for skill files. These files must not be read or modified by other agents or automated processes. The instructions file (`.github/copilot-instructions.md`) is separate from the agents directory.

## Testing Requirements
- `.github/copilot-instructions.md` exists and is valid Markdown.
- No secrets or sensitive data are present in the file.
- The agent skill file (if created) is valid Markdown and references the correct file paths.
- A GitHub Copilot Chat conversation within the repository references the project-specific conventions when asked to add a new API endpoint.

## Dependency Map
- Builds on: All completed proposals (instructions document the patterns established in P001–P057)
- Complements: P062 (OpenAPI spec — instructions reference the schema export convention required by P062)
- Independent of: runtime behavior, database, Redis, auth
