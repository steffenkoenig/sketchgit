import { describe, it, expect } from "vitest";
import { apiError, ApiErrorCode } from "./errors";

describe("apiError (P068)", () => {
  it("returns a NextResponse with the correct status and body", async () => {
    const res = apiError(ApiErrorCode.NOT_FOUND, "Not found", 404);
    expect(res.status).toBe(404);
    const body = await res.json() as { code: string; message: string };
    expect(body.code).toBe("NOT_FOUND");
    expect(body.message).toBe("Not found");
  });

  it("omits details when not provided", async () => {
    const res = apiError(ApiErrorCode.UNAUTHENTICATED, "Unauth", 401);
    const body = await res.json() as { details?: unknown };
    expect(body.details).toBeUndefined();
  });

  it("includes details when provided", async () => {
    const details = [{ field: "email", message: "Invalid" }];
    const res = apiError(ApiErrorCode.VALIDATION_ERROR, "Bad", 422, details);
    const body = await res.json() as { details: unknown[] };
    expect(body.details).toEqual(details);
  });

  it("sets Content-Type to application/json", () => {
    const res = apiError(ApiErrorCode.INTERNAL_ERROR, "Oops", 500);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("covers all code constants", () => {
    // Every code in ApiErrorCode must be a non-empty string
    for (const code of Object.values(ApiErrorCode)) {
      expect(typeof code).toBe("string");
      expect(code.length).toBeGreaterThan(0);
    }
  });
});
