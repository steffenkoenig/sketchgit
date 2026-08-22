import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

vi.mock("@/lib/db/featureFlagRepository", () => ({
  createFeatureFlag: vi.fn(),
  listFeatureFlags: vi.fn(),
}));

import { POST, GET } from "./route";
import { createFeatureFlag, listFeatureFlags } from "@/lib/db/featureFlagRepository";
import { NextRequest } from "next/server";
import { makeFeatureFlag } from "@/lib/test/factories";

const mockCreate = createFeatureFlag as ReturnType<typeof vi.fn>;
const mockList = listFeatureFlags as ReturnType<typeof vi.fn>;

const ADMIN_SECRET = "a".repeat(32);

function makeRequest(method: string, body?: object, secret: string | null = ADMIN_SECRET) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["x-admin-secret"] = secret;
  return new NextRequest("http://localhost/api/admin/feature-flags", {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("POST /api/admin/feature-flags", () => {
  const originalSecret = process.env.ADMIN_API_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_API_SECRET = ADMIN_SECRET;
  });

  afterAll(() => {
    process.env.ADMIN_API_SECRET = originalSecret;
  });

  it("returns 403 without the admin secret header", async () => {
    const res = await POST(makeRequest("POST", { name: "new-flag" }, null));
    expect(res.status).toBe(403);
  });

  it("returns 403 with the wrong admin secret", async () => {
    const res = await POST(makeRequest("POST", { name: "new-flag" }, "wrong-secret-wrong-secret-wrong"));
    expect(res.status).toBe(403);
  });

  it("returns 422 for an invalid name", async () => {
    const res = await POST(makeRequest("POST", { name: "Not Kebab Case!" }));
    expect(res.status).toBe(422);
  });

  it("creates a new flag with valid admin secret and body", async () => {
    mockCreate.mockResolvedValue(makeFeatureFlag({ name: "new-flag" }));
    const res = await POST(makeRequest("POST", { name: "new-flag", description: "test" }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith("new-flag", "test", false, {});
  });

  it("returns 409 when the flag name already exists", async () => {
    mockCreate.mockRejectedValue(new Error("Unique constraint failed"));
    const res = await POST(makeRequest("POST", { name: "dup-flag" }));
    expect(res.status).toBe(409);
  });
});

describe("GET /api/admin/feature-flags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_API_SECRET = ADMIN_SECRET;
  });

  it("returns 403 without the admin secret header", async () => {
    const res = await GET(makeRequest("GET", undefined, null));
    expect(res.status).toBe(403);
  });

  it("lists all flags with a valid admin secret", async () => {
    mockList.mockResolvedValue([makeFeatureFlag({ name: "a" }), makeFeatureFlag({ name: "b" })]);
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const json = await res.json() as { flags: unknown[] };
    expect(json.flags).toHaveLength(2);
  });
});
