# P047 – Branch Name and Commit Message Sanitization in the WebSocket Server

## Title
Add `safeBranchName()` and Commit Message Length Validation to Prevent Database Corruption via Malicious Commit Payloads

## Brief Summary
The WebSocket server sanitizes room IDs (`safeRoomId`), display names (`safeName`), and colours (`safeColor`) before using them in any persistent context. However, the `commit` message payload is used without analogous sanitization: `commitData.branch` is written verbatim to the database as a branch name, and `commitData.message` is stored without a length limit. A malicious WebSocket client can supply a branch name containing path-separator characters, NUL bytes, control characters, or an arbitrarily long string — all of which will be persisted to `Branch.name` and cascade to `Commit.branch` with no validation. Similarly, a 1 MB commit message is accepted and stored. Adding `safeBranchName()` and a `safeCommitMessage()` normalizer to the server-side commit handler closes this gap with a one-time, low-effort change.

## Current Situation
`server.ts` has three sanitizer helpers:
```typescript
function safeRoomId(value: string | null): string {
  const trimmed = (value ?? "default").trim().slice(0, 40);
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, "-") || "default";
}

function safeName(value: string | null): string {
  return (value ?? "User").trim().slice(0, 24) || "User";
}

function safeColor(value: string | null): string {
  const c = (value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#7c6eff";
}
```

But the commit handler uses `commitData.branch` and `commitData.message` raw:
```typescript
if (message.type === "commit" && message.sha && message.commit) {
  await dbSaveCommit(
    roomId,
    message.sha as string,
    message.commit as CommitData,  // ← branch and message not sanitized
    client.userId,
  );
}
```

Inside `dbSaveCommit`:
```typescript
interface CommitData {
  parent?: string | null;
  parents?: string[];
  branch: string;    // ← written directly to Branch.name and Commit.branch
  message: string;   // ← written directly to Commit.message
  canvas: string;
  isMerge?: boolean;
}
```

The `safeRoomId` function already demonstrates the correct pattern. The analogous functions for branch names and commit messages are simply missing.

## Problem with Current Situation
1. **Database corruption via branch name injection**: A client can create a branch named `main/../../../` (50+ chars), `\x00null-byte`, `; DROP TABLE "Branch"; --`, or a 1000-character string. While Prisma parameterises all queries (preventing SQL injection), the raw characters are stored in the `Branch.name` column, which is used as a composite primary key `[roomId, name]`. Unusual characters in branch names will:
   - Break the UI (branch list, merge source select) when the browser encounters NUL or control characters
   - Fail the `@@id([roomId, name])` constraint if the name exceeds PostgreSQL's B-tree index limit (2712 bytes per row)
   - Create branches that cannot be deleted via normal UI (the name cannot be round-tripped through URL parameters)
2. **Unbounded commit message storage**: A 10 MB commit message is stored without rejection. With 100 clients each sending 1 MB commit messages per minute, the `Commit.message` column grows without bound. Database size is not constrained by the canvas size alone.
3. **Inconsistency with other sanitizers**: The existing `safeRoomId` function already establishes the convention. Its absence for branch names is surprising to maintainers and creates a false sense of security.
4. **Orphaned branch pointers**: If a branch name contains characters that are valid for PostgreSQL but invalid for JavaScript `Map` keys or for the git model's `branches` Record, branch lookups silently fail, causing `HEAD` to point to a branch that cannot be resolved.

## Goal to Achieve
1. Add `safeBranchName(value: string | null): string` that applies the same pattern as `safeRoomId`: trim, slice to max length (100 chars), replace disallowed characters.
2. Add `safeCommitMessage(value: string | null): string` that trims and slices to 500 characters.
3. Apply these sanitizers inside `dbSaveCommit` (or at the point where `commitData` is extracted from the WebSocket message) before any database writes.
4. Extend the Zod validation in P031 (when implemented) to also constrain branch name format and message length.

## What Needs to Be Done

### 1. Add sanitizer functions to `server.ts`
```typescript
/**
 * Normalise a branch name coming from an untrusted WebSocket client.
 * Allows letters, digits, `/`, `_`, `-`, `.` (standard git branch name chars).
 * Slices to 100 characters and replaces all other characters with `-`.
 * Returns "main" as a safe default.
 */
function safeBranchName(value: string | null): string {
  const trimmed = (value ?? "main").trim().slice(0, 100);
  return trimmed.replace(/[^a-zA-Z0-9/_\-.]/g, "-") || "main";
}

/**
 * Normalise a commit message coming from an untrusted client.
 * Strips leading/trailing whitespace and caps at 500 characters.
 */
function safeCommitMessage(value: string | null): string {
  return (value ?? "").trim().slice(0, 500) || "(no message)";
}
```

