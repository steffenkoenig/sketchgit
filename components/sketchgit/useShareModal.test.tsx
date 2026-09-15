/// <reference types="vitest" />
// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { useShareModal } from "./useShareModal";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// We must mock useShareModalLinks directly to bypass the loadLinks fetching that causes act warnings
vi.mock("./useShareModalLinks", () => ({
  useShareModalLinks: vi.fn(() => ({
    links: [],
    setLinks: vi.fn(),
    loadingLinks: false,
    linksLoaded: true,
    linksError: null,
    loadLinks: vi.fn().mockResolvedValue(undefined),
    handleRevoke: vi.fn(),
    handleRevokeAll: vi.fn(),
    resolveApiError: vi.fn((err) => err.code || "INTERNAL_ERROR"),
  })),
}));

describe("useShareModal", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockClipboard: { writeText: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockFetch = vi.fn();
    mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };

    vi.stubGlobal("fetch", mockFetch);
    Object.assign(navigator, {
      clipboard: mockClipboard,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("should initialize correctly", () => {
    const { result } = renderHook(() =>
      useShareModal({ isOpen: true, roomId: "room-123", prefilledCommitSha: null })
    );
    expect(result.current.creating).toBe(false);
    expect(result.current.scope).toBe("ROOM");
    expect(result.current.permission).toBe("VIEW");
  });

  it("should handle create success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "http://example.com/share" }),
    });

    const { result } = renderHook(() =>
      useShareModal({ isOpen: true, roomId: "room-123", prefilledCommitSha: null })
    );

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/rooms/room-123/share-links",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ scope: "ROOM", permission: "VIEW" }),
      })
    );

    expect(result.current.createError).toBeNull();
    expect(result.current.newLinkUrl).toBe("http://example.com/share");
  });

  it("should handle create with full payload", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "http://example.com/share" }),
    });

    const { result } = renderHook(() =>
      useShareModal({ isOpen: true, roomId: "room-123", prefilledCommitSha: null })
    );

    act(() => {
      result.current.setLabel("My Link");
      result.current.setScope("BRANCH");
      result.current.setBranches("main, feat");
      result.current.setPermission("WRITE");
      result.current.setExpiresInHours("24");
      result.current.setMaxUses("10");
    });

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/rooms/room-123/share-links",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          scope: "BRANCH",
          permission: "WRITE",
          label: "My Link",
          branches: ["main", "feat"],
          expiresInHours: 24,
          maxUses: 10
        }),
      })
    );
  });

  it("should handle create API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ code: "LIMIT_EXCEEDED" }),
    });

    const { result } = renderHook(() =>
      useShareModal({ isOpen: true, roomId: "room-123", prefilledCommitSha: null })
    );

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(result.current.createError).toBe("LIMIT_EXCEEDED");
    expect(result.current.newLinkUrl).toBeNull();
  });

  it("should handle create fetch exception", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network Error"));

    const { result } = renderHook(() =>
      useShareModal({ isOpen: true, roomId: "room-123", prefilledCommitSha: null })
    );

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(result.current.createError).toBe("errors.INTERNAL_ERROR");
  });

  it("should handle copy new link", async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "http://example.com/share" }),
    });

    const { result } = renderHook(() =>
      useShareModal({ isOpen: true, roomId: "room-123", prefilledCommitSha: null })
    );

    await act(async () => {
      await result.current.handleCreate();
    });

    await act(async () => {
      result.current.handleCopyNew();
    });

    expect(mockClipboard.writeText).toHaveBeenCalledWith("http://example.com/share");
    expect(result.current.copiedNew).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(result.current.copiedNew).toBe(false);

    vi.useRealTimers();
  });

  it("should do nothing on handleCreate if roomId is not set", async () => {
    const { result } = renderHook(() =>
      useShareModal({ isOpen: true, roomId: null, prefilledCommitSha: null })
    );

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should do nothing on handleCopyNew if no newLinkUrl", () => {
    const { result } = renderHook(() =>
      useShareModal({ isOpen: true, roomId: "room-123", prefilledCommitSha: null })
    );

    act(() => {
      result.current.handleCopyNew();
    });

    expect(mockClipboard.writeText).not.toHaveBeenCalled();
  });

  it("should use COMMIT scope when prefilledCommitSha is set", () => {
    const { result } = renderHook(() =>
      useShareModal({ isOpen: true, roomId: "room-123", prefilledCommitSha: "abc123sha" })
    );

    expect(result.current.scope).toBe("COMMIT");
    expect(result.current.commitSha).toBe("abc123sha");
    expect(result.current.permission).toBe("VIEW");
  });

  it("should construct create payload correctly with commitSha", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "http://example.com/share" }),
    });

    const { result } = renderHook(() =>
      useShareModal({ isOpen: true, roomId: "room-123", prefilledCommitSha: "abc123sha" })
    );

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/rooms/room-123/share-links",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          scope: "COMMIT",
          permission: "VIEW",
          commitSha: "abc123sha",
        }),
      })
    );
  });

  it("should handle create success with null url in response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: undefined }),
    });

    const { result } = renderHook(() =>
      useShareModal({ isOpen: true, roomId: "room-123", prefilledCommitSha: null })
    );

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(result.current.createError).toBeNull();
    expect(result.current.newLinkUrl).toBeNull();
  });
});
