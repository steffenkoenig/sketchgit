"use client";
/**
 * CookieNotice – GAP-003 §5.3.
 *
 * The gap report's own legal analysis (TTDSG § 25) concludes no consent
 * banner is legally required here: every cookie/localStorage entry this app
 * sets is strictly necessary and only ever written in direct response to an
 * explicit user action (signing in, toggling the theme, entering a display
 * name) — none of it needs opt-in consent. German DPA (DSK) guidance still
 * treats a brief, non-blocking informational notice as best practice even
 * when consent isn't required, so this shows one once, dismissible, and
 * never shown again (a UI preference, not a consent record — nothing here
 * gates functionality on whether it's been seen).
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const DISMISSED_KEY = "sketchgit_cookie_notice_dismissed";

export function CookieNotice() {
  const t = useTranslations("cookieNotice");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(DISMISSED_KEY)) setVisible(true);
    } catch {
      // localStorage unavailable (private mode, etc.) — just don't show it.
    }
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Nothing to do — it'll just show again next visit in this case.
    }
  }

  if (!visible) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed", left: "12px", bottom: "12px", zIndex: 30,
        maxWidth: "360px", background: "var(--s2)", border: "1px solid var(--bdr)",
        borderRadius: "8px", padding: "10px 12px", fontSize: "11px", color: "var(--tx2)",
        display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      <span>{t("message")}</span>
      <button
        type="button"
        className="mbtn"
        onClick={dismiss}
        aria-label={t("dismiss")}
        style={{ fontSize: "10px", padding: "2px 8px", flexShrink: 0 }}
      >
        {t("dismiss")}
      </button>
    </div>
  );
}
