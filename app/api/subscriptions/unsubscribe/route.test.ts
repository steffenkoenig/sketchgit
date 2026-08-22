/**
 * Tests for GET /api/subscriptions/unsubscribe (P094)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/server/subscriptionTokens", () => ({
  verifyUnsubscribeToken: vi.fn(),
}));
vi.mock("@/lib/db/roomRepository", () => ({
  deleteRoomSubscriptionById: vi.fn(),
}));

import { GET } from "./route";
import { verifyUnsubscribeToken } from "@/lib/server/subscriptionTokens";
import { deleteRoomSubscriptionById } from "@/lib/db/roomRepository";

const mockVerify = verifyUnsubscribeToken as ReturnType<typeof vi.fn>;
const mockDelete = deleteRoomSubscriptionById as ReturnType<typeof vi.fn>;

function makeReq(query: string) {
  return new NextRequest(`http://localhost/api/subscriptions/unsubscribe${query}`);
}

describe("GET /api/subscriptions/unsubscribe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an HTML error page when the token param is missing", async () => {
    const res = await GET(makeReq(""));
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Invalid link");
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns an HTML error page for an invalid/tampered token", async () => {
    mockVerify.mockReturnValue(null);
    const res = await GET(makeReq("?token=garbage"));
    const html = await res.text();
    expect(html).toContain("Invalid link");
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes the subscription and confirms for a valid token", async () => {
    mockVerify.mockReturnValue("sub_1");
    mockDelete.mockResolvedValue(true);
    const res = await GET(makeReq("?token=valid-token"));
    expect(mockDelete).toHaveBeenCalledWith("sub_1");
    const html = await res.text();
    expect(html).toContain("Unsubscribed");
  });

  it("still confirms success when the subscription was already removed (idempotent)", async () => {
    mockVerify.mockReturnValue("sub_1");
    mockDelete.mockResolvedValue(false);
    const res = await GET(makeReq("?token=valid-token"));
    const html = await res.text();
    expect(html).toContain("Unsubscribed");
  });
});
