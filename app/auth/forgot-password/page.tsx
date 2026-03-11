"use client";
/**
 * /auth/forgot-password – Request a password-reset email.
 *
 * P040 – Submits the user's email to POST /api/auth/forgot-password.
 * Always shows a success message to prevent email enumeration.
 */
import { Suspense, useState, FormEvent } from "react";
import Link from "next/link";

function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    setSubmitted(true);
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
        <h1 style={{ color: "var(--tx1, #e2e2ef)", fontSize: "18px", fontWeight: 600, marginBottom: "6px" }}>
          Reset your password
        </h1>
        {submitted ? (
          <p style={{ color: "var(--tx2, #8888a8)", fontSize: "14px", lineHeight: "1.5" }}>
            If that email is registered, you&#39;ll receive a reset link shortly.
            Check your inbox and spam folder.
          </p>
        ) : (
          <form onSubmit={(e) => { void handleSubmit(e); }}>
            <p style={{ color: "var(--tx2, #8888a8)", fontSize: "13px", marginBottom: "20px" }}>
              Enter your email address and we&#39;ll send you a link to reset your password.
            </p>
            <label style={{ display: "block", marginBottom: "14px" }}>
              <span style={{ display: "block", fontSize: "12px", color: "var(--tx2, #8888a8)", marginBottom: "4px" }}>
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-violet-500"
                placeholder="you@example.com"
                aria-label="Email address"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
        <p className="text-center text-xs text-slate-500 mt-4">
          Remember your password?{" "}
          <Link href="/auth/signin" className="text-violet-400 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
