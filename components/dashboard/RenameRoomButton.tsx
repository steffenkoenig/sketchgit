"use client";
/**
 * P049 – Inline room rename component.
 *
 * Renders a small "✏ Rename" button. When clicked, shows an input field for
 * setting the room's slug. Calls PATCH /api/rooms/[roomId] on submit.
 */
import { useState, FormEvent } from "react";

interface RenameRoomButtonProps {
  roomId: string;
  currentSlug: string | null;
  isOwner: boolean;
}

export function RenameRoomButton({ roomId, currentSlug, isOwner }: RenameRoomButtonProps) {
  const [editing, setEditing] = useState(false);
  const [slug, setSlug] = useState(currentSlug ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOwner) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation(); // prevent Link navigation
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/rooms/${roomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: slug.trim() || null }),
    });
    const data = await res.json() as { message?: string };
    setSaving(false);
    if (!res.ok) {
      setError(data.message ?? "Failed to save slug.");
      return;
    }
    setEditing(false);
    // Reload to show the updated slug in the dashboard room list.
    window.location.reload();
  }

  if (editing) {
    return (
      <form
        onSubmit={(e) => { void handleSubmit(e); }}
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col gap-1 mt-2"
      >
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="e.g. my-project"
          className="w-full px-2 py-1 rounded-md bg-slate-800 border border-slate-600 text-slate-100 text-xs focus:outline-none focus:border-violet-500"
          aria-label="Room slug"
          autoFocus
        />
        {error && <p className="text-red-400 text-[10px]">{error}</p>}
        <div className="flex gap-1">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-0.5 rounded text-[10px] bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEditing(false); setError(null); }}
            className="flex-1 py-0.5 rounded text-[10px] border border-slate-600 text-slate-400 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(true); }}
      className="text-[10px] text-slate-500 hover:text-violet-400 transition-colors mt-1"
      aria-label={`Rename room ${currentSlug ?? roomId}`}
    >
      ✏ Rename
    </button>
  );
}
