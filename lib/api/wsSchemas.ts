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
  added: z.array(z.record(z.unknown())).max(500),
  modified: z.array(z.record(z.unknown())).max(500),
  removed: z.array(z.string()).max(500),
});

/** Inner commit payload (nested under `commit` field). */
const WsCommitPayloadSchema = z.object({
  parent: z.string().max(MAX_SHA_LEN).nullable().optional(),
  parents: z.array(z.string().max(MAX_SHA_LEN)).max(10).optional(),
  branch,
  message: z.string().min(1).max(MAX_MSG_LEN),
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
  branch,
  headSha: sha,
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
});

export const WsPingSchema = z.object({ type: z.literal("ping") });
export const WsPongSchema = z.object({ type: z.literal("pong") });

export const InboundWsMessageSchema = z.discriminatedUnion("type", [
  WsDrawSchema,
  WsDrawDeltaSchema,
  WsCommitSchema,
  WsBranchUpdateSchema,
  WsCursorSchema,
  WsProfileSchema,
  WsPingSchema,
  WsPongSchema,
]);

export type InboundWsMessage = z.infer<typeof InboundWsMessageSchema>;

export const MAX_WS_PAYLOAD_BYTES = 512 * 1024;
