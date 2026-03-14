/**
 * lib/api/exportSchema.ts
 *
 * Zod schema for the canvas export query parameters.
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
