# P028 – Expanded Test Coverage for Canvas, Collaboration, and API Layers

## Title
Expand Automated Test Coverage to the Canvas Engine, Collaboration Manager, WebSocket Client, and API Routes

## Brief Summary
The existing test suite covers the git model layer thoroughly (644 lines across three test files), but the canvas engine, collaboration manager, WebSocket client, and all API routes have zero automated tests. Together these untested modules account for approximately 900 lines of business logic—including the draw-delta algorithm, WebSocket reconnection logic, and the registration endpoint—that can only be verified manually. Adding targeted tests for these layers completes the safety net needed to confidently refactor and extend the codebase.

## Current Situation
The test suite as of today:

| File | Lines | Coverage |
|------|-------|---------|
| `lib/sketchgit/git/gitModel.test.ts` | 267 | ✅ Git model operations |
| `lib/sketchgit/git/mergeEngine.test.ts` | 252 | ✅ 3-way merge algorithm |
| `lib/sketchgit/git/objectIdTracker.test.ts` | 125 | ✅ Object ID assignment |

Modules with **zero** test coverage:

| Module | Lines | Criticality |
|--------|-------|-------------|
| `lib/sketchgit/canvas/canvasEngine.ts` | ~367 | High – core drawing |
| `lib/sketchgit/realtime/collaborationManager.ts` | ~467 | High – draw-delta, presence |
| `lib/sketchgit/realtime/wsClient.ts` | 221 | High – reconnection logic |
| `lib/sketchgit/app.ts` | 699 | Medium – orchestration |
| `lib/sketchgit/ui/timelineRenderer.ts` | 196 | Medium – layout computation |
| `app/api/auth/register/route.ts` | 57 | High – security/auth |
| `server.mjs` | 369 | High – WebSocket server |

The Vitest configuration targets 70% coverage across lines, functions, branches, and statements. Because the git module files have high coverage and the other modules have none, the **effective project-wide coverage is well below 70%**. The 70% threshold is only met per-file within the git submodule; globally it is masked.

## Problem with Current Situation
1. **No safety net for refactoring**: P013 (migrate server to TypeScript), P017 (decompose app.ts), P020 (cleanup), and P022 (canvas performance) all require modifying untested code. Any regression introduced during these refactors will go undetected until manual testing.
2. **Draw-delta algorithm untested**: The `collaborationManager.ts` draw-delta logic (the most complex piece of P006) has no unit tests. A subtle bug in delta computation causes incorrect canvas state for all peers—a high-impact, hard-to-reproduce defect.
3. **WebSocket reconnection untested**: The exponential backoff logic in `wsClient.ts` (retry count, timer values, message queue flush) is untested. Incorrect reconnection behavior is only discovered under actual network failures.
4. **Registration endpoint untested**: The `register` route has no tests for edge cases: duplicate email, invalid email format, short password, missing fields, or SQL-injection-like inputs in the name field. Security regressions in this endpoint are invisible.
5. **Global coverage threshold misleading**: The `vitest.config.ts` threshold applies per-file only to measured files. Unmeasured files do not contribute to the per-file average, giving a false sense of sufficient coverage.

## Goal to Achieve
1. Add unit tests for `wsClient.ts` covering the reconnection state machine, backoff calculation, and message queue.
2. Add unit tests for the draw-delta algorithm in `collaborationManager.ts`.
3. Add unit tests for the `register` API route covering happy path and all validation failure cases.
4. Add unit tests for the pure layout functions in `timelineRenderer.ts`.
5. Raise effective project-wide line coverage above the stated 70% threshold.

## What Needs to Be Done

### 1. Test `wsClient.ts` – reconnection and message queue
```typescript
// lib/sketchgit/realtime/wsClient.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { WsClient } from './wsClient';

describe('WsClient', () => {
  it('queues messages while disconnected and flushes on reconnect', async () => {
    const client = new WsClient('ws://localhost:9999');
    client.send({ type: 'cursor', x: 1, y: 1 }); // Queued – not connected yet
    expect(client.queuedMessages).toHaveLength(1);
    // Simulate connection open
    client['onOpen']();
    expect(client.queuedMessages).toHaveLength(0);
  });

  it('uses exponential backoff: retries at 1s, 2s, 4s…', () => {
    const client = new WsClient('ws://localhost:9999');
    expect(client['backoffDelay'](0)).toBeCloseTo(1000, -2);
    expect(client['backoffDelay'](1)).toBeCloseTo(2000, -2);
    expect(client['backoffDelay'](5)).toBeLessThanOrEqual(30000);
  });

  it('stops retrying after max attempts and emits persistent-error event', () => {
    const client = new WsClient('ws://localhost:9999', { maxRetries: 3 });
    const onError = vi.fn();
    client.on('persistent-error', onError);
    for (let i = 0; i <= 3; i++) client['onClose']();
    expect(onError).toHaveBeenCalledOnce();
  });
});
```