### 2. Apply sanitizers in `dbSaveCommit`
```typescript
async function dbSaveCommit(
  roomId: string,
  sha: string,
  commitData: CommitData,
  userId: string | null,
): Promise<void> {
  // Sanitize branch name and message before any DB writes
  const branch = safeBranchName(commitData.branch);
  const message = safeCommitMessage(commitData.message);

  let canvasObj: object;
  try {
    canvasObj = JSON.parse(commitData.canvas) as object;
  } catch (err) {
    logger.warn({ roomId, sha, err }, "db.saveCommit: invalid canvas JSON; skipping");
    return;
  }

  try {
    await prisma.$transaction([
      prisma.commit.upsert({
        where: { sha },
        create: { sha, roomId, parentSha: commitData.parent ?? null,
          parents: commitData.parents ?? [], branch, message, canvasJson: canvasObj,
          isMerge: commitData.isMerge ?? false, authorId: userId ?? null },
        update: {},
      }),
      prisma.branch.upsert({
        where: { roomId_name: { roomId, name: branch } },
        create: { roomId, name: branch, headSha: sha },
        update: { headSha: sha },
      }),
      prisma.roomState.upsert({
        where: { roomId },
        create: { roomId, headSha: sha, headBranch: branch, isDetached: false },
        update: { headSha: sha, headBranch: branch },
      }),
    ]);
  } catch (err) {
    logger.error({ roomId, sha, err }, "db.saveCommit failed");
  }
}
```

### 3. Reflect sanitized name back to the committing client (optional enhancement)
When a branch name is sanitized, the client's local in-memory branch map will have the original name while the database has the sanitized version. This discrepancy can cause the next commit to create a duplicate branch with the original (dirty) name. Consider sending a `profile-update` or `branch-corrected` message back to the sender so their client updates its branch name to match the persisted one.

### 4. Tests in `server.test.ts` (or a new `sanitizers.test.ts`)
```typescript
describe('safeBranchName', () => {
  it('allows standard git branch characters', () =>
    expect(safeBranchName('feature/my-branch_1.0')).toBe('feature/my-branch_1.0'));
  it('replaces spaces and control chars with hyphens', () =>
    expect(safeBranchName('branch with spaces')).toBe('branch-with-spaces'));
  it('slices at 100 characters', () =>
    expect(safeBranchName('x'.repeat(101))).toHaveLength(100));
  it('returns "main" for null', () =>
    expect(safeBranchName(null)).toBe('main'));
  it('returns "main" for an all-disallowed-char string', () =>
    expect(safeBranchName('\x00\x01\x02')).toBe('main'));
});

describe('safeCommitMessage', () => {
  it('trims whitespace', () =>
    expect(safeCommitMessage('  hello  ')).toBe('hello'));
  it('slices at 500 characters', () =>
    expect(safeCommitMessage('x'.repeat(501))).toHaveLength(500));
  it('returns "(no message)" for empty string', () =>
    expect(safeCommitMessage('')).toBe('(no message)'));
});
```

## Components Affected
| Component | Change |
|-----------|--------|
| `server.ts` | Add `safeBranchName()` + `safeCommitMessage()`; apply them in `dbSaveCommit` |
| `lib/sketchgit/git/gitModel.ts` | (Optional) add equivalent sanitizer for client-side branch creation (`createBranch`) |
| New test file | Unit tests for `safeBranchName` and `safeCommitMessage` |

## Data & Database Model
No schema changes. Sanitization happens in the application layer before writes. Existing branch names already in the database are not affected (they were created by the same client code that validates names client-side).

## Testing Requirements
- Branch name with 200 chars → stored as 100 chars.
- Branch name with NUL bytes → stored as `"---"` (hyphens replacing NULs).
- Commit message with 1000 chars → stored as 500 chars.
- Valid branch name `feature/my-thing_v2.0` → unchanged.
- `safeBranchName(null)` → `"main"`.
- `safeCommitMessage(null)` → `"(no message)"`.

## Linting and Type Requirements
- `safeBranchName` and `safeCommitMessage` follow the exact same signature pattern as `safeRoomId` — `(value: string | null) => string`. They are pure functions with no side effects.
- The character allow-list for `safeBranchName` mirrors Git's branch naming rules: letters, digits, `/`, `_`, `-`, `.` are allowed. Forward-slash is included to support `feature/...` and `hotfix/...` naming conventions.
- The 100-character limit matches GitHub's branch name limit (255 bytes, but 100 chars ensures safe display in all UI contexts).

## Dependency Map
- Depends on: P013 ✅ (server in TypeScript, sanitizers fit naturally), P014 ✅ (Zod validation of commit payloads — P031 will add Zod schema that uses the same constants)
- Complements: P031 (WS message validation — add `z.string().regex(/^[a-zA-Z0-9/_\-.]{1,100}$/)` to branch field)
- Independent of all infrastructure proposals — trivially backportable
