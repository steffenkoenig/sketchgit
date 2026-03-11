/**
 * Shared types, interfaces, and constants for SketchGit.
 *
 * All modules import from here rather than from each other,
 * avoiding circular dependency chains.
 */

// ─── Color palettes ───────────────────────────────────────────────────────────

export const BRANCH_COLORS: readonly string[] = [
  '#7c6eff', '#ff5f7e', '#3dd68c', '#f5a623',
  '#38bdf8', '#e879f9', '#fb923c', '#a78bfa',
];

// ─── Merge props tracked for conflict detection ───────────────────────────────

export const MERGE_PROPS: readonly string[] = [
  'stroke', 'fill', 'strokeWidth', 'left', 'top', 'width', 'height',
  'scaleX', 'scaleY', 'angle', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'path', 'text',
  'fontSize', 'fontFamily', 'opacity', 'flipX', 'flipY',
];

// ─── Git model ────────────────────────────────────────────────────────────────

export interface Commit {
  sha: string;
  parent: string | null;
  parents: string[];
  message: string;
  ts: number;
  canvas: string;
  branch: string;
  isMerge: boolean;
}

// ─── 3-way merge ─────────────────────────────────────────────────────────────

export interface ConflictChoice {
  prop: string;
  base: unknown;
  ours: unknown;
  theirs: unknown;
  chosen: 'ours' | 'theirs';
}

export interface MergeConflict {
  id: string;
  label: string;
  oursObj: Record<string, unknown>;
  theirsObj: Record<string, unknown>;
  propConflicts: ConflictChoice[];
  mergedObj: Record<string, unknown>;
}

export interface CleanMergeResult {
  result: string;
  autoMerged: true;
}

export interface ConflictMergeResult {
  conflicts: MergeConflict[];
  cleanObjects: (Record<string, unknown> | null)[];
  baseData: string;
  oursData: string;
  theirsData: string;
  /** Populated by GitModel.merge() before returning. */
  branchNames?: BranchNames;
}

export type MergeResult = CleanMergeResult | ConflictMergeResult;

export interface BranchNames {
  ours: string;
  theirs: string;
  targetBranch: string;
  sourceBranch: string;
  targetSHA: string;
  sourceSHA: string;
}

export interface PendingMerge {
  conflicts: MergeConflict[];
  cleanObjects: (Record<string, unknown> | null)[];
  oursData: string;
  branchNames: BranchNames;
  resolved: boolean;
}

// ─── Real-time collaboration ──────────────────────────────────────────────────

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface PresenceClient {
  clientId: string;
  name: string;
  color: string;
  userId?: string | null;
}

// ─── WebSocket messages ───────────────────────────────────────────────────────

export type WsMessageType =
  | "welcome"
  | "presence"
  | "profile"
  | "draw"
  | "draw-delta"
  | "commit"
  | "cursor"
  | "ping"
  | "pong"
  | "fullsync-request"
  | "fullsync"
  | "user-left"
  | "error";

export interface WsMessage {
  type: WsMessageType;
  [key: string]: unknown;
}
