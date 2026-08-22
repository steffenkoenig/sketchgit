/**
 * Tests for lib/server/digestJob.ts (P094)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/roomRepository", () => ({
  getDueSubscriptions: vi.fn(),
  claimSubscriptionForDigest: vi.fn(),
  revertDigestClaim: vi.fn(),
  getRoomEventsSince: vi.fn(),
}));
vi.mock("@/lib/server/email", () => ({
  sendEmail: vi.fn(),
}));
vi.mock("@/lib/server/subscriptionTokens", () => ({
  signUnsubscribeToken: vi.fn((id: string) => `signed-${id}`),
}));

import { runDigestTier, runDigestJob } from "./digestJob";
import {
  getDueSubscriptions,
  claimSubscriptionForDigest,
  revertDigestClaim,
  getRoomEventsSince,
} from "@/lib/db/roomRepository";
import { sendEmail } from "@/lib/server/email";

const mockGetDue = getDueSubscriptions as ReturnType<typeof vi.fn>;
const mockClaim = claimSubscriptionForDigest as ReturnType<typeof vi.fn>;
const mockRevert = revertDigestClaim as ReturnType<typeof vi.fn>;
const mockGetEvents = getRoomEventsSince as ReturnType<typeof vi.fn>;
const mockSendEmail = sendEmail as ReturnType<typeof vi.fn>;

const SUB = { id: "sub_1", roomId: "room_1", userId: "usr_1", userEmail: "a@b.com", roomSlug: "my-room", lastSentAt: null };

describe("runDigestTier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_URL = "http://localhost:3000";
  });

  it("returns all zeros when nothing is due", async () => {
    mockGetDue.mockResolvedValue([]);
    const result = await runDigestTier("DAILY");
    expect(result).toEqual({ sent: 0, quiet: 0, skipped: 0 });
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("skips a subscription that another instance already claimed", async () => {
    mockGetDue.mockResolvedValue([SUB]);
    mockClaim.mockResolvedValue(false);
    const result = await runDigestTier("DAILY");
    expect(result.skipped).toBe(1);
    expect(mockGetEvents).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("counts as quiet (no email) when the claimed subscription has no new events", async () => {
    mockGetDue.mockResolvedValue([SUB]);
    mockClaim.mockResolvedValue(true);
    mockGetEvents.mockResolvedValue([]);
    const result = await runDigestTier("DAILY");
    expect(result.quiet).toBe(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sends a digest email when there is new activity", async () => {
    mockGetDue.mockResolvedValue([SUB]);
    mockClaim.mockResolvedValue(true);
    mockGetEvents.mockResolvedValue([
      { eventType: "COMMIT", createdAt: new Date("2026-01-01T10:00:00Z") },
      { eventType: "MEMBER_JOIN", createdAt: new Date("2026-01-01T11:00:00Z") },
    ]);
    mockSendEmail.mockResolvedValue({ sent: true });

    const result = await runDigestTier("DAILY");

    expect(result.sent).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "a@b.com",
        subject: expect.stringContaining("my-room"),
      }),
    );
    const call = mockSendEmail.mock.calls[0][0] as { html: string; text: string; subject: string };
    expect(call.subject).toContain("2 updates");
    expect(call.html).toContain("Unsubscribe");
    expect(call.html).toContain("signed-sub_1");
    expect(call.text).toContain("signed-sub_1");
  });

  it("does not count sent when sendEmail reports not_configured, and does not revert the claim", async () => {
    mockGetDue.mockResolvedValue([SUB]);
    mockClaim.mockResolvedValue(true);
    mockGetEvents.mockResolvedValue([{ eventType: "COMMIT", createdAt: new Date() }]);
    mockSendEmail.mockResolvedValue({ sent: false, reason: "not_configured" });

    const result = await runDigestTier("DAILY");
    expect(result.sent).toBe(0);
    // "not_configured" is expected dev-mode behavior, not a failure to
    // retry — the claim should stand so this doesn't loop every tick.
    expect(mockRevert).not.toHaveBeenCalled();
  });

  it("reverts the claim to the subscription's previous lastSentAt when the send genuinely fails", async () => {
    const subWithHistory = { ...SUB, lastSentAt: new Date("2026-01-01T00:00:00Z") };
    mockGetDue.mockResolvedValue([subWithHistory]);
    mockClaim.mockResolvedValue(true);
    mockGetEvents.mockResolvedValue([{ eventType: "COMMIT", createdAt: new Date() }]);
    mockSendEmail.mockResolvedValue({ sent: false, reason: "error" });

    const now = new Date("2026-01-02T00:00:00Z");
    const result = await runDigestTier("DAILY", now);

    expect(result.sent).toBe(0);
    expect(mockRevert).toHaveBeenCalledWith("sub_1", now, new Date("2026-01-01T00:00:00Z"));
  });

  it("reverts to null when the subscription had never been sent before", async () => {
    mockGetDue.mockResolvedValue([SUB]); // lastSentAt: null
    mockClaim.mockResolvedValue(true);
    mockGetEvents.mockResolvedValue([{ eventType: "COMMIT", createdAt: new Date() }]);
    mockSendEmail.mockResolvedValue({ sent: false, reason: "error" });

    const now = new Date("2026-01-02T00:00:00Z");
    await runDigestTier("DAILY", now);

    expect(mockRevert).toHaveBeenCalledWith("sub_1", now, null);
  });

  it("does not revert when the send succeeds", async () => {
    mockGetDue.mockResolvedValue([SUB]);
    mockClaim.mockResolvedValue(true);
    mockGetEvents.mockResolvedValue([{ eventType: "COMMIT", createdAt: new Date() }]);
    mockSendEmail.mockResolvedValue({ sent: true });

    await runDigestTier("DAILY");
    expect(mockRevert).not.toHaveBeenCalled();
  });

  it("passes a windowStart to getDueSubscriptions matching the frequency tier", async () => {
    mockGetDue.mockResolvedValue([]);
    const now = new Date("2026-06-15T12:00:00Z");
    await runDigestTier("HOURLY", now);
    expect(mockGetDue).toHaveBeenCalledWith("HOURLY", new Date("2026-06-15T11:00:00Z"));

    vi.clearAllMocks();
    mockGetDue.mockResolvedValue([]);
    await runDigestTier("DAILY", now);
    expect(mockGetDue).toHaveBeenCalledWith("DAILY", new Date("2026-06-14T12:00:00Z"));
  });

  it("processes multiple due subscriptions independently", async () => {
    const sub2 = { ...SUB, id: "sub_2", userEmail: "c@d.com" };
    mockGetDue.mockResolvedValue([SUB, sub2]);
    mockClaim.mockResolvedValue(true);
    mockGetEvents.mockResolvedValue([{ eventType: "COMMIT", createdAt: new Date() }]);
    mockSendEmail.mockResolvedValue({ sent: true });

    const result = await runDigestTier("DAILY");
    expect(result.sent).toBe(2);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });
});

describe("runDigestJob", () => {
  it("runs both HOURLY and DAILY tiers", async () => {
    mockGetDue.mockResolvedValue([]);
    const result = await runDigestJob();
    expect(result).toEqual({
      HOURLY: { sent: 0, quiet: 0, skipped: 0 },
      DAILY: { sent: 0, quiet: 0, skipped: 0 },
    });
    expect(mockGetDue).toHaveBeenCalledWith("HOURLY", expect.any(Date));
    expect(mockGetDue).toHaveBeenCalledWith("DAILY", expect.any(Date));
  });
});
