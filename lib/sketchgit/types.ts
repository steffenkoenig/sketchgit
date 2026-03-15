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
  'strokeDashArray', 'strokeLineCap', 'strokeLineJoin',
  '_fillPattern', '_fillColor', '_link', '_arrowHeadStart', '_arrowHeadEnd', '_arrowType',
  '_attachedFrom', '_attachedTo', '_sloppiness', '_origGeom',
  // Mermaid diagram content and type flag – compared line-by-line during merge
  '_isMermaid', '_mermaidCode',
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

/**
 * Per-line conflict detail for `_mermaidCode` properties.
 * Produced by `computeMermaidLineMergeDetails()` and attached to a
 * `ConflictChoice` so the merge UI can show each conflicting line
 * individually rather than presenting the whole code string as one choice.
 */
export interface MermaidLineConflict {
  /** 1-based line number in the original diagram code (for display). */
  lineNumber: number;
  /** The original base line (undefined when both sides inserted a new line). */
  base: string | undefined;
  /** Our version of the line (undefined = we deleted the line). */
  ours: string | undefined;
  /** Their version of the line (undefined = they deleted the line). */
  theirs: string | undefined;
  chosen: 'ours' | 'theirs';
}

export interface ConflictChoice {
  prop: string;
  base: unknown;
  ours: unknown;
  theirs: unknown;
  chosen: 'ours' | 'theirs';
  /**
   * Only set for `_mermaidCode` conflicts.
   * Each entry corresponds to one line that both sides changed differently.
   */
  mermaidLineConflicts?: MermaidLineConflict[];
  /**
   * Only set for `_mermaidCode` conflicts.
   * The auto-resolved merged lines.  `null` at each position that has a
   * corresponding entry in `mermaidLineConflicts` (to be filled by the user).
   */
  mermaidPartialLines?: (string | null)[];
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
  /** P079 – The branch this client currently has checked out. */
  branch?: string;
  /** P079 – The HEAD SHA for this client's current branch tip. */
  headSha?: string | null;
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
  | "error"
  | "shutdown-warning"
  | "branch-update"
  // P067 – object reservation (soft lock)
  | "object-lock"
  | "object-unlock"
  // P080 – presenter follow mode
  | "follow-request"
  | "follow-accept"
  | "follow-stop"
  | "view-sync";

export interface WsMessage {
  type: WsMessageType;
  [key: string]: unknown;
}

/**
 * P080 – Fabric.js canvas viewport affine transform:
 * [scaleX, skewY, skewX, scaleY, translateX, translateY]
 */
export type ViewportTransform = [number, number, number, number, number, number];
