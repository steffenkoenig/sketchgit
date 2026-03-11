# P057 – Validate Commit SHA Format and Payload Size Before Database Persistence

## Title
Add Server-side Validation of the `sha`, `parents`, and Canvas Size Fields in Incoming WebSocket `commit` Messages to Prevent DB Corruption and DoS

## Brief Summary
When the WebSocket server receives a `commit` message, it uses `message.sha as string` as the primary key of the `Commit` table and `message.commit.parents` as an array of parent SHAs, without validating either field's format or size. A malicious client can send a `sha` of arbitrary length (e.g., 64 KB), a `parents` array with 1000 entries, or a `canvas` field containing 50 MB of JSON. All of these will be forwarded to `dbSaveCommit` and attempted as PostgreSQL inserts. While Prisma parameterizes all queries (preventing SQL injection), the unbounded inputs create denial-of-service, storage exhaustion, and B-tree index overflow risks. The fix is a focused validation function applied before any DB operation, consistent with P047's pattern of sanitizing inputs at the server boundary.

## Current Situation
In `server.ts`, the `commit` message handler:
```typescript
// server.ts – commit handler (abbreviated)
if (message.type === "commit" && message.sha && message.commit) {
  logger.info({ clientId, roomId, sha: message.sha }, "ws: commit received");
  await dbSaveCommit(
    roomId,
    message.sha as string,          // ← no length/format check
    message.commit as CommitData,   // ← no size/structure check
    client.userId,
  );
}
```

Inside `dbSaveCommit`, the `sha` is used directly as:
```typescript
// prisma.commit.upsert
where: { sha },          // ← primary key with no max length
create: { sha, … },
// prisma.branch.upsert
data: { headSha: sha },  // ← FK with no max length
// prisma.roomState.upsert
data: { headSha: sha },  // ← same
```

And `commitData.parents` is serialized to the `parents JSONB` column without any length check:
```typescript
parents: commitData.parents ?? [],   // ← could be ["sha1", "sha2", … × 1000]
```

## Problem with Current Situation
1. **B-tree index overflow**: PostgreSQL's B-tree index has a per-entry size limit of approximately 2712 bytes. If `sha` exceeds this limit (e.g., a 4 KB string), `prisma.commit.upsert` throws a `P2026` error (index limit exceeded). The error is caught and logged, but the relay to peers still occurs, so peers receive the oversized commit and attempt to process it client-side. Repeated attacks trigger sustained DB error log spam.
2. **Storage exhaustion via large `canvas` payloads**: The `canvasJson JSONB` column has no max size at the DB level. A client that sends a 50 MB canvas string (e.g., `{ objects: [/* 1 million rectangle objects */] }`) will cause:
   - ~50 MB PostgreSQL row, which is valid but expensive (index overhead, WAL growth).
   - P011's `canvasJson` JSONB column has no `CHECK` constraint for size.
   - The server parses the canvas with `JSON.parse(commitData.canvas)` before insert; a 50 MB parse is ~50ms of CPU time per commit message, creating a CPU DoS vector.
3. **Inconsistency with P047**: P047 (accepted proposal) adds `safeBranchName()` and `safeCommitMessage()` to `dbSaveCommit`. If P047 is implemented without P057, branch names and messages are validated but SHAs and canvas sizes are not, creating a false sense of comprehensive input validation.
4. **`parents` array injection**: A `parents` array with many entries (e.g., 1000 parent SHAs) is valid JSONB but produces a commit with 1000 parents, which the client-side LCA algorithm (a BFS over the commit graph) must traverse, potentially causing O(N²) graph traversal if many such commits are present.
5. **Rate limit bypass via single oversized commit**: The rate limiter in `proxy.ts` protects the HTTP auth endpoints, not the WebSocket connection. A single WebSocket connection can send one oversized commit message per second without hitting any limit.

