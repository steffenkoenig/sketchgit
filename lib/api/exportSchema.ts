/**
 * lib/api/exportSchema.ts
 *
 * Zod schemas for the canvas export endpoints.
 *
 * Kept in a separate file from the export route handler so that
 * lib/api/openapi.ts can import only this schema without transitively
 * pulling in canvasRenderer (→ fabric/node → jsdom/canvas native modules),
 * which would crash the Next.js build during page-data collection.
 */
import { z } from "zod";

export const ExportQuerySchema = z.object({
  format: z.enum(["png", "svg", "pdf"]).default("png"),
  sha: z.string().max(64).optional(),
  theme: z.enum(["dark", "light"]).default("dark"),
});

/**
 * Schema for POST /api/rooms/[roomId]/export.
 *
 * Accepts the canvas JSON directly from the browser so that the export
 * succeeds even when the room has not yet been persisted to the database
 * (e.g. the first call after a fresh WebSocket connection where dbEnsureRoom
 * failed transiently).  No room lookup is performed; the caller provides
 * the canvas state they are already viewing.
 */
export const ExportBodySchema = z.object({
  canvasJson: z.record(z.string(), z.unknown()).refine(
    (v) => Array.isArray(v["objects"]),
    { message: "canvasJson must contain an 'objects' array" },
  ),
  format: z.enum(["png", "svg", "pdf"]).default("png"),
  theme: z.enum(["dark", "light"]).default("dark"),
});
