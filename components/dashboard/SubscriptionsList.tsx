"use client";
/**
 * P094 – "My Subscriptions" section for the dashboard. Receives the
 * server-fetched initial list as props (server component parent) and
 * manages client-side removal on unsubscribe without a full page reload.
 */
import { useState } from "react";
import { UnsubscribeButton } from "./UnsubscribeButton";

export interface SubscriptionRow {
  id: string;
  roomId: string;
  roomSlug: string | null;
  frequency: "HOURLY" | "DAILY";
}

export function SubscriptionsList({ initialSubscriptions }: { initialSubscriptions: SubscriptionRow[] }) {
  const [subscriptions, setSubscriptions] = useState(initialSubscriptions);

  if (subscriptions.length === 0) return null;

  return (
    <section className="max-w-4xl mx-auto px-6 pb-10" aria-labelledby="subscriptionsHeading">
      <h2 id="subscriptionsHeading" className="text-lg font-semibold mb-3">
        My Email Subscriptions
      </h2>
      <ul className="space-y-2">
        {subscriptions.map((sub) => (
          <li
            key={sub.id}
            className="flex items-center justify-between bg-[#12121a] border border-slate-800 rounded-lg px-4 py-2 text-sm"
          >
            <span>
              {sub.roomSlug ?? sub.roomId}{" "}
              <span className="text-slate-500 text-xs">({sub.frequency.toLowerCase()} digest)</span>
            </span>
            <UnsubscribeButton
              roomId={sub.roomId}
              onUnsubscribed={() => setSubscriptions((prev) => prev.filter((s) => s.id !== sub.id))}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
