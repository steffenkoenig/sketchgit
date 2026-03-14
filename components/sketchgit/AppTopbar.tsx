"use client";
/**
 * AppTopbar – the horizontal top navigation bar.
 *
 * P021: Wrapped with React.memo. The `call` and `session` props are stable
 * references due to useCallback/useMemo in SketchGitApp.tsx, so this
 * component only re-renders when auth state actually changes.
 *
 * P025: Landmarks and accessible labels added to all controls.
 * P039: Export PNG/SVG/PDF grouped into a dropdown menu.
 * P050: All visible strings replaced with useTranslations calls.
 */

import React from "react";
import Link from "next/link";
import type { Session } from "next-auth";
import { signIn, signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import type { SketchGitCall } from "@/components/sketchgit/types";
// Note: native <button> elements with .topbtn CSS class are used throughout instead of the
// shadcn/ui <Button> component because shadcn requires its own CSS variable definitions
// (--primary, --border, etc.) which are not part of this app's CSS variable system.

type AppTopbarProps = {
  call: SketchGitCall;
  session: Session | null;
  sessionStatus: "loading" | "authenticated" | "unauthenticated";
};

/* ── Inline SVG icon helpers ─────────────────────────────────────────────── */

function IconCollab() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5" cy="5" r="2.5"/>
      <circle cx="11" cy="5" r="2.5"/>
      <path d="M1 13c0-2.2 1.8-4 4-4h6c2.2 0 4 1.8 4 4"/>
    </svg>
  );
}

function IconMerge() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="4" cy="4" r="1.5"/>
      <circle cx="4" cy="12" r="1.5"/>
      <circle cx="12" cy="8" r="1.5"/>
      <path d="M4 5.5v5M4 5.5C4 8 12 8 12 8"/>
    </svg>
  );
}

function IconBranch() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="4" cy="4" r="1.5"/>
      <circle cx="4" cy="12" r="1.5"/>
      <circle cx="12" cy="4" r="1.5"/>
      <path d="M4 5.5v5M4 5.5C4 8 12 8 12 5.5"/>
    </svg>
  );
}

function IconCommit() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="3"/>
      <line x1="1" y1="8" x2="5" y2="8"/>
      <line x1="11" y1="8" x2="15" y2="8"/>
    </svg>
  );
}

function IconShare() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 2l3 3-3 3"/>
      <path d="M14 5H5.5A3.5 3.5 0 0 0 2 8.5V9"/>
      <path d="M5 14l-3-3 3-3"/>
      <path d="M2 11h8.5a3.5 3.5 0 0 0 3.5-3.5V7"/>
    </svg>
  );
}

function IconExport() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2v8M5 7l3 3 3-3"/>
      <path d="M3 11v2h10v-2"/>
    </svg>
  );
}

function IconPng() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="2"/>
      <circle cx="5.5" cy="5.5" r="1" fill="currentColor" stroke="none"/>
      <path d="M2 10l3-3 2.5 2.5L10 7l4 4"/>
    </svg>
  );
}

function IconSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3L4 8l4 5M8 3l4 5-4 5"/>
      <path d="M3 8h10"/>
    </svg>
  );
}

function IconPdf() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6z"/>
      <polyline points="10,2 10,6 14,6"/>
      <line x1="5" y1="9" x2="11" y2="9"/>
      <line x1="5" y1="11" x2="9" y2="11"/>
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6"/>
      <path d="M8 2c-1.7 2-2.5 4-2.5 6s.8 4 2.5 6M8 2c1.7 2 2.5 4 2.5 6S9.7 14 8 14"/>
      <line x1="2" y1="8" x2="14" y2="8"/>
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="2,3 5,7 8,3"/>
    </svg>
  );
}

/* ── Available locales ───────────────────────────────────────────────────── */

const LOCALES: { code: string; flag: string; label: string }[] = [
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
];

/* ── useClickOutside helper ──────────────────────────────────────────────── */

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  React.useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [ref, onClose]);
}

/* ── ExportDropdown ──────────────────────────────────────────────────────── */

