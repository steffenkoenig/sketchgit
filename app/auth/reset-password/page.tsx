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
import { useTranslations } from "next-intl";

function ResetPasswordForm() {
  const t = useTranslations();
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
      setError(t("auth.resetPassword.passwordMismatch"));
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
      setError(data.error ?? t("auth.resetPassword.resetFailed"));
      return;
    }
    router.push("/auth/signin?reset=1");
  }

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <p style={{ color: "var(--tx2)" }}>{t("auth.resetPassword.invalidToken")}</p>
          <Link href="/auth/forgot-password" className="auth-link" style={{ fontSize: "13px" }}>
            {t("auth.resetPassword.requestNewLink")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>{t("auth.resetPassword.title")}</h1>
        {error && (
          <p role="alert" className="auth-error">{error}</p>
        )}
        <form onSubmit={(e) => { void handleSubmit(e); }} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label className="auth-label" htmlFor="new-password">
              {t("auth.resetPassword.newPasswordLabel")}{" "}
              <span style={{ color: "var(--tx3)" }}>{t("auth.resetPassword.passwordHint")}</span>
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={12}
              className="auth-input"
              aria-label={t("auth.resetPassword.newPasswordLabel")}
            />
          </div>
          <div>
            <label className="auth-label" htmlFor="confirm-password">{t("auth.resetPassword.confirmPasswordLabel")}</label>
            <input
              id="confirm-password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="auth-input"
              aria-label={t("auth.resetPassword.confirmPasswordLabel")}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="auth-btn"
          >
            {loading ? t("auth.resetPassword.saving") : t("auth.resetPassword.submit")}
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
