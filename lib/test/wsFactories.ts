/**
 * Test data factories for WebSocket messages.
 *
 * Usage:
 *   import { makeDrawDelta, makeWsCommit, makeBranchUpdate } from '@/lib/test/wsFactories';
 *   const msg = makeDrawDelta('client_1');
 *
 * P077 – WebSocket message factories to complement the Prisma model factories.
 */

import type { WsMessage } from "@/lib/sketchgit/types";

// ─── draw-delta ───────────────────────────────────────────────────────────────

export interface DrawDeltaMessage extends WsMessage {
  type: "draw-delta";
  added: Record<string, unknown>[];
  modified: Record<string, unknown>[];
  removed: string[];
}

export function makeDrawDelta(
  overrides: Partial<DrawDeltaMessage> = {},
): DrawDeltaMessage {
  return {
    type: "draw-delta",
    added: [],
    modified: [],
    removed: [],
    ...overrides,
  };
}

// ─── commit ───────────────────────────────────────────────────────────────────

export interface WsCommitPayload {
  parent?: string | null;
  parents?: string[];
  branch: string;
  message: string;
  canvas: string;
  isMerge?: boolean;
}

export interface WsCommitMessage extends WsMessage {
  type: "commit";
  sha: string;
  commit: WsCommitPayload;
}

export function makeWsCommit(
  overrides: Partial<WsCommitMessage> = {},
): WsCommitMessage {
  return {
    type: "commit",
    sha: "abc12345",
    commit: {
      parent: null,
      branch: "main",
      message: "Test commit",
      canvas: '{"objects":[]}',
      isMerge: false,
    },
    ...overrides,
  };
}

// ─── branch-update ────────────────────────────────────────────────────────────

export interface BranchUpdateMessage extends WsMessage {
  type: "branch-update";
  branch: string | null;
  headSha: string;
  detached?: boolean;
  isRollback?: boolean;
}

export function makeBranchUpdate(
  overrides: Partial<BranchUpdateMessage> = {},
): BranchUpdateMessage {
  return {
    type: "branch-update",
    branch: "main",
    headSha: "abc12345",
    detached: false,
    isRollback: false,
    ...overrides,
  };
}

// ─── cursor ───────────────────────────────────────────────────────────────────

export interface CursorMessage extends WsMessage {
  type: "cursor";
  x: number;
  y: number;
}

export function makeCursorMessage(
  overrides: Partial<CursorMessage> = {},
): CursorMessage {
  return {
    type: "cursor",
    x: 100,
    y: 200,
    ...overrides,
  };
}

// ─── error ────────────────────────────────────────────────────────────────────

export interface ErrorMessage extends WsMessage {
  type: "error";
  code: string;
  message?: string;
  reason?: string;
}

export function makeErrorMessage(
  code: string,
  overrides: Partial<ErrorMessage> = {},
): ErrorMessage {
  return {
    type: "error",
    code,
    ...overrides,
  };
}