function ExportDropdown({ exportBase, roomId }: { exportBase: string; roomId: string }) {
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setOpen(false), []);
  useClickOutside(ref, close);

  const items = [
    { format: "png", label: t("toolbar.exportPng"), icon: <IconPng /> },
    { format: "svg", label: t("toolbar.exportSvg"), icon: <IconSvg /> },
    { format: "pdf", label: t("toolbar.exportPdf"), icon: <IconPdf /> },
  ];

  return (
    <div className="tb-dropdown" ref={ref}>
      <button
        className="topbtn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("topbar.export")}
      >
        <IconExport />
        {t("topbar.export")}
        <IconChevronDown />
      </button>
      <div className={`tb-dropdown-menu${open ? " open" : ""}`} role="menu">
        {items.map(({ format, label, icon }) => (
          <a
            key={format}
            href={`${exportBase}?format=${format}`}
            download={`canvas-${roomId}.${format}`}
            className="tb-dropdown-item"
            role="menuitem"
            aria-label={label}
            onClick={() => setOpen(false)}
          >
            {icon}
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}

/* ── LocaleDropdown ──────────────────────────────────────────────────────── */

function LocaleDropdown() {
  const t = useTranslations();
  const locale = useLocale();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setOpen(false), []);
  useClickOutside(ref, close);

  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

  function switchLocale(code: string) {
    if (code === locale) {
      setOpen(false);
      return;
    }
    document.cookie = `NEXT_LOCALE=${code}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.reload();
  }

  return (
    <div className="tb-dropdown" ref={ref} aria-label={t("topbar.language")}>
      <button
        className="topbtn xs"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t("topbar.language")}: ${current.label}`}
      >
        <IconGlobe />
        <span>{current.flag} {current.code.toUpperCase()}</span>
        <IconChevronDown />
      </button>
      <div className={`tb-dropdown-menu right${open ? " open" : ""}`} role="listbox" aria-label={t("topbar.language")}>
        {LOCALES.map(({ code, flag, label }) => (
          <button
            key={code}
            role="option"
            aria-selected={code === locale}
            className={`tb-dropdown-item${code === locale ? " active-locale" : ""}`}
            onClick={() => switchLocale(code)}
          >
            <span className="tb-locale-flag" aria-hidden="true">{flag}</span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── ThemeToggle ─────────────────────────────────────────────────────────── */

/**
 * P078 – Theme toggle button.
 * Stores the user's choice in a `THEME` cookie.
 * Applies `theme-light` class to `<html>` immediately for instant feedback.
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
      className="topbtn xs"
      aria-label={isDark ? t("topbar.switchToLight") : t("topbar.switchToDark")}
      aria-pressed={!isDark}
      title={isDark ? t("topbar.switchToLight") : t("topbar.switchToDark")}
    >
      {isDark ? "☀" : "🌙"}
    </button>
  );
}

/* ── AppTopbar ───────────────────────────────────────────────────────────── */

export const AppTopbar = React.memo(function AppTopbar({ call, session, sessionStatus }: AppTopbarProps) {
  // P039: Resolve the current room ID from the URL query param for export links.
  const searchParams = useSearchParams();
  const roomId = searchParams.get("room") ?? "default";
  const exportBase = `/api/rooms/${encodeURIComponent(roomId)}/export`;

  // P050: translation helper
  const t = useTranslations();

  return (
    <header id="topbar" role="banner" aria-label="Application toolbar">
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

      <button
        className="topbtn"
        onClick={() => call("toggleCollabPanel")}
        aria-label="Toggle collaboration panel"
        aria-haspopup="dialog"
      >
        <IconCollab />
        {t("topbar.collab")}
      </button>

      <button
        className="topbtn danger"
        onClick={() => call("openMergeModal")}
        id="mergeBtn"
        aria-label="Open merge branch dialog"
        aria-haspopup="dialog"
      >
        <IconMerge />
        {t("topbar.merge")}
      </button>

      <button
        className="topbtn"
        onClick={() => call("openBranchCreate")}
        aria-label="Create a new branch"
        aria-haspopup="dialog"
      >
        <IconBranch />
        {t("topbar.branch")}
      </button>

      <button
        className="topbtn primary"
        onClick={() => call("openCommitModal")}
        id="commitBtn"
        aria-label="Commit current drawing changes"
        aria-haspopup="dialog"
      >
        <IconCommit />
        {t("topbar.commit")}
      </button>

      {/* P091: Share button – only meaningful for authenticated users (API enforces OWNER) */}
      {session?.user && (
        <button
          className="topbtn"
          onClick={() => call("openShareModal")}
          aria-label="Open share links dialog"
          aria-haspopup="dialog"
        >
          <IconShare />
          {t("topbar.share")}
        </button>
      )}

      {/* P039: Export dropdown – PNG / SVG / PDF */}
      <ExportDropdown exportBase={exportBase} roomId={roomId} />

      {/* Auth section */}
      <div className="sep" role="separator" aria-orientation="vertical"></div>

      {/* P050 – Locale dropdown */}
      <LocaleDropdown />

      {/* P078 – Theme toggle (dark/light) */}
      <ThemeToggle />

      <div className="sep" role="separator" aria-orientation="vertical"></div>

      {sessionStatus === "loading" ? null : session?.user ? (
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Link
            href="/dashboard"
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              background: "var(--s2)", border: "1px solid var(--bdr)",
              borderRadius: "6px", padding: "3px 10px",
              fontSize: "12px", color: "var(--tx)", textDecoration: "none",
              cursor: "pointer",
            }}
            aria-label={`Go to My Drawings (signed in as ${session.user.name ?? session.user.email})`}
          >
            <span aria-hidden="true">👤</span>
            <span style={{ maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {session.user.name ?? session.user.email}
            </span>
          </Link>
          <button
            className="topbtn"
            onClick={() => signOut({ callbackUrl: "/" })}
            aria-label="Sign out of SketchGit"
          >{t("topbar.signOut")}</button>
        </div>
      ) : (
        <button
          className="topbtn"
          onClick={() => signIn()}
          aria-label="Sign in or create a SketchGit account"
        >{t("topbar.signIn")}</button>
      )}
    </header>
  );
});
