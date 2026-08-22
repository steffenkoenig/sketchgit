"use client";
/**
 * P094 – "Unsubscribe" button for the dashboard's "My Subscriptions" list.
 * Calls DELETE /api/rooms/[roomId]/subscribe and removes the row from view
 * on success (no full page reload needed — this list is otherwise static).
 */
import { useState } from "react";

interface UnsubscribeButtonProps {
  roomId: string;
  onUnsubscribed: () => void;
}

export function UnsubscribeButton({ roomId, onUnsubscribed }: UnsubscribeButtonProps) {
  const [saving, setSaving] = useState(false);

  async function handleClick() {
    setSaving(true);
    const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/subscribe`, { method: "DELETE" });
    setSaving(false);
    if (res.ok) onUnsubscribed();
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={saving}
      className="text-[11px] text-slate-500 hover:text-red-400 transition-colors disabled:opacity-50"
      aria-label={`Unsubscribe from room ${roomId}`}
    >
      {saving ? "Removing…" : "Unsubscribe"}
    </button>
  );
}
