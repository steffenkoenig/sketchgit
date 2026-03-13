import { z } from "zod";

const MAX_SHA_LEN = 64;
const MAX_BRANCH_LEN = 100;
const MAX_MSG_LEN = 500;
const MAX_CANVAS_BYTES = 512 * 1024; // 512 KB

const sha = z.string().min(8).max(MAX_SHA_LEN);
const branch = z.string().min(1).max(MAX_BRANCH_LEN);

export const WsDrawSchema = z.object({
  type: z.literal("draw"),
  canvas: z.string().min(2).max(MAX_CANVAS_BYTES),
});

export const WsDrawDeltaSchema = z.object({
  type: z.literal("draw-delta"),
  added: z.array(z.record(z.string(), z.unknown())).max(500),
  modified: z.array(z.record(z.string(), z.unknown())).max(500),
  removed: z.array(z.string()).max(500),
});

/** Inner commit payload (nested under `commit` field). */
const WsCommitPayloadSchema = z.object({
  parent: z.string().max(MAX_SHA_LEN).nullable().optional(),
  parents: z.array(z.string().max(MAX_SHA_LEN)).max(10).optional(),
  branch,
  message: z.string().max(MAX_MSG_LEN),
  canvas: z.string().min(2).max(MAX_CANVAS_BYTES),
  isMerge: z.boolean().optional(),
});

/**
 * Commit message as sent by clients:
 * `{ type: 'commit', sha, commit: { branch, message, canvas, ... } }`
 */
export const WsCommitSchema = z.object({
  type: z.literal("commit"),
  sha,
  commit: WsCommitPayloadSchema,
});

export const WsBranchUpdateSchema = z.object({
  type: z.literal("branch-update"),
  /** Null when the client checks out a detached HEAD (commit, not a branch). */
  branch: z.string().min(1).max(MAX_BRANCH_LEN).nullable(),
  headSha: sha,
  /** True when the peer is in detached-HEAD state (commit checkout). */
  detached: z.boolean().optional(),
  /** True when a branch tip has been rolled back to an earlier commit. */
  isRollback: z.boolean().optional(),
});

export const WsCursorSchema = z.object({
  type: z.literal("cursor"),
  x: z.number().finite(),
  y: z.number().finite(),
});

export const WsProfileSchema = z.object({
  type: z.literal("profile"),
  name: z.string().max(100).optional(),
  color: z.string().max(20).optional(),
  // P079 – branch position (optional, backward-compatible)
  branch: z.string().max(MAX_BRANCH_LEN).optional(),
  headSha: z.string().max(MAX_SHA_LEN).optional(),
});

export const WsPingSchema = z.object({ type: z.literal("ping") });
export const WsPongSchema = z.object({ type: z.literal("pong") });

// P067 – object reservation (soft lock)
export const WsObjectLockSchema = z.object({
  type: z.literal("object-lock"),
  objectIds: z.array(z.string().max(64)).max(500),
  color: z.string().max(20).optional(),
});
export const WsObjectUnlockSchema = z.object({
  type: z.literal("object-unlock"),
});

// P080 – presenter follow mode
const vptNumber = z.number().finite();
export const WsViewSyncSchema = z.object({
  type: z.literal("view-sync"),
  vpt: z.tuple([vptNumber, vptNumber, vptNumber, vptNumber, vptNumber, vptNumber]),
  branch: z.string().max(MAX_BRANCH_LEN).optional(),
  headSha: z.string().max(MAX_SHA_LEN).nullish(),
});
export const WsFollowRequestSchema = z.object({ type: z.literal("follow-request") });
export const WsFollowAcceptSchema  = z.object({ type: z.literal("follow-accept") });
export const WsFollowStopSchema    = z.object({ type: z.literal("follow-stop") });

// BUG-005 – fullsync-request was missing, causing the server to reject every
// peer-to-peer canvas state sync request with INVALID_PAYLOAD.
export const WsFullsyncRequestSchema = z.object({
  type: z.literal("fullsync-request"),
  senderId: z.string().max(64).optional(),
});

export const InboundWsMessageSchema = z.discriminatedUnion("type", [
  WsDrawSchema,
  WsDrawDeltaSchema,
  WsCommitSchema,
  WsBranchUpdateSchema,
  WsCursorSchema,
  WsProfileSchema,
  WsPingSchema,
  WsPongSchema,
  WsObjectLockSchema,
  WsObjectUnlockSchema,
  WsViewSyncSchema,
  WsFollowRequestSchema,
  WsFollowAcceptSchema,
  WsFollowStopSchema,
  WsFullsyncRequestSchema,
]);

export type InboundWsMessage = z.infer<typeof InboundWsMessageSchema>;

export const MAX_WS_PAYLOAD_BYTES = 512 * 1024;
