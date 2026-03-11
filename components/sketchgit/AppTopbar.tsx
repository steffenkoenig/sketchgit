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
 */

import React from "react";
import Link from "next/link";
import type { Session } from "next-auth";
import { signIn, signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { SketchGitCall } from "@/components/sketchgit/types";

type AppTopbarProps = {
  call: SketchGitCall;
  session: Session | null;
  sessionStatus: "loading" | "authenticated" | "unauthenticated";
};

export const AppTopbar = React.memo(function AppTopbar({ call, session, sessionStatus }: AppTopbarProps) {
  // P039: Resolve the current room ID from the URL query param for export links.
  const searchParams = useSearchParams();
  const roomId = searchParams.get("room") ?? "default";
  const exportBase = `/api/rooms/${encodeURIComponent(roomId)}/export`;

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
      >⟳ Collab</Button>

      <Button
        variant="outline" size="sm"
        className="h-7 border-slate-700 bg-transparent text-slate-300 hover:border-rose-500 hover:bg-slate-800"
        onClick={() => call("openMergeModal")}
        id="mergeBtn"
        aria-label="Open merge branch dialog"
        aria-haspopup="dialog"
      >⇄ Merge</Button>

      <Button
        variant="outline" size="sm"
        className="h-7 border-slate-700 bg-transparent text-slate-300 hover:border-violet-500 hover:bg-slate-800"
        onClick={() => call("openBranchCreate")}
        aria-label="Create a new branch"
        aria-haspopup="dialog"
      >⎇ Branch</Button>

      <Button
        size="sm"
        className="h-7 bg-violet-600 text-white hover:bg-violet-500"
        onClick={() => call("openCommitModal")}
        id="commitBtn"
        aria-label="Commit current drawing changes"
        aria-haspopup="dialog"
      >● Commit</Button>

      {/* P039: Canvas export download links */}
      <a
        href={`${exportBase}?format=png`}
        download={`canvas-${roomId}.png`}
        className="inline-flex items-center h-7 px-3 rounded-md border border-slate-700 bg-transparent text-slate-300 text-xs font-medium hover:border-violet-500 hover:bg-slate-800 transition-colors"
        aria-label="Export canvas as PNG image"
      >⬇ PNG</a>
      <a
        href={`${exportBase}?format=svg`}
        download={`canvas-${roomId}.svg`}
        className="inline-flex items-center h-7 px-3 rounded-md border border-slate-700 bg-transparent text-slate-300 text-xs font-medium hover:border-violet-500 hover:bg-slate-800 transition-colors"
        aria-label="Export canvas as SVG vector file"
      >⬇ SVG</a>

      {/* Auth section */}
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
          >⤴ Sign out</Button>
        </div>
      ) : (
        <Button
          variant="outline" size="sm"
          className="h-7"
          onClick={() => signIn()}
          aria-label="Sign in or create a SketchGit account"
        >👤 Sign in</Button>
      )}
    </header>
  );
});
