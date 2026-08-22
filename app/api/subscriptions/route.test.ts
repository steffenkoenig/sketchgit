/**
 * Tests for GET /api/subscriptions (P094)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/authTypes", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db/roomRepository", () => ({
  getUserSubscriptions: vi.fn(),
}));

import { GET } from "./route";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import { getUserSubscriptions } from "@/lib/db/roomRepository";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockGetAuthSession = getAuthSession as ReturnType<typeof vi.fn>;
const mockGetUserSubscriptions = getUserSubscriptions as ReturnType<typeof vi.fn>;

describe("GET /api/subscriptions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    mockGetAuthSession.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the user's subscriptions", async () => {
    const session = { user: { id: "usr_1" } };
    mockAuth.mockResolvedValue(session);
    mockGetAuthSession.mockReturnValue(session);
    mockGetUserSubscriptions.mockResolvedValue([
      { id: "sub_1", roomId: "room_1", frequency: "DAILY", createdAt: new Date(), roomSlug: "my-room" },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(mockGetUserSubscriptions).toHaveBeenCalledWith("usr_1");
    const body = await res.json() as { subscriptions: unknown[] };
    expect(body.subscriptions).toHaveLength(1);
  });
});
