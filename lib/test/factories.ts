/**
 * Test data factories for Prisma models.
 *
 * Each factory returns a fully-typed object with sensible defaults.
 * Override any field by passing a partial object.
 *
 * Usage:
 *   import { makeUser, makeRoom, makeCommit, makeMembership } from '@/lib/test/factories';
 *   const user = makeUser({ email: 'custom@example.com' });
 *   const room = makeRoom({ isPublic: false });
 *   const commit = makeCommit('room_1');
 *   const membership = makeMembership('room_1', 'usr_1', 'OWNER');
 *
 * P077 – centralised test fixture library to eliminate per-test inline mock objects.
 */

import type { User, Room, Commit, RoomMembership } from "@prisma/client";

let _seq = 0;

/** Returns a monotonically increasing string counter. Unique within a test run. */
const seq = (): string => String(++_seq);

/** Reset the sequence counter. Call in a global `beforeEach` or `afterEach` if isolated IDs are needed. */
export function resetFactorySequence(): void {
  _seq = 0;
}

// ─── User ─────────────────────────────────────────────────────────────────────

export function makeUser(overrides: Partial<User> = {}): User {
  const id = overrides.id ?? `usr_${seq()}`;
  return {
    id,
    email: `user-${id}@example.com`,
    name: `User ${id}`,
    // Intentionally invalid bcrypt-format hash for tests that mock verifyCredentials.
    // Real tests that exercise hashing should supply a valid argon2id or bcrypt hash
    // via the `overrides` parameter, or mock argon2/bcryptjs directly.
    passwordHash: "$2b$12$placeholderhashfortest",
    emailVerified: null,
    image: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

/** Returns a User with no passwordHash, simulating an OAuth-only account. */
export function makeOAuthUser(overrides: Partial<User> = {}): User {
  return makeUser({ passwordHash: null, ...overrides });
}

// ─── Room ─────────────────────────────────────────────────────────────────────

export function makeRoom(overrides: Partial<Room> = {}): Room {
  const id = overrides.id ?? `room_${seq()}`;
  return {
    id,
    slug: null,
    // ownerId is nullable in the schema; set explicitly when ownership matters.
    ownerId: null,
    isPublic: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ─── RoomMembership ───────────────────────────────────────────────────────────

export function makeMembership(
  roomId: string,
  userId: string,
  role: "OWNER" | "EDITOR" | "VIEWER" = "OWNER",
  overrides: Partial<RoomMembership> = {},
): RoomMembership {
  return {
    roomId,
    userId,
    role,
    joinedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ─── Commit ───────────────────────────────────────────────────────────────────

export function makeCommit(
  roomId: string,
  overrides: Partial<Commit> = {},
): Commit {
  const n = seq();
  const sha = overrides.sha ?? `sha${n}abcdef`;
  return {
    sha,
    roomId,
    parentSha: null,
    parents: [],
    branch: "main",
    message: "Test commit",
    canvasJson: { objects: [] },
    storageType: "SNAPSHOT",
    isMerge: false,
    authorId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}
