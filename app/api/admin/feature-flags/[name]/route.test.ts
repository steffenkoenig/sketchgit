import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

vi.mock("@/lib/db/featureFlagRepository", () => ({
  getFeatureFlag: vi.fn(),
  updateFeatureFlag: vi.fn(),
}));
vi.mock("@/lib/server/featureFlags", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/featureFlags")>("@/lib/server/featureFlags");
  return { ...actual, invalidateFeatureFlagCache: vi.fn() };
});

import { GET, PATCH } from "./route";
import { getFeatureFlag, updateFeatureFlag } from "@/lib/db/featureFlagRepository";
import { invalidateFeatureFlagCache } from "@/lib/server/featureFlags";
import { NextRequest } from "next/server";
import { makeFeatureFlag } from "@/lib/test/factories";

const mockGet = getFeatureFlag as ReturnType<typeof vi.fn>;
const mockUpdate = updateFeatureFlag as ReturnType<typeof vi.fn>;
const mockInvalidate = invalidateFeatureFlagCache as ReturnType<typeof vi.fn>;

const ADMIN_SECRET = "a".repeat(32);
const originalSecret = process.env.ADMIN_API_SECRET;

function makeRequest(method: string, body?: object, secret: string | null = ADMIN_SECRET) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["x-admin-secret"] = secret;
  return new NextRequest("http://localhost/api/admin/feature-flags/my-flag", {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const params = Promise.resolve({ name: "my-flag" });

describe("GET /api/admin/feature-flags/[name]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_API_SECRET = ADMIN_SECRET;
  });
  afterAll(() => { process.env.ADMIN_API_SECRET = originalSecret; });

  it("returns 403 without the admin secret header", async () => {
    const res = await GET(makeRequest("GET", undefined, null), { params });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the flag doesn't exist", async () => {
    mockGet.mockResolvedValue(null);
    const res = await GET(makeRequest("GET"), { params });
    expect(res.status).toBe(404);
  });

  it("returns the flag when it exists", async () => {
    mockGet.mockResolvedValue(makeFeatureFlag({ name: "my-flag" }));
    const res = await GET(makeRequest("GET"), { params });
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/admin/feature-flags/[name]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_API_SECRET = ADMIN_SECRET;
  });

  it("returns 403 without the admin secret header", async () => {
    const res = await PATCH(makeRequest("PATCH", { enabled: true }, null), { params });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the flag doesn't exist", async () => {
    mockUpdate.mockResolvedValue(null);
    const res = await PATCH(makeRequest("PATCH", { enabled: true }), { params });
    expect(res.status).toBe(404);
  });

  it("enables an existing flag and invalidates its cache entry", async () => {
    mockUpdate.mockResolvedValue(makeFeatureFlag({ name: "my-flag", enabled: true }));
    const res = await PATCH(makeRequest("PATCH", { enabled: true }), { params });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith("my-flag", { enabled: true });
    expect(mockInvalidate).toHaveBeenCalledWith("my-flag");
  });
});
