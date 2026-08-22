/**
 * Tests for /api/rooms/[roomId]/subscribe (P094)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/authTypes", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db/roomRepository", () => ({
  getRoomPublicFlag: vi.fn(),
  getRoomSubscription: vi.fn(),
  upsertRoomSubscription: vi.fn(),
  deleteRoomSubscription: vi.fn(),
}));

import { GET, POST, DELETE } from "./route";
import { auth } from "@/lib/auth";
import { getAuthSession } from "@/lib/authTypes";
import {
  getRoomPublicFlag,
  getRoomSubscription,
  upsertRoomSubscription,
  deleteRoomSubscription,
} from "@/lib/db/roomRepository";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockGetAuthSession = getAuthSession as ReturnType<typeof vi.fn>;
const mockGetRoomPublicFlag = getRoomPublicFlag as ReturnType<typeof vi.fn>;
const mockGetRoomSubscription = getRoomSubscription as ReturnType<typeof vi.fn>;
const mockUpsert = upsertRoomSubscription as ReturnType<typeof vi.fn>;
const mockDelete = deleteRoomSubscription as ReturnType<typeof vi.fn>;

const SESSION = { user: { id: "usr_1", email: "a@b.com" } };
const PARAMS = Promise.resolve({ roomId: "room_1" });

function makePostReq(body: unknown) {
  return new NextRequest("http://localhost/api/rooms/room_1/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/rooms/[roomId]/subscribe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    mockGetAuthSession.mockReturnValue(null);
    const res = await GET(new NextRequest("http://localhost/api/rooms/room_1/subscribe"), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns the current subscription", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockGetAuthSession.mockReturnValue(SESSION);
    mockGetRoomSubscription.mockResolvedValue({ id: "sub_1", frequency: "DAILY" });
    const res = await GET(new NextRequest("http://localhost/api/rooms/room_1/subscribe"), { params: PARAMS });
    expect(res.status).toBe(200);
    const body = await res.json() as { subscription: unknown };
    expect(body.subscription).toEqual({ id: "sub_1", frequency: "DAILY" });
  });

  it("returns null when not subscribed", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockGetAuthSession.mockReturnValue(SESSION);
    mockGetRoomSubscription.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/rooms/room_1/subscribe"), { params: PARAMS });
    const body = await res.json() as { subscription: unknown };
    expect(body.subscription).toBeNull();
  });
});

describe("POST /api/rooms/[roomId]/subscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION);
    mockGetAuthSession.mockReturnValue(SESSION);
    mockGetRoomPublicFlag.mockResolvedValue({ isPublic: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    mockGetAuthSession.mockReturnValue(null);
    const res = await POST(makePostReq({ frequency: "DAILY" }), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 422 when the account has no email", async () => {
    const session = { user: { id: "usr_1", email: null } };
    mockAuth.mockResolvedValue(session);
    mockGetAuthSession.mockReturnValue(session);
    const res = await POST(makePostReq({ frequency: "DAILY" }), { params: PARAMS });
    expect(res.status).toBe(422);
  });

  it("returns 404 when the room does not exist", async () => {
    mockGetRoomPublicFlag.mockResolvedValue(null);
    const res = await POST(makePostReq({ frequency: "DAILY" }), { params: PARAMS });
    expect(res.status).toBe(404);
  });

  it("returns 422 for an invalid frequency value", async () => {
    const res = await POST(makePostReq({ frequency: "WEEKLY" }), { params: PARAMS });
    expect(res.status).toBe(422);
  });

  it("upserts the subscription and returns 200", async () => {
    const res = await POST(makePostReq({ frequency: "HOURLY" }), { params: PARAMS });
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith("room_1", "usr_1", "HOURLY");
    const body = await res.json() as { subscribed: boolean; frequency: string };
    expect(body).toEqual({ subscribed: true, frequency: "HOURLY" });
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/rooms/room_1/subscribe", { method: "POST", body: "not json" });
    const res = await POST(req, { params: PARAMS });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/rooms/[roomId]/subscribe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    mockGetAuthSession.mockReturnValue(null);
    const res = await DELETE(new NextRequest("http://localhost/api/rooms/room_1/subscribe"), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("deletes the subscription and returns subscribed:false", async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockGetAuthSession.mockReturnValue(SESSION);
    const res = await DELETE(new NextRequest("http://localhost/api/rooms/room_1/subscribe"), { params: PARAMS });
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith("room_1", "usr_1");
    const body = await res.json() as { subscribed: boolean };
    expect(body.subscribed).toBe(false);
  });
});
