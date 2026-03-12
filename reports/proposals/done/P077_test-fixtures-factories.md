# P077 – Shared Vitest Test Fixtures and Factory Helpers

## Title
Create a Central Test Fixture Library (`lib/test/factories.ts`) with Typed Builder Functions for Prisma Models and WebSocket Messages to Eliminate Test Data Duplication

## Brief Summary
Unit and integration tests across the codebase (`app/api/**/*.test.ts`, `lib/**/*.test.ts`) independently define inline mock objects for Prisma models (`User`, `Room`, `Commit`, `RoomMembership`) and WebSocket messages. This duplication causes maintenance overhead (changing a Prisma schema field requires updating 10+ test files) and inconsistency (tests that omit required fields rely on partial mock objects that may not reflect reality). Centralising test data creation in `lib/test/factories.ts` with typed builder functions (using the builder pattern with sensible defaults and optional overrides) ensures all tests create structurally correct mock data.

## Current Situation
Representative sample of inline test mock objects across the codebase:

```typescript
// app/api/auth/account/route.test.ts
const CREDENTIALS_USER = {
  id: 'usr_1', email: 'test@example.com', name: 'Test',
  passwordHash: '$2b$12$hash', accounts: [],
};
const OAUTH_USER = {
  id: 'usr_1', email: 'test@example.com', name: 'Test',
  passwordHash: null, accounts: [{ provider: 'github' }],
};

// app/api/rooms/[roomId]/route.test.ts
const MEMBERSHIP_OWNER = {
  id: 'room_1', slug: null, isPublic: true,
  memberships: [{ userId: 'usr_1', role: 'OWNER' }],
};
const NON_OWNER_ROOM = {
  id: 'room_1', slug: null, isPublic: true,
  memberships: [{ userId: 'usr_2', role: 'VIEWER' }],
};

// app/api/rooms/[roomId]/commits/route.test.ts
// Similar inline objects repeated again
```

Each test file independently defines these objects with slightly different fields. When a new field is added to a Prisma model (e.g., `User.emailVerifiedAt`), each test file must be updated separately.

### Test infrastructure
```
vitest.config.ts              ← no global setup file, no shared fixtures
lib/**/*.test.ts              ← unit tests
app/api/**/*.test.ts          ← API route tests
```

## Problem with Current Situation
1. **Schema drift**: When Prisma schema changes, test mock objects that omit the new field may cause tests to pass with structurally incorrect data, or fail with obscure TypeScript errors rather than clearly pointing to the missing field.
2. **Copy-paste maintenance burden**: Adding a required field to `User` requires finding and updating every test file that creates a mock user. A factory function centralises this change to one location.
3. **Inconsistent test identifiers**: Some tests use `id: 'usr_1'`, others use `id: 'user-123'`, others `id: crypto.randomUUID()`. Inconsistent IDs make it harder to write multi-model tests (e.g., a room with a member requires matching `userId` in both the `Room.memberships` and the `User.id`).
4. **No reuse of WebSocket message factories**: Tests for WebSocket message handling in `server.ts` (which are currently covered by E2E tests only) would benefit from typed factory functions for `WsMessage` objects.
5. **Incomplete mock objects**: TypeScript `as` casts (`{} as User`) allow omitting required fields in mocks, potentially masking bugs where the code assumes a field is present.

## Goal to Achieve
1. Create `lib/test/factories.ts` with typed builder functions for all Prisma models used in tests.
2. Create `lib/test/wsFactories.ts` with typed builder functions for `WsMessage` types.
3. Migrate all existing test files to use the factory functions instead of inline mock objects.
4. Add a Vitest global setup file (`lib/test/setup.ts`) to configure shared test utilities.

## What Needs to Be Done

### 1. Create `lib/test/factories.ts`
```typescript
/**
 * Test data factories for Prisma models.
 * Each factory returns a fully-typed object with sensible defaults.
 * Override any field by passing a partial object.
 *
 * Usage:
 *   import { makeUser, makeRoom } from '@/lib/test/factories';
 *   const user = makeUser({ email: 'custom@example.com' });
 *   const room = makeRoom({ isPublic: false });
 */

import type { User, Room, Commit, RoomMembership } from '@prisma/client';

let _seq = 0;
const seq = () => String(++_seq);

// ─── User ────────────────────────────────────────────────────────────────────

export function makeUser(overrides: Partial<User> = {}): User {
  const id = overrides.id ?? `usr_${seq()}`;
  return {
    id,
    email: `user-${id}@example.com`,
    name: `User ${id}`,
    passwordHash: '$2b$12$hash',  // bcrypt hash placeholder
    emailVerified: null,
    image: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function makeOAuthUser(overrides: Partial<User> = {}): User {
  return makeUser({ passwordHash: null, ...overrides });
}

// ─── Room ────────────────────────────────────────────────────────────────────

export function makeRoom(overrides: Partial<Room> = {}): Room {
  const id = overrides.id ?? `room_${seq()}`;
  return {
    id,
    slug: null,
    isPublic: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    lastActiveAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ─── RoomMembership ───────────────────────────────────────────────────────────

export function makeMembership(
  roomId: string,
  userId: string,
  role: 'OWNER' | 'EDITOR' | 'VIEWER' = 'OWNER',
): RoomMembership {
  return {
    id: `mem_${seq()}`,
    roomId,
    userId,
    role,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

// ─── Commit ───────────────────────────────────────────────────────────────────

export function makeCommit(
  roomId: string,
  overrides: Partial<Commit> = {},
): Commit {
  const sha = overrides.sha ?? `sha${seq()}`;
  return {
    id: `cmt_${seq()}`,
    sha,
    roomId,
    parentSha: null,
    branch: 'main',
    message: 'Initial commit',
    canvasJson: { objects: [] },
    storageType: 'SNAPSHOT',
    isMerge: false,
    authorId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}
```

