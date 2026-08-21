import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from "@prisma/client";
import type pino from "pino";
import { dbLoadSnapshot } from './dbLoadSnapshot.js';
import * as canvasDelta from '../sketchgit/git/canvasDelta.js';

// Mock replayCanvasDelta so we can force it to throw
vi.mock('../sketchgit/git/canvasDelta.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sketchgit/git/canvasDelta.js')>();
  return {
    ...actual,
    replayCanvasDelta: vi.fn(actual.replayCanvasDelta),
  };
});

describe('dbLoadSnapshot', () => {
  let mockPrisma: any;
  let mockLogger: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {
      commit: { findMany: vi.fn() },
      branch: { findMany: vi.fn() },
      roomState: { findUnique: vi.fn() },
    };

    mockLogger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
  });

  it('returns null if findMany throws an error and logs the error', async () => {
    const error = new Error('Database connection failed');
    mockPrisma.commit.findMany.mockRejectedValue(error);

    const result = await dbLoadSnapshot('room1', mockPrisma as PrismaClient, mockLogger as pino.Logger);

    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith({ roomId: 'room1', err: error }, 'db.loadSnapshot failed');
  });

  it('returns null if no commits are found', async () => {
    mockPrisma.commit.findMany.mockResolvedValue([]);
    mockPrisma.branch.findMany.mockResolvedValue([]);
    mockPrisma.roomState.findUnique.mockResolvedValue(null);

    const result = await dbLoadSnapshot('room1', mockPrisma as PrismaClient, mockLogger as pino.Logger);

    expect(result).toBeNull();
  });

  it('processes SNAPSHOT commits and formats branches and roomState properly', async () => {
    const d1 = new Date('2023-01-01T00:00:00Z');
    const d2 = new Date('2023-01-02T00:00:00Z');
    mockPrisma.commit.findMany.mockResolvedValue([
      { sha: 'sha2', parentSha: 'sha1', parents: ['sha1'], message: 'second', createdAt: d2, storageType: 'SNAPSHOT', canvasJson: { objects: [{ id: 2 }] }, branch: 'main', isMerge: false },
      { sha: 'sha1', parentSha: null, parents: [], message: 'first', createdAt: d1, storageType: 'SNAPSHOT', canvasJson: { objects: [{ id: 1 }] }, branch: 'main', isMerge: false }
    ]);
    mockPrisma.branch.findMany.mockResolvedValue([
      { name: 'main', headSha: 'sha2' }
    ]);
    mockPrisma.roomState.findUnique.mockResolvedValue({
      headBranch: 'main',
      headSha: 'sha2',
      isDetached: false
    });

    const result = await dbLoadSnapshot('room1', mockPrisma as PrismaClient, mockLogger as pino.Logger);

    expect(result).not.toBeNull();
    expect(result?.HEAD).toBe('main');
    expect(result?.detached).toBeNull();
    expect(result?.branches).toEqual({ main: 'sha2' });

    const commitsMap = result?.commits!;
    expect(Object.keys(commitsMap)).toHaveLength(2);

    expect(commitsMap['sha1']).toMatchObject({
      sha: 'sha1',
      parent: null,
      message: 'first',
      canvas: JSON.stringify({ objects: [{ id: 1 }] }),
      branch: 'main',
    });

    expect(commitsMap['sha2']).toMatchObject({
      sha: 'sha2',
      parent: 'sha1',
      message: 'second',
      canvas: JSON.stringify({ objects: [{ id: 2 }] }),
      branch: 'main',
    });
  });

  it('handles detached state correctly', async () => {
    const d1 = new Date();
    mockPrisma.commit.findMany.mockResolvedValue([
      { sha: 'sha1', parentSha: null, parents: [], message: 'first', createdAt: d1, storageType: 'SNAPSHOT', canvasJson: { objects: [] }, branch: 'main', isMerge: false }
    ]);
    mockPrisma.branch.findMany.mockResolvedValue([]);
    mockPrisma.roomState.findUnique.mockResolvedValue({
      headBranch: 'main',
      headSha: 'sha1',
      isDetached: true
    });

    const result = await dbLoadSnapshot('room1', mockPrisma as PrismaClient, mockLogger as pino.Logger);
    expect(result?.detached).toBe('sha1');
  });

  it('handles detached state correctly when headSha is null', async () => {
    const d1 = new Date();
    mockPrisma.commit.findMany.mockResolvedValue([
      { sha: 'sha1', parentSha: null, parents: [], message: 'first', createdAt: d1, storageType: 'SNAPSHOT', canvasJson: { objects: [] }, branch: 'main', isMerge: false }
    ]);
    mockPrisma.branch.findMany.mockResolvedValue([]);
    mockPrisma.roomState.findUnique.mockResolvedValue({
      headBranch: 'main',
      headSha: null,
      isDetached: true
    });

    const result = await dbLoadSnapshot('room1', mockPrisma as PrismaClient, mockLogger as pino.Logger);
    expect(result?.detached).toBeNull();
  });

  it('handles missing headBranch correctly', async () => {
    const d1 = new Date();
    mockPrisma.commit.findMany.mockResolvedValue([
      { sha: 'sha1', parentSha: null, parents: [], message: 'first', createdAt: d1, storageType: 'SNAPSHOT', canvasJson: { objects: [] }, branch: 'main', isMerge: false }
    ]);
    mockPrisma.branch.findMany.mockResolvedValue([]);
    mockPrisma.roomState.findUnique.mockResolvedValue({
      headBranch: null,
      headSha: 'sha1',
      isDetached: false
    });

    const result = await dbLoadSnapshot('room1', mockPrisma as PrismaClient, mockLogger as pino.Logger);
    expect(result?.HEAD).toBe('main');
  });

  it('handles circular JSON fallback for SNAPSHOT commits', async () => {
    const circularObj: any = { objects: [] };
    circularObj.self = circularObj;

    const d1 = new Date();
    mockPrisma.commit.findMany.mockResolvedValue([
      { sha: 'sha1', parentSha: null, parents: [], message: 'first', createdAt: d1, storageType: 'SNAPSHOT', canvasJson: circularObj, branch: 'main', isMerge: false }
    ]);
    mockPrisma.branch.findMany.mockResolvedValue([]);
    mockPrisma.roomState.findUnique.mockResolvedValue(null);

    const result = await dbLoadSnapshot('room1', mockPrisma as PrismaClient, mockLogger as pino.Logger);

    expect(result?.commits['sha1'].canvas).toBe('{"objects":[]}');
  });

  it('processes delta commits normally', async () => {
    const d1 = new Date('2023-01-01T00:00:00Z');
    const d2 = new Date('2023-01-02T00:00:00Z');

    vi.mocked(canvasDelta.replayCanvasDelta).mockReturnValue(JSON.stringify({ objects: [{ id: 'replayed' }] }));

    mockPrisma.commit.findMany.mockResolvedValue([
      { sha: 'sha2', parentSha: 'sha1', parents: ['sha1'], message: 'second', createdAt: d2, storageType: 'DELTA', canvasJson: { delta: true }, branch: 'main', isMerge: false },
      { sha: 'sha1', parentSha: null, parents: [], message: 'first', createdAt: d1, storageType: 'SNAPSHOT', canvasJson: { objects: [{ id: 1 }] }, branch: 'main', isMerge: false }
    ]);
    mockPrisma.branch.findMany.mockResolvedValue([]);
    mockPrisma.roomState.findUnique.mockResolvedValue(null);

    const result = await dbLoadSnapshot('room1', mockPrisma as PrismaClient, mockLogger as pino.Logger);

    expect(canvasDelta.replayCanvasDelta).toHaveBeenCalled();
    expect(result?.commits['sha2'].canvas).toBe(JSON.stringify({ objects: [{ id: 'replayed' }] }));
  });

  it('handles replayCanvasDelta throwing but JSON.stringify succeeding', async () => {
    const d1 = new Date('2023-01-01T00:00:00Z');
    const d2 = new Date('2023-01-02T00:00:00Z');

    vi.mocked(canvasDelta.replayCanvasDelta).mockImplementation(() => {
      throw new Error('Delta error');
    });

    const fallbackObj = { fallback: true };

    mockPrisma.commit.findMany.mockResolvedValue([
      { sha: 'sha2', parentSha: 'sha1', parents: ['sha1'], message: 'second', createdAt: d2, storageType: 'DELTA', canvasJson: fallbackObj, branch: 'main', isMerge: false },
      { sha: 'sha1', parentSha: null, parents: [], message: 'first', createdAt: d1, storageType: 'SNAPSHOT', canvasJson: { objects: [{ id: 1 }] }, branch: 'main', isMerge: false }
    ]);
    mockPrisma.branch.findMany.mockResolvedValue([]);
    mockPrisma.roomState.findUnique.mockResolvedValue(null);

    const result = await dbLoadSnapshot('room1', mockPrisma as PrismaClient, mockLogger as pino.Logger);

    expect(result?.commits['sha2'].canvas).toBe(JSON.stringify(fallbackObj));
  });

  it('handles replayCanvasDelta throwing and JSON.stringify throwing', async () => {
    const d1 = new Date('2023-01-01T00:00:00Z');
    const d2 = new Date('2023-01-02T00:00:00Z');

    vi.mocked(canvasDelta.replayCanvasDelta).mockImplementation(() => {
      throw new Error('Delta error');
    });

    const circularObj: any = {};
    circularObj.self = circularObj;

    mockPrisma.commit.findMany.mockResolvedValue([
      { sha: 'sha2', parentSha: 'sha1', parents: ['sha1'], message: 'second', createdAt: d2, storageType: 'DELTA', canvasJson: circularObj, branch: 'main', isMerge: false },
      { sha: 'sha1', parentSha: null, parents: [], message: 'first', createdAt: d1, storageType: 'SNAPSHOT', canvasJson: { objects: [{ id: 1 }] }, branch: 'main', isMerge: false }
    ]);
    mockPrisma.branch.findMany.mockResolvedValue([]);
    mockPrisma.roomState.findUnique.mockResolvedValue(null);

    const result = await dbLoadSnapshot('room1', mockPrisma as PrismaClient, mockLogger as pino.Logger);

    expect(result?.commits['sha2'].canvas).toBe('{"objects":[]}');
  });
});
