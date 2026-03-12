/**
 * Tests for lib/test/factories.ts and lib/test/wsFactories.ts
 *
 * P077 – Verifies that factory functions produce valid, typed objects.
 */
import { describe, it, expect } from "vitest";
import {
  makeUser,
  makeOAuthUser,
  makeRoom,
  makeMembership,
  makeCommit,
  resetFactorySequence,
} from "./factories";
import {
  makeDrawDelta,
  makeWsCommit,
  makeBranchUpdate,
  makeCursorMessage,
  makeErrorMessage,
} from "./wsFactories";

describe("makeUser", () => {
  it("returns an object with all required User fields", () => {
    const user = makeUser();
    expect(user.id).toMatch(/^usr_\d+$/);
    expect(user.email).toContain("@example.com");
    expect(user.name).toBeTruthy();
    expect(user.passwordHash).toBeTruthy();
    expect(user.emailVerified).toBeNull();
    expect(user.image).toBeNull();
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it("applies overrides", () => {
    const user = makeUser({ email: "custom@example.com", name: "Custom" });
    expect(user.email).toBe("custom@example.com");
    expect(user.name).toBe("Custom");
  });

  it("produces unique IDs on successive calls", () => {
    const u1 = makeUser();
    const u2 = makeUser();
    expect(u1.id).not.toBe(u2.id);
  });

  it("allows an explicit id override", () => {
    const user = makeUser({ id: "usr_fixed" });
    expect(user.id).toBe("usr_fixed");
  });
});

describe("makeOAuthUser", () => {
  it("sets passwordHash to null", () => {
    const user = makeOAuthUser();
    expect(user.passwordHash).toBeNull();
  });
});

describe("makeRoom", () => {
  it("returns an object with all required Room fields", () => {
    const room = makeRoom();
    expect(room.id).toMatch(/^room_\d+$/);
    expect(room.slug).toBeNull();
    expect(room.isPublic).toBe(true);
    expect(room.createdAt).toBeInstanceOf(Date);
    expect(room.updatedAt).toBeInstanceOf(Date);
  });

  it("applies overrides", () => {
    const room = makeRoom({ isPublic: false, slug: "my-room" });
    expect(room.isPublic).toBe(false);
    expect(room.slug).toBe("my-room");
  });
});

describe("makeMembership", () => {
  it("returns a valid RoomMembership", () => {
    const room = makeRoom();
    const user = makeUser();
    const membership = makeMembership(room.id, user.id, "OWNER");
    expect(membership.roomId).toBe(room.id);
    expect(membership.userId).toBe(user.id);
    expect(membership.role).toBe("OWNER");
    expect(membership.joinedAt).toBeInstanceOf(Date);
  });

  it("defaults role to OWNER", () => {
    const membership = makeMembership("room_1", "usr_1");
    expect(membership.role).toBe("OWNER");
  });
});

describe("makeCommit", () => {
  it("returns a valid Commit for the given roomId", () => {
    const commit = makeCommit("room_1");
    expect(commit.roomId).toBe("room_1");
    expect(commit.sha).toMatch(/^sha\d+/);
    expect(commit.branch).toBe("main");
    expect(commit.isMerge).toBe(false);
    expect(commit.storageType).toBe("SNAPSHOT");
    expect(commit.createdAt).toBeInstanceOf(Date);
  });

  it("applies overrides", () => {
    const commit = makeCommit("room_1", { message: "feat: something", branch: "feature" });
    expect(commit.message).toBe("feat: something");
    expect(commit.branch).toBe("feature");
  });
});

describe("resetFactorySequence", () => {
  it("resets the sequence counter so IDs restart from 1", () => {
    resetFactorySequence();
    const u1 = makeUser();
    resetFactorySequence();
    const u2 = makeUser();
    expect(u1.id).toBe(u2.id);
  });
});

describe("wsFactories", () => {
  it("makeDrawDelta returns a draw-delta message", () => {
    const msg = makeDrawDelta();
    expect(msg.type).toBe("draw-delta");
    expect(msg.added).toEqual([]);
    expect(msg.modified).toEqual([]);
    expect(msg.removed).toEqual([]);
  });

  it("makeDrawDelta applies overrides", () => {
    const added = [{ id: "obj1" }];
    const msg = makeDrawDelta({ added });
    expect(msg.added).toEqual(added);
  });

  it("makeWsCommit returns a commit message", () => {
    const msg = makeWsCommit();
    expect(msg.type).toBe("commit");
    expect(msg.sha).toBe("abc12345");
    expect(msg.commit.branch).toBe("main");
  });

  it("makeWsCommit applies overrides", () => {
    const msg = makeWsCommit({ sha: "def67890" });
    expect(msg.sha).toBe("def67890");
  });

  it("makeBranchUpdate returns a branch-update message", () => {
    const msg = makeBranchUpdate();
    expect(msg.type).toBe("branch-update");
    expect(msg.branch).toBe("main");
    expect(msg.headSha).toBe("abc12345");
  });

  it("makeCursorMessage returns a cursor message", () => {
    const msg = makeCursorMessage({ x: 42, y: 84 });
    expect(msg.type).toBe("cursor");
    expect(msg.x).toBe(42);
    expect(msg.y).toBe(84);
  });

  it("makeErrorMessage returns an error message with the given code", () => {
    const msg = makeErrorMessage("ROOM_FULL");
    expect(msg.type).toBe("error");
    expect(msg.code).toBe("ROOM_FULL");
  });
});