## Goal to Achieve
1. Add a `validateCommitMessage()` function in `server.ts` that checks:
   - `sha`: non-empty string, 1–64 characters, matching `/^[0-9a-f]{8,64}$/` (hex characters only, consistent with how `generateSha()` produces 16-char hex strings).
   - `commit.message`: max 500 characters (same as P047's `safeCommitMessage`).
   - `commit.branch`: max 100 characters, same allow-list as P047's `safeBranchName`.
   - `commit.parents`: array of at most 2 elements (a commit has at most 2 parents in standard git), each a valid SHA string.
   - `commit.canvas`: max 2 MB (chosen to allow complex drawings with hundreds of objects while preventing storage exhaustion).
   - `commit.isMerge`: boolean (truthy check is sufficient; the DB column is `Boolean`).
2. If validation fails, log a warning and drop the message (do not relay to peers and do not attempt DB insert).
3. Apply the same validation to SHAs in the `parents` array.
4. Keep `validateCommitMessage()` as a pure function to enable unit testing without mocking DB connections.

## What Needs to Be Done

### 1. Add `validateCommitMessage()` to `server.ts`
```typescript
/** Maximum allowed canvas JSON size in characters.
 *
 * Note: JavaScript string .length counts UTF-16 code units (characters),
 * not UTF-8 bytes. For true byte-size enforcement use:
 *   new TextEncoder().encode(str).byteLength
 * However, JSON canvas data is ASCII (Fabric.js serializes numeric coords
 * and hex colour strings), so character count ≈ byte count with < 0.1%
 * over-estimate for the rare emoji in text objects.
 *
 * At 2M chars: 500 complex objects with ~4 KB each. In practice this limit
 * will never be hit by legitimate drawings before it becomes a performance
 * problem on the canvas itself.
 */
const MAX_CANVAS_CHARS = 2 * 1024 * 1024; // 2 M chars ≈ 2 MB for ASCII JSON

/**
 * Validate the fields of an incoming `commit` WebSocket message.
 * Returns true if the message is safe to persist and relay; false otherwise.
 * All validation is pure (no DB access) and logged at WARN level on failure.
 */
function validateCommitMessage(
  sha: unknown,
  commit: unknown,
  log: (reason: string) => void,
): boolean {
  // SHA validation: hex string, 8–64 characters
  if (typeof sha !== 'string' || !/^[0-9a-f]{8,64}$/.test(sha)) {
    log(`invalid sha: ${String(sha).slice(0, 80)}`);
    return false;
  }

  if (typeof commit !== 'object' || commit === null) {
    log('commit is not an object');
    return false;
  }

  const c = commit as Record<string, unknown>;

  // Canvas size: must be a string, max 2 MB
  if (typeof c.canvas !== 'string') {
    log('canvas is not a string');
    return false;
  }
  if (c.canvas.length > MAX_CANVAS_CHARS) {
    log(`canvas too large: ${c.canvas.length} chars (max ${MAX_CANVAS_CHARS})`);
    return false;
  }

  // Canvas must be valid JSON
  try {
    JSON.parse(c.canvas);
  } catch {
    log('canvas is not valid JSON');
    return false;
  }

  // parents: array of at most 2 valid SHAs
  if (c.parents !== undefined) {
    if (!Array.isArray(c.parents)) {
      log('parents is not an array');
      return false;
    }
    if (c.parents.length > 2) {
      log(`too many parents: ${c.parents.length} (max 2)`);
      return false;
    }
    for (const p of c.parents) {
      if (typeof p !== 'string' || !/^[0-9a-f]{8,64}$/.test(p)) {
        log(`invalid parent sha: ${String(p).slice(0, 80)}`);
        return false;
      }
    }
  }

  return true;
}
```

### 2. Apply validation in the `commit` handler
```typescript
if (message.type === "commit" && message.sha && message.commit) {
  const sha = message.sha as unknown;
  const commit = message.commit as unknown;

  if (!validateCommitMessage(sha, commit, (reason) =>
    logger.warn({ clientId, roomId, sha: String(sha).slice(0, 80), reason }, "ws: invalid commit dropped")
  )) {
    return; // ← drop the message; do not relay or persist
  }

  logger.info({ clientId, roomId, sha }, "ws: commit received");
  await dbSaveCommit(roomId, sha as string, commit as CommitData, client.userId);
}
```

### 3. Tests
```typescript
// server.test.ts (or sanitizers.test.ts)
describe('validateCommitMessage', () => {
  it('accepts valid commit with 16-char hex SHA', () => {
    expect(validateCommitMessage('abc123def456abcd', validCommit, noop)).toBe(true);
  });
  it('rejects SHA with non-hex characters', () => {
    expect(validateCommitMessage('sha_with_undersc', validCommit, noop)).toBe(false);
  });
  it('rejects SHA longer than 64 chars', () => {
    expect(validateCommitMessage('a'.repeat(65), validCommit, noop)).toBe(false);
  });
  it('rejects canvas larger than 2 MB', () => {
    const largeCommit = { ...validCommit, canvas: 'x'.repeat(3_000_000) };
    expect(validateCommitMessage('abc123def456abcd', largeCommit, noop)).toBe(false);
  });
  it('rejects canvas that is not valid JSON', () => {
    const badCommit = { ...validCommit, canvas: '{invalid json}' };
    expect(validateCommitMessage('abc123def456abcd', badCommit, noop)).toBe(false);
  });
  it('rejects more than 2 parents', () => {
    const octopusCommit = { ...validCommit, parents: ['aaa', 'bbb', 'ccc'] };
    expect(validateCommitMessage('abc123def456abcd', octopusCommit, noop)).toBe(false);
  });
  it('rejects invalid parent SHA format', () => {
    const badParent = { ...validCommit, parents: ['not-a-hex-sha'] };
    expect(validateCommitMessage('abc123def456abcd', badParent, noop)).toBe(false);
  });
});
```

## Components Affected
| Component | Change |
|-----------|--------|
| `server.ts` | Add `validateCommitMessage()` function; apply in `commit` message handler |
| New test file or `server.test.ts` | Unit tests for `validateCommitMessage` |

## Data & Database Model
No schema changes. The validation happens in the application layer before any DB write. Commits already in the database are not affected.

**Consistent limits with P047**:
| Field | P047 limit | P057 limit |
|-------|-----------|-----------|
| `branch` | 100 chars, `[a-zA-Z0-9/_\-.]` | same (applied via `safeBranchName` from P047) |
| `message` | 500 chars | same (applied via `safeCommitMessage` from P047) |
| `sha` | — | 8–64 chars, `[0-9a-f]` |
| `parents[]` | — | max 2 elements, each 8–64 hex chars |
| `canvas` | — | max 2 M chars (≈2 MB for ASCII JSON), valid JSON |

## Testing Requirements
- Valid 16-char hex SHA → accepted.
- SHA with uppercase → rejected (GitModel uses lowercase hex from `crypto.randomUUID()`).
- SHA `""` (empty) → rejected.
- SHA longer than 64 chars → rejected.
- Canvas > 2 MB → rejected.
- Canvas invalid JSON → rejected.
- `parents: ['sha1', 'sha2', 'sha3']` (3 parents) → rejected.
- Parent with invalid characters → rejected.
- Valid merge commit with 2 parents → accepted.
- Rejected commit: not relayed to peers, not inserted in DB, WARN logged.

## Dependency Map
- Depends on: P013 ✅ (server TypeScript), P047 (branch name sanitization — P057 adds the SHA/canvas counterparts)
- Complements: P031 (Zod WS validation — P057's `validateCommitMessage` implements the same intent as P031 specifically for commit payloads)
- Independent of: Redis, auth, Prisma schema
- Severity: **Medium** — prevents storage exhaustion and index overflow; client-side GitModel already validates SHA format, so benign clients are unaffected