### 2. Test the draw-delta algorithm in `collaborationManager.ts`
The delta computation logic can be extracted into a pure function (as part of this refactor) and tested directly:
```typescript
// lib/sketchgit/realtime/collaborationManager.test.ts
import { computeDelta } from './collaborationManager';

describe('computeDelta', () => {
  it('detects added objects', () => {
    const before = {};
    const after  = { 'id-1': { left: 10, top: 20, type: 'rect' } };
    const delta  = computeDelta(before, after);
    expect(delta.added).toHaveLength(1);
    expect(delta.modified).toHaveLength(0);
    expect(delta.removed).toHaveLength(0);
  });

  it('detects modified objects', () => {
    const before = { 'id-1': { left: 10, top: 20 } };
    const after  = { 'id-1': { left: 15, top: 20 } }; // left changed
    const delta  = computeDelta(before, after);
    expect(delta.modified).toHaveLength(1);
    expect(delta.modified[0].left).toBe(15);
  });

  it('detects removed objects', () => {
    const before = { 'id-1': { left: 10, top: 20 } };
    const after  = {};
    const delta  = computeDelta(before, after);
    expect(delta.removed).toContain('id-1');
  });

  it('returns empty delta for unchanged canvas', () => {
    const snapshot = { 'id-1': { left: 10, top: 20 } };
    const delta    = computeDelta(snapshot, snapshot);
    expect(delta.added.length + delta.modified.length + delta.removed.length).toBe(0);
  });
});
```

### 3. Test the `register` API route
```typescript
// app/api/auth/register/route.test.ts
import { POST } from './route';

describe('POST /api/auth/register', () => {
  it('creates a user with valid credentials', async () => {
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com', password: 'securepass123' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it('returns 409 for duplicate email', async () => {
    // (Requires Prisma mock or test database)
  });

  it('returns 422 for invalid email format', async () => {
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'not-an-email', password: 'securepass123' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it('returns 422 for short password', async () => {
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com', password: 'short' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });
});
```

### 4. Test `timelineRenderer.ts` layout computation
Extract the pure `computeLayout()` function (proposed in P024) and test it independently:
```typescript
// lib/sketchgit/ui/timelineRenderer.test.ts
import { computeLayout } from './timelineRenderer';

it('assigns HEAD commit the largest x coordinate', () => {
  const layout = computeLayout(mockGitWithTwoCommits);
  const head   = layout.find(c => c.isHead)!;
  expect(head.x).toBeGreaterThan(layout[0].x);
});

it('places commits on separate branches at different y coordinates', () => {
  const layout = computeLayout(mockGitWithTwoBranches);
  const main   = layout.filter(c => c.branch === 'main');
  const feat   = layout.filter(c => c.branch === 'feature');
  expect(new Set(main.map(c => c.y)).size).toBe(1);
  expect(feat[0].y).not.toBe(main[0].y);
});
```

### 5. Update Vitest coverage configuration
Expand the coverage `include` pattern to cover all untested modules:
```typescript
// vitest.config.ts
coverage: {
  include: ['lib/**/*.ts', 'app/api/**/*.ts'],
  exclude: ['**/*.test.ts', '**/*.d.ts', 'lib/db/prisma.ts'],
  thresholds: {
    lines: 70, functions: 70, branches: 70, statements: 70,
  },
},
```

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `lib/sketchgit/realtime/wsClient.test.ts` | New test file |
| `lib/sketchgit/realtime/collaborationManager.test.ts` | New test file; may require extracting `computeDelta` as a pure function |
| `app/api/auth/register/route.test.ts` | New test file; requires Prisma mock (`vitest-mock-extended` or `prisma-mock`) |
| `lib/sketchgit/ui/timelineRenderer.test.ts` | New test file; depends on P024 layout extraction |
| `vitest.config.ts` | Expand coverage include paths |

## Additional Considerations

### Prisma mocking strategy
API route tests that touch the database need either:
1. A real test database (PostgreSQL) seeded before tests and cleaned up after.
2. Mocked Prisma client using `vitest-mock-extended` or a manual mock in `__mocks__/db/prisma.ts`.

Option 2 (mocked Prisma) is faster for unit tests but may miss real database behavior (e.g., unique constraint errors). Option 1 is slower but more accurate. Use option 2 for unit tests and add a separate integration test suite for option 1.

### WebSocket testing without a real server
Test `wsClient.ts` by replacing the global `WebSocket` constructor with a mock:
```typescript
vi.stubGlobal('WebSocket', MockWebSocket);
```
`MockWebSocket` simulates connection events (`open`, `close`, `message`) on demand, allowing deterministic tests without network I/O.

### Coverage target timeline
Reaching 70% project-wide coverage after adding these tests is realistic. The proposed tests cover the four highest-value untested modules. Canvas engine testing is more complex (requires a DOM canvas mock) and can follow in a subsequent iteration.