### 2. Create `lib/test/wsFactories.ts`
```typescript
/**
 * Test data factories for WebSocket messages.
 */
import type { WsMessage } from '@/lib/sketchgit/types';

export function makeDrawDelta(
  senderId = 'client_1',
  overrides: Partial<Extract<WsMessage, { type: 'draw-delta' }>> = {},
): Extract<WsMessage, { type: 'draw-delta' }> {
  return {
    type: 'draw-delta',
    senderId,
    delta: { added: [], modified: [], removed: [] },
    ...overrides,
  };
}

export function makeCommitMessage(
  senderId = 'client_1',
  overrides: Partial<Extract<WsMessage, { type: 'commit' }>> = {},
): Extract<WsMessage, { type: 'commit' }> {
  return {
    type: 'commit',
    senderId,
    sha: 'abc1234',
    commit: {
      sha: 'abc1234',
      parentSha: null,
      branch: 'main',
      message: 'Test commit',
      canvas: '{"objects":[]}',
      ts: Date.now(),
    },
    ...overrides,
  };
}
```

### 3. Create `lib/test/setup.ts` (Vitest global setup)
```typescript
/**
 * Vitest global test setup.
 * Runs once before all tests.
 */
import { vi } from 'vitest';

// Reset the factory sequence counter between test suites.
// (Import the factory module and expose a reset function if needed.)

// Silence expected console output in tests.
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

Update `vitest.config.ts`:
```typescript
setupFiles: ['lib/test/setup.ts'],
```

### 4. Migrate existing test files
Each existing test file that defines inline mock objects should be updated to import from `lib/test/factories.ts`. This is a non-breaking change: factories provide identical data with the same field values, just with full type coverage.

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `lib/test/factories.ts` | New file: Prisma model factories |
| `lib/test/wsFactories.ts` | New file: WebSocket message factories |
| `lib/test/setup.ts` | New file: Vitest global setup |
| `vitest.config.ts` | Add `setupFiles` entry |
| `app/api/auth/account/route.test.ts` | Migrate inline mocks to factories |
| `app/api/rooms/[roomId]/route.test.ts` | Migrate inline mocks to factories |
| `app/api/rooms/[roomId]/commits/route.test.ts` | Migrate inline mocks to factories |
| `app/api/auth/register/route.test.ts` | Migrate inline mocks to factories |

## Additional Considerations

### TypeScript type checking of factories
Because factories use `Partial<User>` overrides, TypeScript will catch any misspelling of field names in overrides. The return type is `User` (not `Partial<User>`), so tests receive fully typed objects and TypeScript will flag any code that accesses fields that don't exist on the type.

### Sequence counter between tests
The `_seq` counter in `factories.ts` increments across tests in the same test run. This ensures unique IDs within a single run. However, tests should not assert on specific ID values (e.g., `expect(user.id).toBe('usr_1')`); they should use the factory-returned ID: `const user = makeUser(); expect(result.userId).toBe(user.id)`.

### Not a test database seeder
This proposal creates in-memory test factories, not a database seeder. The factories generate plain objects that are passed to `vi.mock()` return values, not actual database rows. Tests remain unit tests that do not touch a real database.

### Prisma type imports
The factories import Prisma model types (`User`, `Room`, etc.) from `@prisma/client`. These types are generated at build time. The factories file cannot be run without a generated Prisma client. Ensure `npx prisma generate` is run before tests (already done in CI per the `ci.yml` workflow).

## Testing Requirements
- `makeUser()` returns an object satisfying the `User` type (TypeScript compile-time check).
- `makeUser({ email: 'custom@example.com' })` returns a user with the specified email.
- `makeUser()` called twice in the same test run returns objects with different `id` values.
- `makeRoom()` and `makeUser()` IDs are compatible: `makeMembership(makeRoom().id, makeUser().id)` returns a valid `RoomMembership`.
- The global setup file (`lib/test/setup.ts`) silences expected `console.warn` output without breaking warning assertions.
- All migrated test files pass without changes to their assertion logic.

## Dependency Map
- Builds on: P002 ✅ (test suite established), P028 ✅ (expanded coverage), P003 ✅ (Prisma models)
- Complements: P038 ✅ (E2E tests — E2E tests use their own fixtures; unit test factories are separate), P063 (Copilot instructions — instructions updated to reference factory pattern)
- Independent of: Redis, WebSocket, Next.js runtime, auth
