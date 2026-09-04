/* eslint-disable max-lines-per-function */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { dbLoadSnapshot } from "./dbLoadSnapshot.js";
import type { PrismaClient } from "@prisma/client";
import type pino from "pino";
import { replayCanvasDelta } from "../sketchgit/git/canvasDelta.js";

vi.mock("../sketchgit/git/canvasDelta.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import('../sketchgit/git/canvasDelta.js')>();
  return {
    ...mod,
    replayCanvasDelta: vi.fn(mod.replayCanvasDelta),
  };
});

describe("dbLoadSnapshot", () => {
  let prismaMock: any;
  let loggerMock: any;

  beforeEach(() => {
    prismaMock = {
      commit: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      branch: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      roomState: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    loggerMock = {
      error: vi.fn(),
    };

    vi.clearAllMocks();
  });

  it("should return null if no commits are found", async () => {
    const result = await dbLoadSnapshot("room1", prismaMock as PrismaClient, loggerMock as pino.Logger);
    expect(result).toBeNull();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it("should return null and log error if a DB query throws", async () => {
    const error = new Error("DB Error");
    prismaMock.commit.findMany.mockRejectedValue(error);

    const result = await dbLoadSnapshot("room1", prismaMock as PrismaClient, loggerMock as pino.Logger);
    expect(result).toBeNull();
    expect(loggerMock.error).toHaveBeenCalledWith({ roomId: "room1", err: error }, "db.loadSnapshot failed");
  });

  it("should load snapshot correctly with SNAPSHOT commit", async () => {
    const date = new Date();
    prismaMock.commit.findMany.mockResolvedValue([
      {
        sha: "sha1",
        parentSha: null,
        parents: [],
        message: "init",
        createdAt: date,
        storageType: "SNAPSHOT",
        canvasJson: { objects: [{ type: "rect" }] },
        branch: "main",
        isMerge: false,
      }
    ]);
    prismaMock.branch.findMany.mockResolvedValue([
      { name: "main", headSha: "sha1" }
    ]);
    prismaMock.roomState.findUnique.mockResolvedValue({
      headBranch: "main",
      isDetached: false,
      headSha: "sha1",
    });

    const result = await dbLoadSnapshot("room1", prismaMock as PrismaClient, loggerMock as pino.Logger);

    expect(result).toEqual({
      commits: {
        "sha1": {
          sha: "sha1",
          parent: null,
          parents: [],
          message: "init",
          ts: date.getTime(),
          canvas: JSON.stringify({ objects: [{ type: "rect" }] }),
          branch: "main",
          isMerge: false,
        }
      },
      branches: {
        "main": "sha1"
      },
      HEAD: "main",
      detached: null
    });
  });

  it("should load snapshot correctly with DELTA commit", async () => {
    const date1 = new Date();
    const date2 = new Date(date1.getTime() + 1000);

    // Commits come in desc order
    prismaMock.commit.findMany.mockResolvedValue([
      {
        sha: "sha2",
        parentSha: "sha1",
        parents: ["sha1"],
        message: "second",
        createdAt: date2,
        storageType: "DELTA",
        canvasJson: { added: [], modified: [], removed: [] }, // delta
        branch: "main",
        isMerge: false,
      },
      {
        sha: "sha1",
        parentSha: null,
        parents: [],
        message: "init",
        createdAt: date1,
        storageType: "SNAPSHOT",
        canvasJson: { objects: [{ type: "rect" }] },
        branch: "main",
        isMerge: false,
      }
    ]);

    vi.mocked(replayCanvasDelta).mockImplementation(() => {
        return '{"objects":[{"type":"rect"},{"type":"circle"}]}';
    });

    const result = await dbLoadSnapshot("room1", prismaMock as PrismaClient, loggerMock as pino.Logger);

    expect(result).toBeDefined();
    expect(result?.commits["sha2"].canvas).toBe('{"objects":[{"type":"rect"},{"type":"circle"}]}');

    // Ensure replayCanvasDelta was called with the parent's canvas
    expect(replayCanvasDelta).toHaveBeenCalledWith(
        JSON.stringify({ objects: [{ type: "rect" }] }),
        { added: [], modified: [], removed: [] }
    );
  });

  it("should fallback to stringify canvasJson if replayCanvasDelta throws", async () => {
    const date1 = new Date();
    const date2 = new Date(date1.getTime() + 1000);

    prismaMock.commit.findMany.mockResolvedValue([
      {
        sha: "sha2",
        parentSha: "sha1",
        parents: ["sha1"],
        message: "second",
        createdAt: date2,
        storageType: "DELTA",
        canvasJson: { fallback: "data" },
        branch: "main",
        isMerge: false,
      },
      {
        sha: "sha1",
        parentSha: null,
        parents: [],
        message: "init",
        createdAt: date1,
        storageType: "SNAPSHOT",
        canvasJson: { objects: [] },
        branch: "main",
        isMerge: false,
      }
    ]);

    vi.mocked(replayCanvasDelta).mockImplementation(() => {
        throw new Error("Delta fail");
    });

    const result = await dbLoadSnapshot("room1", prismaMock as PrismaClient, loggerMock as pino.Logger);

    expect(result).toBeDefined();
    expect(result?.commits["sha2"].canvas).toBe('{"fallback":"data"}');
  });

  it("should fallback to empty objects if replayCanvasDelta and stringify both throw", async () => {
    const date1 = new Date();
    const date2 = new Date(date1.getTime() + 1000);

    const circularObj: any = {};
    circularObj.self = circularObj;

    prismaMock.commit.findMany.mockResolvedValue([
      {
        sha: "sha2",
        parentSha: "sha1",
        parents: ["sha1"],
        message: "second",
        createdAt: date2,
        storageType: "DELTA",
        canvasJson: circularObj,
        branch: "main",
        isMerge: false,
      },
      {
        sha: "sha1",
        parentSha: null,
        parents: [],
        message: "init",
        createdAt: date1,
        storageType: "SNAPSHOT",
        canvasJson: { objects: [] },
        branch: "main",
        isMerge: false,
      }
    ]);

    vi.mocked(replayCanvasDelta).mockImplementation(() => {
        throw new Error("Delta fail");
    });

    const result = await dbLoadSnapshot("room1", prismaMock as PrismaClient, loggerMock as pino.Logger);

    expect(result).toBeDefined();
    expect(result?.commits["sha2"].canvas).toBe('{"objects":[]}');
  });

  it("should fallback to empty objects if SNAPSHOT canvasJson stringify throws", async () => {
    const date1 = new Date();

    const circularObj: any = {};
    circularObj.self = circularObj;

    prismaMock.commit.findMany.mockResolvedValue([
      {
        sha: "sha1",
        parentSha: null,
        parents: [],
        message: "init",
        createdAt: date1,
        storageType: "SNAPSHOT",
        canvasJson: circularObj,
        branch: "main",
        isMerge: false,
      }
    ]);

    const result = await dbLoadSnapshot("room1", prismaMock as PrismaClient, loggerMock as pino.Logger);

    expect(result).toBeDefined();
    expect(result?.commits["sha1"].canvas).toBe('{"objects":[]}');
  });

  it("should handle detached HEAD state", async () => {
    const date = new Date();
    prismaMock.commit.findMany.mockResolvedValue([
      {
        sha: "sha1",
        parentSha: null,
        parents: [],
        message: "init",
        createdAt: date,
        storageType: "SNAPSHOT",
        canvasJson: { objects: [] },
        branch: "main",
        isMerge: false,
      }
    ]);
    prismaMock.roomState.findUnique.mockResolvedValue({
      headBranch: "main",
      isDetached: true,
      headSha: "sha1",
    });

    const result = await dbLoadSnapshot("room1", prismaMock as PrismaClient, loggerMock as pino.Logger);

    expect(result?.detached).toBe("sha1");
  });

  it("should default HEAD to main if headBranch is undefined", async () => {
    const date = new Date();
    prismaMock.commit.findMany.mockResolvedValue([
      {
        sha: "sha1",
        parentSha: null,
        parents: [],
        message: "init",
        createdAt: date,
        storageType: "SNAPSHOT",
        canvasJson: { objects: [] },
        branch: "main",
        isMerge: false,
      }
    ]);
    prismaMock.roomState.findUnique.mockResolvedValue(null); // no state

    const result = await dbLoadSnapshot("room1", prismaMock as PrismaClient, loggerMock as pino.Logger);

    expect(result?.HEAD).toBe("main");
    expect(result?.detached).toBeNull();
  });

  it("should handle DELTA commit when parent canvas is missing from cache", async () => {
    const date1 = new Date();

    // Simulate finding only the DELTA commit without its SNAPSHOT parent in the database
    // This could happen if a limit (take: 100) causes the parent to not be fetched
    prismaMock.commit.findMany.mockResolvedValue([
      {
        sha: "sha2",
        parentSha: "sha1",
        parents: ["sha1"],
        message: "second",
        createdAt: date1,
        storageType: "DELTA",
        canvasJson: { added: [], modified: [], removed: [] },
        branch: "main",
        isMerge: false,
      }
    ]);

    vi.mocked(replayCanvasDelta).mockImplementation(() => {
        return '{"objects":[{"type":"rect"}]}';
    });

    const result = await dbLoadSnapshot("room1", prismaMock as PrismaClient, loggerMock as pino.Logger);

    expect(result).toBeDefined();
    expect(result?.commits["sha2"].canvas).toBe('{"objects":[{"type":"rect"}]}');

    // Ensure replayCanvasDelta was called with the default fallback parent canvas
    expect(replayCanvasDelta).toHaveBeenCalledWith(
        '{"objects":[]}',
        { added: [], modified: [], removed: [] }
    );
  });

  it("should return null and log error if branch.findMany query throws", async () => {
    const error = new Error("DB Error Branch");
    prismaMock.commit.findMany.mockResolvedValue([
      {
        sha: "sha1",
        parentSha: null,
        parents: [],
        message: "init",
        createdAt: new Date(),
        storageType: "SNAPSHOT",
        canvasJson: { objects: [{ type: "rect" }] },
        branch: "main",
        isMerge: false,
      }
    ]);
    prismaMock.branch.findMany.mockRejectedValue(error);

    const result = await dbLoadSnapshot("room1", prismaMock as PrismaClient, loggerMock as pino.Logger);
    expect(result).toBeNull();
    expect(loggerMock.error).toHaveBeenCalledWith({ roomId: "room1", err: error }, "db.loadSnapshot failed");
  });

  it("should return null and log error if roomState.findUnique query throws", async () => {
    const error = new Error("DB Error RoomState");
    prismaMock.commit.findMany.mockResolvedValue([
      {
        sha: "sha1",
        parentSha: null,
        parents: [],
        message: "init",
        createdAt: new Date(),
        storageType: "SNAPSHOT",
        canvasJson: { objects: [{ type: "rect" }] },
        branch: "main",
        isMerge: false,
      }
    ]);
    prismaMock.roomState.findUnique.mockRejectedValue(error);

    const result = await dbLoadSnapshot("room1", prismaMock as PrismaClient, loggerMock as pino.Logger);
    expect(result).toBeNull();
    expect(loggerMock.error).toHaveBeenCalledWith({ roomId: "room1", err: error }, "db.loadSnapshot failed");
  });

});
