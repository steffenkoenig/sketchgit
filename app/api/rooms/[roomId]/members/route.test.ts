import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/roomRepository", () => ({
  resolveRoomId: vi.fn(),
  checkRoomAccess: vi.fn(),
  listRoomMembers: vi.fn(),
}));

import { GET } from "./route";
import { auth } from "@/lib/auth";
import { resolveRoomId, checkRoomAccess, listRoomMembers } from "@/lib/db/roomRepository";
import { NextRequest } from "next/server";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockResolveRoomId = resolveRoomId as ReturnType<typeof vi.fn>;
const mockCheckAccess = checkRoomAccess as ReturnType<typeof vi.fn>;
const mockList = listRoomMembers as ReturnType<typeof vi.fn>;

const SESSION = { user: { id: "owner_1" } };
const params = Promise.resolve({ roomId: "room_1" });

function makeRequest() {
  return new NextRequest("http://localhost/api/rooms/room_1/members");
}

describe("GET /api/rooms/[roomId]/members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveRoomId.mockResolvedValue("room_1");
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the room doesn't exist", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveRoomId.mockResolvedValue(null);
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 for a non-owner", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCheckAccess.mockResolvedValue({ allowed: true, role: "VIEWER" });
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(403);
  });

  it("returns the member list for the owner", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCheckAccess.mockResolvedValue({ allowed: true, role: "OWNER" });
    mockList.mockResolvedValue([
      { userId: "owner_1", role: "OWNER", joinedAt: new Date(), name: "Owner", email: "o@example.com" },
    ]);
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(200);
    const json = await res.json() as { members: unknown[] };
    expect(json.members).toHaveLength(1);
  });
});
