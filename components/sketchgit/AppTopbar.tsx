"use client";
/**
 * AppTopbar – the horizontal top navigation bar.
 *
 * P021: Wrapped with React.memo. The `call` and `session` props are stable
 * references due to useCallback/useMemo in SketchGitApp.tsx, so this
 * component only re-renders when auth state actually changes.
 *
 * P025: Landmarks and accessible labels added to all controls.
 * P039: Export PNG/SVG download links for the current room's canvas.
 * P050: All visible strings replaced with useTranslations calls; EN/DE switcher added.
 */

import React from "react";
import Link from "next/link";
import type { Session } from "next-auth";
import { signIn, signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import type { SketchGitCall } from "@/components/sketchgit/types";

type AppTopbarProps = {
  call: SketchGitCall;
  session: Session | null;
  sessionStatus: "loading" | "authenticated" | "unauthenticated";
};

/**
 * P050 – Locale switcher button that stores the user's preference in a cookie
 * and reloads the page so next-intl picks up the new locale.
 */
function LocaleSwitcher() {
  const locale = useLocale();

  function switchLocale(target: "en" | "de") {
    if (target === locale) return;
    document.cookie = `NEXT_LOCALE=${target}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.reload();
  }

  return (
    <div className="flex items-center gap-1" aria-label="Language switcher">
      {(["en", "de"] as const).map((l) => (
        <button
          key={l}
          onClick={() => switchLocale(l)}
          className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
            l === locale
              ? "bg-violet-600 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
          aria-label={`Switch to ${l === "en" ? "English" : "German"}`}
          aria-pressed={l === locale}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/**
 * P078 – Theme toggle button.
 * Stores the user's choice in a `THEME` cookie (same pattern as LocaleSwitcher).
 * Applies `theme-light` class to `<html>` immediately for instant feedback
 * without requiring a page reload (unlike the locale switcher).
 */
function ThemeToggle() {
  const t = useTranslations();
  const [isDark, setIsDark] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const cookie = document.cookie.match(/THEME=(\w+)/)?.[1];
    if (cookie) return cookie !== "light";
    return !window.matchMedia("(prefers-color-scheme: light)").matches;
  });

  function toggle() {
    const nextDark = !isDark;
    setIsDark(nextDark);
    const theme = nextDark ? "dark" : "light";
    document.cookie = `THEME=${theme}; path=/; max-age=31536000; SameSite=Lax`;
    document.documentElement.classList.toggle("theme-light", !nextDark);
  }

  return (
    <button
      onClick={toggle}
      className="text-[16px] px-1.5 transition-colors text-slate-400 hover:text-slate-200"
      aria-label={isDark ? t("topbar.switchToLight") : t("topbar.switchToDark")}
      aria-pressed={!isDark}
      title={isDark ? t("topbar.switchToLight") : t("topbar.switchToDark")}
    >
      {isDark ? "☀" : "🌙"}
    </button>
  );
}

export const AppTopbar = React.memo(function AppTopbar({ call, session, sessionStatus }: AppTopbarProps) {
  // P039: Resolve the current room ID from the URL query param for export links.
  const searchParams = useSearchParams();
  const roomId = searchParams.get("room") ?? "default";
  const exportBase = `/api/rooms/${encodeURIComponent(roomId)}/export`;

  // P050: translation helper
  const t = useTranslations();

  return (
    <header id="topbar" className="border-b border-slate-800" role="banner" aria-label="Application toolbar">
      <div className="logo" aria-label="SketchGit application logo">
        <div className="logo-badge" aria-hidden="true">⌥</div>
        SketchGit
      </div>

      <button
        className="branch-selector"
        id="currentBranchBtn"
        onClick={() => call("openBranchModal")}
        aria-label="Current branch — click to switch branches"
        aria-haspopup="dialog"
      >
        <div className="dot" id="currentBranchDot" style={{ background: "var(--a1)" }} aria-hidden="true"></div>
        <span id="currentBranchName" aria-live="polite">main</span>
        <span style={{ color: "var(--tx3)", marginLeft: "2px" }} aria-hidden="true">▾</span>
      </button>

      <span
        style={{ fontSize: "10px", color: "var(--tx3)" }}
        id="headSHA"
        aria-label="Current HEAD commit SHA"
        aria-live="polite"
      ></span>

      <div className="sep" role="separator" aria-orientation="vertical"></div>
      <div className="avatar-row" id="avatarRow" aria-label="Connected peers" role="list"></div>
      <div className="live-ind" id="liveInd" style={{ display: "none" }} aria-label="Live collaboration active" aria-live="polite"></div>

      <Button
        variant="outline" size="sm"
        className="h-7 border-slate-700 bg-transparent text-slate-300 hover:border-violet-500 hover:bg-slate-800"
        onClick={() => call("toggleCollabPanel")}
        aria-label="Toggle collaboration panel"
        aria-haspopup="dialog"
      >{t("topbar.collab")}</Button>

      <Button
        variant="outline" size="sm"
        className="h-7 border-slate-700 bg-transparent text-slate-300 hover:border-rose-500 hover:bg-slate-800"
        onClick={() => call("openMergeModal")}
        id="mergeBtn"
        aria-label="Open merge branch dialog"
        aria-haspopup="dialog"
      >{t("topbar.merge")}</Button>

      <Button
        variant="outline" size="sm"
        className="h-7 border-slate-700 bg-transparent text-slate-300 hover:border-violet-500 hover:bg-slate-800"
        onClick={() => call("openBranchCreate")}
        aria-label="Create a new branch"
        aria-haspopup="dialog"
      >{t("topbar.branch")}</Button>

      <Button
        size="sm"
        className="h-7 bg-violet-600 text-white hover:bg-violet-500"
        onClick={() => call("openCommitModal")}
        id="commitBtn"
        aria-label="Commit current drawing changes"
        aria-haspopup="dialog"
      >{t("topbar.commit")}</Button>

      {/* P091: Share button – only meaningful for authenticated users (API enforces OWNER) */}
      {session?.user && (
        <Button
          variant="outline" size="sm"
          className="h-7 border-slate-700 bg-transparent text-slate-300 hover:border-sky-500 hover:bg-slate-800"
          onClick={() => call("openShareModal")}
          aria-label="Open share links dialog"
          aria-haspopup="dialog"
        >{t("topbar.share")}</Button>
      )}

      {/* P039: Canvas export download links */}
      <a
        href={`${exportBase}?format=png`}
        download={`canvas-${roomId}.png`}
        className="inline-flex items-center h-7 px-3 rounded-md border border-slate-700 bg-transparent text-slate-300 text-xs font-medium hover:border-violet-500 hover:bg-slate-800 transition-colors"
        aria-label="Export canvas as PNG image"
      >{t("toolbar.exportPng")}</a>
      <a
        href={`${exportBase}?format=svg`}
        download={`canvas-${roomId}.svg`}
        className="inline-flex items-center h-7 px-3 rounded-md border border-slate-700 bg-transparent text-slate-300 text-xs font-medium hover:border-violet-500 hover:bg-slate-800 transition-colors"
        aria-label="Export canvas as SVG vector file"
      >{t("toolbar.exportSvg")}</a>
      {/* P076 – PDF export link */}
      <a
        href={`${exportBase}?format=pdf`}
        download={`canvas-${roomId}.pdf`}
        className="inline-flex items-center h-7 px-3 rounded-md border border-slate-700 bg-transparent text-slate-300 text-xs font-medium hover:border-violet-500 hover:bg-slate-800 transition-colors"
        aria-label="Export canvas as PDF document"
      >{t("toolbar.exportPdf")}</a>

      {/* Auth section */}
      <div className="sep" role="separator" aria-orientation="vertical"></div>

      {/* P050 – Locale switcher (EN / DE) */}
      <LocaleSwitcher />

      {/* P078 – Theme toggle (dark/light) */}
      <ThemeToggle />

      <div className="sep" role="separator" aria-orientation="vertical"></div>

      {sessionStatus === "loading" ? null : session?.user ? (
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Link
            href="/dashboard"
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              background: "var(--bg2)", border: "1px solid var(--bdr1)",
              borderRadius: "6px", padding: "3px 10px",
              fontSize: "12px", color: "var(--tx1)", textDecoration: "none",
              cursor: "pointer",
            }}
            aria-label={`Go to My Drawings (signed in as ${session.user.name ?? session.user.email})`}
          >
            <span aria-hidden="true">👤</span>
            <span style={{ maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {session.user.name ?? session.user.email}
            </span>
          </Link>
          <Button
            variant="outline" size="sm"
            className="h-7"
            onClick={() => signOut({ callbackUrl: "/" })}
            aria-label="Sign out of SketchGit"
          >{t("topbar.signOut")}</Button>
        </div>
      ) : (
        <Button
          variant="outline" size="sm"
          className="h-7"
          onClick={() => signIn()}
          aria-label="Sign in or create a SketchGit account"
        >{t("topbar.signIn")}</Button>
      )}
    </header>
  );
});
