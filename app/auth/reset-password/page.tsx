"use client";
/**
 * /auth/reset-password – Set a new password using a reset token.
 *
 * P040 – Reads `?token=` from the query string, submits new password to
 * POST /api/auth/reset-password, and redirects to sign-in on success.
 */
import { Suspense, useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json() as { error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to reset password.");
      return;
    }
    router.push("/auth/signin?reset=1");
  }

  if (!token) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg0, #0a0a0f)",
      }}>
        <div style={{ color: "var(--tx1, #e2e2ef)", textAlign: "center" }}>
          <p>Invalid or missing reset token.</p>
          <Link href="/auth/forgot-password" className="text-violet-400 hover:underline text-sm">
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg0, #0a0a0f)",
    }}>
      <div style={{
        width: "100%",
        maxWidth: "360px",
        background: "var(--bg1, #12121a)",
        border: "1px solid var(--bdr1, #2a2a3f)",
        borderRadius: "12px",
        padding: "32px",
      }}>
        <h1 style={{ color: "var(--tx1, #e2e2ef)", fontSize: "18px", fontWeight: 600, marginBottom: "20px" }}>
          Choose a new password
        </h1>
        {error && (
          <p role="alert" className="text-red-400 text-xs mb-4">{error}</p>
        )}
        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <label style={{ display: "block", marginBottom: "14px" }}>
            <span style={{ display: "block", fontSize: "12px", color: "var(--tx2, #8888a8)", marginBottom: "4px" }}>
              New password <span style={{ color: "var(--tx3, #555)" }}>(min 12 characters)</span>
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={12}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-violet-500"
              aria-label="New password"
            />
          </label>
          <label style={{ display: "block", marginBottom: "20px" }}>
            <span style={{ display: "block", fontSize: "12px", color: "var(--tx2, #8888a8)", marginBottom: "4px" }}>
              Confirm password
            </span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-violet-500"
              aria-label="Confirm new password"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {loading ? "Saving…" : "Set new password"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
