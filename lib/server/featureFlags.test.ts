import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/featureFlagRepository", () => ({
  getFeatureFlag: vi.fn(),
}));

import { isEnabled, invalidateFeatureFlagCache } from "./featureFlags";
import { getFeatureFlag } from "../db/featureFlagRepository";
import { makeFeatureFlag } from "../test/factories";

const mockGetFeatureFlag = getFeatureFlag as ReturnType<typeof vi.fn>;

describe("isEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Each flag name used across tests must be distinct, or the shared
    // module-level LRU cache returns a stale entry from a previous test.
  });

  it("returns false for an unknown flag", async () => {
    mockGetFeatureFlag.mockResolvedValue(null);
    expect(await isEnabled("canvas-schema-v2", { userId: "usr_1" })).toBe(false);
  });

  it("returns true when the flag is enabled globally", async () => {
    mockGetFeatureFlag.mockResolvedValue(makeFeatureFlag({ name: "read-replica", enabled: true }));
    expect(await isEnabled("read-replica", {})).toBe(true);
  });

  it("returns true for a targeted userId when globally off", async () => {
    mockGetFeatureFlag.mockResolvedValue(
      makeFeatureFlag({ name: "sentry-client", enabled: false, targetScope: { userIds: ["usr_42"] } }),
    );
    expect(await isEnabled("sentry-client", { userId: "usr_42" })).toBe(true);
  });

  it("returns false for a non-targeted userId when globally off", async () => {
    mockGetFeatureFlag.mockResolvedValue(
      makeFeatureFlag({ name: "presenter-mode", enabled: false, targetScope: { userIds: ["usr_42"] } }),
    );
    expect(await isEnabled("presenter-mode", { userId: "usr_other" })).toBe(false);
  });

  it("returns true for a targeted roomId when globally off", async () => {
    mockGetFeatureFlag.mockResolvedValue(
      makeFeatureFlag({ name: "room-targeted-flag" as never, enabled: false, targetScope: { roomIds: ["room_1"] } }),
    );
    expect(await isEnabled("room-targeted-flag" as never, { roomId: "room_1" })).toBe(true);
  });

  it("hits the cache on a second call within the TTL (no second DB query)", async () => {
    mockGetFeatureFlag.mockResolvedValue(makeFeatureFlag({ name: "cache-hit-flag" as never, enabled: true }));
    await isEnabled("cache-hit-flag" as never, {});
    await isEnabled("cache-hit-flag" as never, {});
    expect(mockGetFeatureFlag).toHaveBeenCalledTimes(1);
  });

  it("invalidateFeatureFlagCache forces a fresh DB read on the next call", async () => {
    mockGetFeatureFlag.mockResolvedValue(makeFeatureFlag({ name: "invalidate-flag" as never, enabled: false }));
    await isEnabled("invalidate-flag" as never, {});
    invalidateFeatureFlagCache("invalidate-flag");
    await isEnabled("invalidate-flag" as never, {});
    expect(mockGetFeatureFlag).toHaveBeenCalledTimes(2);
  });
});
