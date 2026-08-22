/**
 * Tests for /api/templates/[id] (P095)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/authTypes", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db/templateRepository", () => ({
  getShapeTemplate: vi.fn(),
  deleteShapeTemplate: vi.fn(),
}));

import { GET, DELETE } from "./route";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { getShapeTemplate, deleteShapeTemplate } from "@/lib/db/templateRepository";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockGetAuthSession = getAuthSession as ReturnType<typeof vi.fn>;
const mockGet = getShapeTemplate as ReturnType<typeof vi.fn>;
const mockDelete = deleteShapeTemplate as ReturnType<typeof vi.fn>;

const SESSION = { user: { id: "usr_1", email: "a@b.com" } };
const PARAMS = Promise.resolve({ id: "tpl_1" });

describe("GET /api/templates/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    mockGetAuthSession.mockReturnValue(null);
    const res = await GET(new NextRequest("http://localhost/api/templates/tpl_1"), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the template doesn't exist or belongs to another user", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockGetAuthSession.mockReturnValue(SESSION);
    mockGet.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/templates/tpl_1"), { params: PARAMS });
    expect(res.status).toBe(404);
  });

  it("returns the template", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockGetAuthSession.mockReturnValue(SESSION);
    mockGet.mockResolvedValue({ id: "tpl_1", userId: "usr_1", name: "A", canvasJson: { objects: [] } });
    const res = await GET(new NextRequest("http://localhost/api/templates/tpl_1"), { params: PARAMS });
    expect(res.status).toBe(200);
    expect(mockGet).toHaveBeenCalledWith("usr_1", "tpl_1");
  });
});

describe("DELETE /api/templates/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    mockGetAuthSession.mockReturnValue(null);
    const res = await DELETE(new NextRequest("http://localhost/api/templates/tpl_1"), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 404 when nothing was deleted", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockGetAuthSession.mockReturnValue(SESSION);
    mockDelete.mockResolvedValue(false);
    const res = await DELETE(new NextRequest("http://localhost/api/templates/tpl_1"), { params: PARAMS });
    expect(res.status).toBe(404);
  });

  it("deletes the template", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockGetAuthSession.mockReturnValue(SESSION);
    mockDelete.mockResolvedValue(true);
    const res = await DELETE(new NextRequest("http://localhost/api/templates/tpl_1"), { params: PARAMS });
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith("usr_1", "tpl_1");
  });
});
