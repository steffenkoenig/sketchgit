/**
 * lib/api/openapi.ts
 *
 * P062 – Build an OpenAPI 3.1 specification from the existing Zod validation
 * schemas.  Schemas are the single source of truth; the spec is always in
 * sync with the actual validation logic.
 *
 * Uses Zod v4's native `z.toJSONSchema()` to convert schemas — no extra
 * package required.
 *
 * This module is server-only and is not bundled into any client chunk.
 */
import { z } from "zod";
import type { ZodType } from "zod";
import { ApiErrorCode } from "@/lib/api/errors";
import { RegisterSchema } from "@/app/api/auth/register/route";
import { ResetPasswordSchema } from "@/app/api/auth/reset-password/route";
import { PatchRoomSchema } from "@/app/api/rooms/[roomId]/route";
import { CommitsQuerySchema } from "@/app/api/rooms/[roomId]/commits/route";
import { ExportQuerySchema } from "@/lib/api/exportSchema";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert a Zod schema to a JSON Schema object, stripping the `$schema` key. */
function schema(zSchema: ZodType): object {
  // z.toJSONSchema() signature uses $ZodRegistry which is an internal Zod v4 type
  // not exported through the public ZodType interface.  Cast through unknown first.
  const result = z.toJSONSchema(zSchema as unknown as Parameters<typeof z.toJSONSchema>[0]) as Record<string, unknown>;
  const { $schema: _, ...rest } = result;
  return rest;
}

/** Shared error response body (P068). */
const ApiErrorSchema = {
  type: "object",
  required: ["code", "message"],
  properties: {
    code: {
      type: "string",
      enum: Object.values(ApiErrorCode),
      description: "Machine-readable error code.",
    },
    message: {
      type: "string",
      description: "Human-readable description (for logging/debugging).",
    },
    details: {
      description: "Optional structured context (e.g. Zod validation issues).",
    },
  },
} as const;

function errorResponse(description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ApiError" },
      },
    },
  };
}

// ─── OpenAPI document ─────────────────────────────────────────────────────────

export function buildOpenApiSpec(): object {
  return {
    openapi: "3.1.0",
    info: {
      title: "SketchGit API",
      version: "1.0.0",
      description:
        "REST API for the SketchGit collaborative canvas application.\n\n" +
        "All error responses use the `ApiError` schema: " +
        "`{ code, message, details? }` (P068).",
    },
    servers: [{ url: process.env.NEXTAUTH_URL ?? "http://localhost:3000" }],
    components: {
      schemas: {
        ApiError: ApiErrorSchema,
        RegisterRequest: schema(RegisterSchema),
        ResetPasswordRequest: schema(ResetPasswordSchema),
        PatchRoomRequest: schema(PatchRoomSchema),
        CommitsQuery: schema(CommitsQuerySchema),
        ExportQuery: schema(ExportQuerySchema),
      },
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "authjs.session-token",
          description: "NextAuth v5 session cookie.",
        },
      },
    },
    paths: {
      "/api/auth/register": {
        post: {
          operationId: "registerUser",
          summary: "Register a new user account",
          tags: ["Auth"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RegisterRequest" },
              },
            },
          },
          responses: {
            "201": { description: "User created." },
            "400": errorResponse("Invalid JSON body."),
            "409": errorResponse("Email address already in use."),
            "422": errorResponse("Validation error – see details."),
          },
        },
      },

      "/api/auth/forgot-password": {
        post: {
          operationId: "forgotPassword",
          summary: "Request a password-reset email",
          description:
            "Always returns 200 to prevent email-enumeration attacks (P054).",
          tags: ["Auth"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email"],
                  properties: { email: { type: "string", format: "email" } },
                },
              },
            },
          },
          responses: { "200": { description: "Email queued (if address exists)." } },
        },
      },

      "/api/auth/reset-password": {
        post: {
          operationId: "resetPassword",
          summary: "Complete a password reset",
          tags: ["Auth"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ResetPasswordRequest" },
              },
            },
          },
          responses: {
            "200": { description: "Password updated." },
            "400": errorResponse("Invalid or expired token."),
            "422": errorResponse("Validation error."),
          },
        },
      },

      "/api/auth/account": {
        delete: {
          operationId: "deleteAccount",
          summary: "Delete the authenticated user's account (GDPR erasure)",
          tags: ["Auth"],
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: false,
            description:
              "Credentials-provider users must supply their current password.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { password: { type: "string", format: "password" } },
                },
              },
            },
          },
          responses: {
            "200": { description: "Account deleted; session cookie cleared." },
            "400": errorResponse("Password required for credentials accounts."),
            "401": errorResponse("Not authenticated."),
            "403": errorResponse("Incorrect password."),
          },
        },
      },

      "/api/rooms/{roomId}": {
        patch: {
          operationId: "patchRoom",
          summary: "Update room metadata (slug)",
          tags: ["Rooms"],
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              name: "roomId",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Room ID or slug.",
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PatchRoomRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Room updated.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      slug: { type: "string", nullable: true },
                    },
                  },
                },
              },
            },
            "401": errorResponse("Not authenticated."),
            "403": errorResponse("Caller is not the room owner."),
            "404": errorResponse("Room not found."),
            "409": errorResponse("Slug already taken."),
            "422": errorResponse("Slug format invalid."),
          },
        },
      },

      "/api/rooms/{roomId}/commits": {
        get: {
          operationId: "listCommits",
          summary: "Paginated commit history for a room",
          tags: ["Rooms"],
          parameters: [
            { name: "roomId", in: "path", required: true, schema: { type: "string" } },
            {
              name: "cursor",
              in: "query",
              required: false,
              schema: { type: "string", maxLength: 64 },
              description: "SHA cursor for cursor-based pagination.",
            },
            {
              name: "take",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
          ],
          responses: {
            "200": {
              description: "Commit page.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      commits: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            sha: { type: "string" },
                            parent: { type: "string", nullable: true },
                            branch: { type: "string" },
                            message: { type: "string" },
                            ts: { type: "integer", description: "Unix ms timestamp." },
                            isMerge: { type: "boolean" },
                          },
                        },
                      },
                      nextCursor: { type: "string", nullable: true },
                    },
                  },
                },
              },
            },
            "401": errorResponse("Not authenticated (private room)."),
            "404": errorResponse("Room not found."),
          },
        },
      },

      "/api/rooms/{roomId}/export": {
        get: {
          operationId: "exportCanvas",
          summary: "Export room canvas as PNG or SVG",
          tags: ["Rooms"],
          parameters: [
            { name: "roomId", in: "path", required: true, schema: { type: "string" } },
            {
              name: "format",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["png", "svg"], default: "png" },
            },
            {
              name: "sha",
              in: "query",
              required: false,
              schema: { type: "string", maxLength: 64 },
              description: "Commit SHA to export. Omit for latest HEAD.",
            },
          ],
          responses: {
            "200": {
              description: "Binary image.",
              content: {
                "image/png": { schema: { type: "string", format: "binary" } },
                "image/svg+xml": { schema: { type: "string", format: "binary" } },
              },
            },
            "304": { description: "Not Modified (ETag matched)." },
            "401": errorResponse("Not authenticated (private room)."),
            "404": errorResponse("Room or commit not found."),
            "422": errorResponse("Invalid query parameters."),
          },
        },
      },
    },
  };
}
