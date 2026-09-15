// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UnsubscribeButton } from "./UnsubscribeButton";
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

describe("UnsubscribeButton", () => {
  const mockOnUnsubscribed = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("renders correctly", () => {
    render(<UnsubscribeButton roomId="room-123" onUnsubscribed={mockOnUnsubscribed} />);

    const button = screen.getByRole("button", { name: "Unsubscribe from room room-123" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Unsubscribe");
    expect(button).not.toBeDisabled();
  });

  it("calls API and onUnsubscribed callback on success", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    render(<UnsubscribeButton roomId="room-123" onUnsubscribed={mockOnUnsubscribed} />);

    const button = screen.getByRole("button", { name: "Unsubscribe from room room-123" });
    fireEvent.click(button);

    // Immediately after click, it should show "Removing..." and be disabled
    expect(button).toHaveTextContent("Removing…");
    expect(button).toBeDisabled();

    // Verify API call
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/rooms/room-123/subscribe", {
      method: "DELETE",
    });

    // Wait for the async operation to complete
    await waitFor(() => {
      expect(mockOnUnsubscribed).toHaveBeenCalledTimes(1);
    });

    // After success, it should be enabled and say "Unsubscribe" again
    // (though in reality the component might be unmounted by parent, we check its internal state)
    expect(button).toHaveTextContent("Unsubscribe");
    expect(button).not.toBeDisabled();
  });

  it("encodes roomId properly in API URL", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
    });

    render(<UnsubscribeButton roomId="room/123?abc" onUnsubscribed={mockOnUnsubscribed} />);

    const button = screen.getByRole("button", { name: "Unsubscribe from room room/123?abc" });
    fireEvent.click(button);

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/rooms/room%2F123%3Fabc/subscribe", {
      method: "DELETE",
    });
  });

  it("does not call onUnsubscribed on API failure", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    render(<UnsubscribeButton roomId="room-123" onUnsubscribed={mockOnUnsubscribed} />);

    const button = screen.getByRole("button", { name: "Unsubscribe from room room-123" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(mockOnUnsubscribed).not.toHaveBeenCalled();
    expect(button).toHaveTextContent("Unsubscribe");
  });
});
