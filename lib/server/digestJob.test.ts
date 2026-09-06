/**
 * Tests for lib/server/digestJob.ts (P094)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runDigestTier, runDigestJob } from "@/lib/server/digestJob";
import * as db from "@/lib/db/roomRepository";
import { sendEmail } from "@/lib/server/email";

vi.mock("@/lib/server/email", () => ({ sendEmail: vi.fn() }));

vi.mock("@/lib/db/roomRepository", () => ({
  getDueSubscriptions: vi.fn(),
  claimSubscriptionsForDigestBatch: vi.fn(),
  revertDigestClaims: vi.fn(),
  getRoomEventsSince: vi.fn(),
}));

describe("runDigestJob", () => {
  const mockGetDue = vi.mocked(db.getDueSubscriptions);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-03-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("runDigestTier", () => {
    const mockClaimBatch = vi.mocked(db.claimSubscriptionsForDigestBatch);
    const mockGetEvents = vi.mocked(db.getRoomEventsSince);
    const mockSendEmail = vi.mocked(sendEmail);
    const mockRevert = vi.mocked(db.revertDigestClaims);

    const now = new Date("2024-03-01T12:00:00Z");

    beforeEach(() => {
      mockGetDue.mockResolvedValue([
        {
          id: "sub_1",
          roomId: "room_1",
          userId: "user_1",
          userEmail: "test@example.com",
          roomSlug: "my-room",
          lastSentAt: new Date("2024-02-29T12:00:00Z"),
        },
      ]);
      mockClaimBatch.mockImplementation(async (ids) => ids);
      mockGetEvents.mockResolvedValue([
        { id: "e1", eventType: "COMMIT", actorId: "user_2", payload: {}, createdAt: new Date() },
      ]);
      mockSendEmail.mockResolvedValue({ sent: true });
    });

    it("returns all zeros when nothing is due", async () => {
      mockGetDue.mockResolvedValue([]);
      const result = await runDigestTier("DAILY");
      expect(result).toEqual({ sent: 0, quiet: 0, skipped: 0 });
      expect(mockClaimBatch).not.toHaveBeenCalled();
    });

    it("skips a subscription that another instance already claimed", async () => {
      mockClaimBatch.mockResolvedValue([]);
      const result = await runDigestTier("DAILY");
      expect(result.skipped).toBe(1);
      expect(result.sent).toBe(0);
      expect(mockGetEvents).not.toHaveBeenCalled();
    });

    it("counts as quiet (no email) when the claimed subscription has no new events", async () => {
      mockGetEvents.mockResolvedValue([]);
      const result = await runDigestTier("DAILY");
      expect(result.quiet).toBe(1);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("sends a digest email when there is new activity", async () => {
      const result = await runDigestTier("DAILY");

      expect(result.sent).toBe(1);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "test@example.com",
          subject: expect.stringContaining("Activity in"),
        })
      );
    });

    it("does not count sent when sendEmail reports not_configured, and does not revert the claim", async () => {
      mockSendEmail.mockResolvedValue({ sent: false, reason: "not_configured" });
      const result = await runDigestTier("DAILY");

      expect(result.sent).toBe(0);
      expect(mockRevert).not.toHaveBeenCalled();
    });

    it("reverts the claim to the subscription's previous lastSentAt when the send genuinely fails", async () => {
      mockSendEmail.mockResolvedValue({ sent: false, reason: "error" });
      const result = await runDigestTier("DAILY", now);

      expect(result.sent).toBe(0);
      expect(mockRevert).toHaveBeenCalledWith(
        [{ id: "sub_1", previousLastSentAt: new Date("2024-02-29T12:00:00Z") }],
        now,
      );
    });

    it("reverts to null when the subscription had never been sent before", async () => {
      mockGetDue.mockResolvedValue([
        { id: "sub_1", roomId: "room_1", userId: "user_1", userEmail: "test@example.com", roomSlug: null, lastSentAt: null },
      ]);
      mockSendEmail.mockResolvedValue({ sent: false, reason: "error" });
      await runDigestTier("DAILY", now);

      expect(mockRevert).toHaveBeenCalledWith(
        [{ id: "sub_1", previousLastSentAt: null }],
        now,
      );
    });

    it("does not revert when the send succeeds", async () => {
      mockSendEmail.mockResolvedValue({ sent: true });
      await runDigestTier("DAILY", now);
      expect(mockRevert).not.toHaveBeenCalled();
    });

    it("passes a windowStart to getDueSubscriptions matching the frequency tier", async () => {
      await runDigestTier("HOURLY", now);
      expect(mockGetDue).toHaveBeenCalledWith("HOURLY", new Date("2024-03-01T11:00:00.000Z"));

      await runDigestTier("DAILY", now);
      expect(mockGetDue).toHaveBeenCalledWith("DAILY", new Date("2024-02-29T12:00:00.000Z"));
    });

    it("processes multiple due subscriptions independently", async () => {
      mockGetDue.mockResolvedValue([
        { id: "sub_1", roomId: "room_1", userId: "user_1", userEmail: "u1@example.com", roomSlug: null, lastSentAt: null },
        { id: "sub_2", roomId: "room_2", userId: "user_2", userEmail: "u2@example.com", roomSlug: null, lastSentAt: null },
      ]);
      mockClaimBatch.mockImplementation(async (ids) => ids); // Both succeed

      const result = await runDigestTier("DAILY");
      expect(result.sent).toBe(2);
      expect(mockSendEmail).toHaveBeenCalledTimes(2);
    });
  });

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