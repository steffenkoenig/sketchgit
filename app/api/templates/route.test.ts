/**
 * Tests for /api/templates (P095)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/authTypes", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db/templateRepository", () => ({
  createShapeTemplate: vi.fn(),
  listShapeTemplates: vi.fn(),
}));
vi.mock("@/lib/export/canvasRenderer", () => ({
  renderShapeTemplateThumbnail: vi.fn(),
}));

import { GET, POST } from "./route";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { createShapeTemplate, listShapeTemplates } from "@/lib/db/templateRepository";
import { renderShapeTemplateThumbnail } from "@/lib/export/canvasRenderer";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockGetAuthSession = getAuthSession as ReturnType<typeof vi.fn>;
const mockCreate = createShapeTemplate as ReturnType<typeof vi.fn>;
const mockList = listShapeTemplates as ReturnType<typeof vi.fn>;
const mockRender = renderShapeTemplateThumbnail as ReturnType<typeof vi.fn>;

const SESSION = { user: { id: "usr_1", email: "a@b.com" } };

function makePostReq(body: unknown) {
  return new NextRequest("http://localhost/api/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/templates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    mockGetAuthSession.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("lists the caller's templates", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockGetAuthSession.mockReturnValue(SESSION);
    mockList.mockResolvedValue([{ id: "tpl_1", name: "A", hasThumbnail: true }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith("usr_1");
    const body = (await res.json()) as { templates: unknown[] };
    expect(body.templates).toHaveLength(1);
  });
});

describe("POST /api/templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION);
    mockGetAuthSession.mockReturnValue(SESSION);
    mockList.mockResolvedValue([]);
    mockRender.mockResolvedValue(Buffer.from([1, 2, 3]));
    mockCreate.mockResolvedValue({ id: "tpl_1", name: "New", createdAt: new Date(), updatedAt: new Date(), hasThumbnail: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    mockGetAuthSession.mockReturnValue(null);
    const res = await POST(makePostReq({ name: "A", canvasJson: { objects: [{ type: "rect" }] } }));
    expect(res.status).toBe(401);
  });

  it("returns 422 for a missing name", async () => {
    const res = await POST(makePostReq({ canvasJson: { objects: [{ type: "rect" }] } }));
    expect(res.status).toBe(422);
  });

  it("returns 422 when canvasJson fails sanitization (empty objects)", async () => {
    const res = await POST(makePostReq({ name: "A", canvasJson: { objects: [] } }));
    expect(res.status).toBe(422);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 422 once the caller is at the per-user template cap", async () => {
    mockList.mockResolvedValue(Array.from({ length: 100 }, (_, i) => ({ id: `tpl_${i}` })));
    const res = await POST(makePostReq({ name: "A", canvasJson: { objects: [{ type: "rect" }] } }));
    expect(res.status).toBe(422);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates a template and returns 201 on success", async () => {
    const res = await POST(makePostReq({ name: "A", canvasJson: { objects: [{ type: "rect" }] } }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith("usr_1", "A", expect.objectContaining({ objects: expect.any(Array) }), expect.any(Buffer));
  });

  it("still saves the template when thumbnail rendering fails", async () => {
    mockRender.mockRejectedValue(new Error("render failed"));
    const res = await POST(makePostReq({ name: "A", canvasJson: { objects: [{ type: "rect" }] } }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith("usr_1", "A", expect.anything(), null);
  });

  it("strips _id from the saved canvasJson", async () => {
    await POST(makePostReq({ name: "A", canvasJson: { objects: [{ type: "rect", _id: "leaked_id" }] } }));
    const savedJson = mockCreate.mock.calls[0][2] as { objects: Array<Record<string, unknown>> };
    expect(savedJson.objects[0]._id).toBeUndefined();
  });
});
