/**
 * Tests for GET /api/templates/export (P095 — GDPR data portability)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/authTypes", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db/templateRepository", () => ({
  getAllShapeTemplatesForExport: vi.fn(),
}));

import { GET } from "./route";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { getAllShapeTemplatesForExport } from "@/lib/db/templateRepository";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockGetAuthSession = getAuthSession as ReturnType<typeof vi.fn>;
const mockGetAll = getAllShapeTemplatesForExport as ReturnType<typeof vi.fn>;

const SESSION = { user: { id: "usr_1", email: "a@b.com" } };

describe("GET /api/templates/export", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    mockGetAuthSession.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns a downloadable JSON file scoped to the caller's templates", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockGetAuthSession.mockReturnValue(SESSION);
    mockGetAll.mockResolvedValue([
      { id: "tpl_1", userId: "usr_1", name: "A", canvasJson: { objects: [] }, createdAt: new Date(), updatedAt: new Date() },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(mockGetAll).toHaveBeenCalledWith("usr_1");
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    const body = (await res.json()) as { templates: Array<{ name: string }> };
    expect(body.templates).toHaveLength(1);
    expect(body.templates[0].name).toBe("A");
  });
});
