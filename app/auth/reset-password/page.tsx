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
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <p style={{ color: "var(--tx2)" }}>Invalid or missing reset token.</p>
          <Link href="/auth/forgot-password" className="auth-link" style={{ fontSize: "13px" }}>
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Choose a new password</h1>
        {error && (
          <p role="alert" className="auth-error">{error}</p>
        )}
        <form onSubmit={(e) => { void handleSubmit(e); }} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label className="auth-label" htmlFor="new-password">
              New password{" "}
              <span style={{ color: "var(--tx3)" }}>(min 12 characters)</span>
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={12}
              className="auth-input"
              aria-label="New password"
            />
          </div>
          <div>
            <label className="auth-label" htmlFor="confirm-password">Confirm password</label>
            <input
              id="confirm-password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="auth-input"
              aria-label="Confirm new password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="auth-btn"
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
