/**
 * Tests for /api/templates/[id]/thumbnail (P095)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/authTypes", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db/templateRepository", () => ({
  getShapeTemplateThumbnail: vi.fn(),
}));

import { GET } from "./route";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { getShapeTemplateThumbnail } from "@/lib/db/templateRepository";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockGetAuthSession = getAuthSession as ReturnType<typeof vi.fn>;
const mockGetThumbnail = getShapeTemplateThumbnail as ReturnType<typeof vi.fn>;

const SESSION = { user: { id: "usr_1", email: "a@b.com" } };
const PARAMS = Promise.resolve({ id: "tpl_1" });

describe("GET /api/templates/[id]/thumbnail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    mockGetAuthSession.mockReturnValue(null);
    const res = await GET(new NextRequest("http://localhost/api/templates/tpl_1/thumbnail"), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 404 when there is no thumbnail", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockGetAuthSession.mockReturnValue(SESSION);
    mockGetThumbnail.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/templates/tpl_1/thumbnail"), { params: PARAMS });
    expect(res.status).toBe(404);
  });

  it("returns the PNG bytes with the correct content type", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockGetAuthSession.mockReturnValue(SESSION);
    mockGetThumbnail.mockResolvedValue(Buffer.from([1, 2, 3]));
    const res = await GET(new NextRequest("http://localhost/api/templates/tpl_1/thumbnail"), { params: PARAMS });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf).toEqual(Buffer.from([1, 2, 3]));
  });
});
