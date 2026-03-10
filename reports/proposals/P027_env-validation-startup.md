# P027 – Environment Variable Validation on Startup

## Title
Fail Fast on Misconfiguration: Validate Required Environment Variables at Application Startup

## Brief Summary
The application silently starts without critical environment variables such as `DATABASE_URL` and `AUTH_SECRET`, falling back to degraded modes that fail only at the moment a user tries to save data or log in. These silent fallbacks obscure configuration errors during deployment and make debugging difficult. Adding a startup validation step that reads all required variables, checks their format, and exits immediately with a clear error message transforms configuration errors from mysterious runtime failures into obvious deployment-time problems.

## Current Situation
`server.mjs` uses optional chaining and conditional initialization for all critical dependencies:

```js
// server.mjs
let prisma = null;
if (process.env.DATABASE_URL) {
  prisma = new PrismaClient({ log: ['error'] });
} else {
  logger.warn(
    "DATABASE_URL is not set – running without persistence. " +
    "Commits and branches will not be saved."
  );
}
```

```js
// server.mjs – JWT auth check
async function verifySessionToken(token) {
  if (!process.env.AUTH_SECRET) return null;  // Silently ignores auth if secret missing
  // ...
}
```

Similarly, `lib/auth.ts` configures GitHub OAuth providers only if the environment variables are present:
```typescript
// lib/auth.ts
...(process.env.GITHUB_ID && process.env.GITHUB_SECRET ? [
  GitHub({ clientId: process.env.GITHUB_ID, clientSecret: process.env.GITHUB_SECRET }),
] : []),
```

While graceful fallbacks are reasonable for optional features (GitHub OAuth), they are dangerous for required features. An application running without `DATABASE_URL` will accept commits from users, display success toasts, but silently discard all data—the user's work is permanently lost without any error indication beyond a warning in server logs that the operator may never read.

## Problem with Current Situation
1. **Silent data loss**: A production deployment with an incorrectly set `DATABASE_URL` (wrong password, wrong hostname, or missing entirely) will accept user commits, show success UI, and lose all data because `prisma` is `null` and all DB writes are skipped silently.
2. **Hard to diagnose**: The warning `"DATABASE_URL is not set"` is logged at startup and then forgotten. If the operator does not read startup logs carefully, the misconfiguration is not discovered until users report lost data.
3. **Auth vulnerability**: If `AUTH_SECRET` is missing, `verifySessionToken()` returns `null` for all tokens. Depending on how authorization decisions are made downstream, this could either block all authenticated operations or, more dangerously, grant access because the null-check is handled inconsistently.
4. **Developer confusion**: New contributors who clone the repo and forget to copy `.env.example` to `.env` see the app start "successfully" but experience confusing behavior (commits seem to work but disappear on refresh, authentication never works).
5. **No format validation**: Even when `DATABASE_URL` is set, an invalid URL (e.g., `postgres://` with a missing password) will only fail when the first database query is executed, not at startup.

## Goal to Achieve
1. The application exits with a clear, actionable error message within the first second of startup if any required environment variable is missing or malformed.
2. Optional features (GitHub OAuth, Redis) degrade gracefully with informational messages (not silent behavior changes).
3. All required and optional variables are documented in `.env.example` with descriptions and example values.
4. The validation is expressed as a single, readable schema that serves as the authoritative reference for all environment variables the application uses.

## What Needs to Be Done

