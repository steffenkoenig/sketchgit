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
    <div className="auth-page">
      <div className="auth-card">
        <h1>Reset your password</h1>
        {submitted ? (
          <p className="auth-subtitle" style={{ textAlign: "left" }}>
            If that email is registered, you&#39;ll receive a reset link shortly.
            Check your inbox and spam folder.
          </p>
        ) : (
          <form onSubmit={(e) => { void handleSubmit(e); }} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <p className="auth-subtitle" style={{ textAlign: "left", marginBottom: "4px" }}>
              Enter your email address and we&#39;ll send you a link to reset your password.
            </p>
            <div>
              <label className="auth-label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="auth-input"
                placeholder="you@example.com"
                aria-label="Email address"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="auth-btn"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
        <p className="auth-footer">
          Remember your password?{" "}
          <Link href="/auth/signin" className="auth-link">
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
