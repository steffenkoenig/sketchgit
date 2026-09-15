// @vitest-environment jsdom
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import { SubscriptionsList } from "./SubscriptionsList";

// Import jest-dom to add the custom matchers to expect
import "@testing-library/jest-dom/vitest";

// Mock UnsubscribeButton to simplify testing
vi.mock("./UnsubscribeButton", () => ({
  UnsubscribeButton: ({ roomId, onUnsubscribed }: { roomId: string, onUnsubscribed: () => void }) => (
    <button onClick={onUnsubscribed} data-testid={`unsubscribe-${roomId}`}>
      Unsubscribe {roomId} btn
    </button>
  ),
}));

describe("SubscriptionsList", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders null if subscriptions array is empty", () => {
    const { container } = render(<SubscriptionsList initialSubscriptions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a list of subscriptions", () => {
    const subs: import("./SubscriptionsList").SubscriptionRow[] = [
      { id: "sub1", roomId: "room1", roomSlug: "my-room", frequency: "HOURLY" },
      { id: "sub2", roomId: "room2", roomSlug: null, frequency: "DAILY" },
    ];
    render(<SubscriptionsList initialSubscriptions={subs} />);

    expect(screen.getByText("My Email Subscriptions")).toBeInTheDocument();

    // Checks if roomSlug is used when available
    const listItems = screen.getAllByRole("listitem");
    expect(listItems).toHaveLength(2);

    expect(within(listItems[0]).getByText(/my-room/)).toBeInTheDocument();
    expect(within(listItems[0]).getByText(/\(hourly digest\)/)).toBeInTheDocument();

    // Checks if roomId is used when roomSlug is null
    expect(within(listItems[1]).getByText((content) => content.startsWith('room2'))).toBeInTheDocument();
    expect(within(listItems[1]).getByText(/\(daily digest\)/)).toBeInTheDocument();
  });

  it("removes a subscription when onUnsubscribed is called", async () => {
    const subs: import("./SubscriptionsList").SubscriptionRow[] = [
      { id: "sub1", roomId: "room1", roomSlug: "my-room", frequency: "HOURLY" },
      { id: "sub2", roomId: "room2", roomSlug: null, frequency: "DAILY" },
    ];
    render(<SubscriptionsList initialSubscriptions={subs} />);

    const listItems = screen.getAllByRole("listitem");
    expect(within(listItems[0]).getByText(/my-room/)).toBeInTheDocument();

    const user = userEvent.setup();
    const btn = screen.getByTestId("unsubscribe-room1");
    await user.click(btn);

    expect(screen.queryByText(/my-room/)).not.toBeInTheDocument();
    const remainingItems = screen.getAllByRole("listitem");
    expect(remainingItems).toHaveLength(1);
    expect(within(remainingItems[0]).getByText((content) => content.startsWith('room2'))).toBeInTheDocument();
  });
});
