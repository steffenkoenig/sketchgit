import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/roomRepository", () => ({
  resolveRoomId: vi.fn(),
  checkRoomAccess: vi.fn(),
  setRoomMemberRole: vi.fn(),
}));
vi.mock("@/lib/server/wsRoomBroadcaster", () => ({
  updateClientRole: vi.fn(),
}));

import { PATCH } from "./route";
import { auth } from "@/lib/auth";
import { resolveRoomId, checkRoomAccess, setRoomMemberRole } from "@/lib/db/roomRepository";
import { updateClientRole } from "@/lib/server/wsRoomBroadcaster";
import { NextRequest } from "next/server";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockResolveRoomId = resolveRoomId as ReturnType<typeof vi.fn>;
const mockCheckAccess = checkRoomAccess as ReturnType<typeof vi.fn>;
const mockSetRole = setRoomMemberRole as ReturnType<typeof vi.fn>;
const mockUpdateClientRole = updateClientRole as ReturnType<typeof vi.fn>;

const SESSION = { user: { id: "owner_1" } };
const params = Promise.resolve({ roomId: "room_1", userId: "target_user" });

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/rooms/room_1/members/target_user", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/rooms/[roomId]/members/[userId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveRoomId.mockResolvedValue("room_1");
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ role: "VIEWER" }), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the room doesn't exist", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveRoomId.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ role: "VIEWER" }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when the caller is not the room owner", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCheckAccess.mockResolvedValue({ allowed: true, role: "EDITOR" });
    const res = await PATCH(makeRequest({ role: "VIEWER" }), { params });
    expect(res.status).toBe(403);
  });

  it("returns 422 for an invalid role value", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCheckAccess.mockResolvedValue({ allowed: true, role: "OWNER" });
    const res = await PATCH(makeRequest({ role: "SUPERADMIN" }), { params });
    expect(res.status).toBe(422);
  });

  it("returns 404 when the target user is not a member", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCheckAccess.mockResolvedValue({ allowed: true, role: "OWNER" });
    mockSetRole.mockResolvedValue({ ok: false, reason: "NOT_A_MEMBER" });
    const res = await PATCH(makeRequest({ role: "VIEWER" }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 409 when demoting the last owner", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCheckAccess.mockResolvedValue({ allowed: true, role: "OWNER" });
    mockSetRole.mockResolvedValue({ ok: false, reason: "LAST_OWNER" });
    const res = await PATCH(makeRequest({ role: "VIEWER" }), { params });
    expect(res.status).toBe(409);
  });

  it("updates the role and notifies the target user's WS connection(s) on success", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockCheckAccess.mockResolvedValue({ allowed: true, role: "OWNER" });
    mockSetRole.mockResolvedValue({ ok: true });
    const res = await PATCH(makeRequest({ role: "VIEWER" }), { params });
    expect(res.status).toBe(200);
    expect(mockSetRole).toHaveBeenCalledWith("room_1", "target_user", "VIEWER");
    expect(mockUpdateClientRole).toHaveBeenCalledWith("room_1", "target_user", "VIEWER");
  });
});
