"use client";
/**
 * P041 – Delete Account button with confirmation dialog.
 *
 * For credentials users the dialog includes a password field for re-verification.
 * For OAuth-only users a checkbox confirmation is shown instead.
 */
import { useState } from "react";
import { signOut } from "next-auth/react";

interface DeleteAccountButtonProps {
  hasPassword: boolean;
}

export function DeleteAccountButton({ hasPassword }: DeleteAccountButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setLoading(true);
    const body = hasPassword ? { password } : {};
    const res = await fetch("/api/auth/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json() as { message?: string };
    setLoading(false);
    if (!res.ok) {
      setError(data.message ?? "Failed to delete account.");
      return;
    }
    await signOut({ callbackUrl: "/" });
  }

  if (!showConfirm) {
    return (
      <button
        onClick={() => setShowConfirm(true)}
        className="text-red-400 hover:text-red-300 text-xs hover:underline transition-colors"
        aria-label="Delete your account permanently"
      >
        Delete Account
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm account deletion"
    >
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-white mb-2">Delete your account?</h2>
        <p className="text-xs text-slate-400 mb-4">
          This action is <strong className="text-red-400">permanent and cannot be undone</strong>.
          Your rooms and drawings will be preserved but no longer associated with your account.
        </p>

        {error && <p role="alert" className="text-red-400 text-xs mb-3">{error}</p>}

        {hasPassword ? (
          <label className="block mb-4">
            <span className="block text-xs text-slate-400 mb-1">Confirm with your password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-red-500"
              aria-label="Password confirmation"
              autoFocus
            />
          </label>
        ) : (
          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="w-4 h-4 accent-red-500"
              aria-label="I understand this will delete all my data"
            />
            <span className="text-xs text-slate-400">I understand this will delete all my data.</span>
          </label>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => { setShowConfirm(false); setPassword(""); setError(null); }}
            className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-300 text-sm hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { void handleDelete(); }}
            disabled={loading || (hasPassword ? !password : !confirmed)}
            className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-500 disabled:opacity-50 transition-colors"
          >
            {loading ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
