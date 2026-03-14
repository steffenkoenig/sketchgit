"use client";
/**
 * /auth/forgot-password – Request a password-reset email.
 *
 * P040 – Submits the user's email to POST /api/auth/forgot-password.
 * Always shows a success message to prevent email enumeration.
 */
import { Suspense, useState, FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

function ForgotPasswordForm() {
  const t = useTranslations();
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
        <h1>{t("auth.forgotPassword.title")}</h1>
        {submitted ? (
          <p className="auth-subtitle" style={{ textAlign: "left" }}>
            {t("auth.forgotPassword.successMessage")}
          </p>
        ) : (
          <form onSubmit={(e) => { void handleSubmit(e); }} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <p className="auth-subtitle" style={{ textAlign: "left", marginBottom: "4px" }}>
              {t("auth.forgotPassword.instructions")}
            </p>
            <div>
              <label className="auth-label" htmlFor="email">{t("auth.emailLabel")}</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="auth-input"
                placeholder={t("auth.emailPlaceholder")}
                aria-label={t("auth.emailLabel")}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="auth-btn"
            >
              {loading ? t("auth.forgotPassword.sending") : t("auth.forgotPassword.submit")}
            </button>
          </form>
        )}
        <p className="auth-footer">
          {t("auth.forgotPassword.rememberPassword")}{" "}
          <Link href="/auth/signin" className="auth-link">
            {t("auth.forgotPassword.signIn")}
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