### 1. Define a validation schema for all environment variables
Create `lib/env.ts` (or `lib/env.mjs` for use in the server):
```typescript
// lib/env.ts
import { z } from 'zod'; // Already proposed in P014; use same dependency

const EnvSchema = z.object({
  // Required
  DATABASE_URL:  z.string().url('DATABASE_URL must be a valid PostgreSQL connection URL'),
  AUTH_SECRET:   z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  NEXTAUTH_URL:  z.string().url('NEXTAUTH_URL must be a valid URL'),

  // Optional – OAuth
  GITHUB_ID:     z.string().optional(),
  GITHUB_SECRET: z.string().optional(),

  // Optional – Redis (P012)
  REDIS_URL:     z.string().url().optional(),

  // Optional – rate limiting (P015)
  RATE_LIMIT_MAX:    z.coerce.number().int().positive().default(10),
  RATE_LIMIT_WINDOW: z.coerce.number().int().positive().default(60),

  // Runtime
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT:     z.coerce.number().int().positive().default(3000),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.errors
      .map(e => `  ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    console.error(`\n❌ Environment configuration error:\n${errors}\n`);
    console.error('  Copy .env.example to .env and fill in the required values.\n');
    process.exit(1);
  }
  return result.data;
}
```

### 2. Call `validateEnv()` at the very start of `server.mjs`
```js
// server.mjs – first lines
import { validateEnv } from './lib/env.mjs';
const env = validateEnv(); // Exits immediately if invalid

// Use env.DATABASE_URL instead of process.env.DATABASE_URL throughout
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
```

Making `DATABASE_URL` and `AUTH_SECRET` required (no fallback) means the app either starts correctly or fails loudly—never silently broken.

### 3. Call `validateEnv()` in Next.js configuration
Next.js reads `next.config.mjs` at build time and at runtime. Add validation there too:
```js
// next.config.mjs
import { validateEnv } from './lib/env.mjs';
validateEnv(); // Fail the build if env is invalid

const nextConfig = { reactStrictMode: true };
export default nextConfig;
```

### 4. Update `.env.example` with descriptions
```bash
# Required: PostgreSQL connection string
# Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE
DATABASE_URL=postgresql://sketchgit:dev_password@localhost:5432/sketchgit

# Required: Random secret for signing JWT tokens (min 32 chars)
# Generate with: openssl rand -base64 32
AUTH_SECRET=change-me-to-a-random-32-char-secret

# Required: Public URL of this application
NEXTAUTH_URL=http://localhost:3000

# Optional: GitHub OAuth (leave empty to disable GitHub login)
GITHUB_ID=
GITHUB_SECRET=

# Optional: Redis URL for horizontal scaling (P012)
# REDIS_URL=redis://localhost:6379
```

### 5. Remove conditional database initialization
Replace:
```js
let prisma = null;
if (process.env.DATABASE_URL) {
  prisma = new PrismaClient(...);
}
```
With:
```js
// DATABASE_URL is now guaranteed to be present (validated above)
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
```
All downstream null-checks (`if (prisma)`) can be removed, simplifying the code.

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `lib/env.ts` | New file: `validateEnv()` function with Zod schema |
| `server.mjs` | Import and call `validateEnv()` at startup; remove `if (prisma)` guards |
| `next.config.mjs` | Call `validateEnv()` to catch build-time misconfiguration |
| `lib/auth.ts` | Make `AUTH_SECRET` required rather than optional |
| `.env.example` | Add descriptions, format hints, and examples for all variables |

## Additional Considerations

### Zod dependency
This proposal uses Zod, which is also proposed in P014. If P014 is implemented first, `zod` will already be in `package.json` and `lib/env.ts` can be added at no additional dependency cost.

### Secrets in CI/CD
The CI pipeline (P016) must provide all required environment variables as GitHub Actions secrets or environment variables. The `validateEnv()` call during `next build` will fail the CI job if any required variable is missing, which is the desired behavior.

### Test environment exemption
Unit tests that do not need a database should set `DATABASE_URL` to a test value or mock the Prisma client. Consider adding a `SKIP_ENV_VALIDATION=true` flag (checked before calling `validateEnv()`) to allow test files to bypass validation when running in a pure unit-test context without a database.

### TypeScript integration
Exporting `Env` from `lib/env.ts` and re-exporting `env` as a const allows all modules to import typed environment variables from a single source:
```typescript
import { env } from '@/lib/env';
env.DATABASE_URL; // TypeScript knows this is string, not string | undefined
```
This replaces all `process.env.X` accesses throughout the codebase with typed, validated equivalents.
