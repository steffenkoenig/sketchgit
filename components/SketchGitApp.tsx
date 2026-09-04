"use client";
/**
 * SketchGitApp – root application shell.
 *
 * P021 – React performance optimizations:
 *  - `call()` dispatcher is memoized with useCallback so its reference is
 *    stable across renders.  Child components that receive it via props will
 *    not re-render due to a changed function reference.
 *  - Toolbar, topbar, and other sections are extracted into memoized sub-
 *    components (AppTopbar, LeftToolbar) so a session update only re-renders
 *    the minimal necessary subtree.
 *
 * P025 – Accessibility:
 *  - Skip-to-content link at the top of the page.
 *  - Landmark roles on major regions (banner via AppTopbar, main, complementary).
 *  - Canvas element has an aria-label.
 *  - Modal elements have role="dialog", aria-modal, and aria-labelledby.
 *
 * P050 – All user-visible strings replaced with useTranslations() calls so
 *  the existing messages/en.json + messages/de.json catalogues are consumed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { CanvasErrorBoundary } from "./errors/CanvasErrorBoundary";
import { TimelineErrorBoundary } from "./errors/TimelineErrorBoundary";
import { ModalErrorBoundary } from "./errors/ModalErrorBoundary";
import { AppTopbar } from "./sketchgit/AppTopbar";
import { LeftToolbar } from "./sketchgit/LeftToolbar";
import { PropertiesPanel } from "./sketchgit/PropertiesPanel";
import { ContextMenu } from "./sketchgit/ContextMenu";
import { ShareModal } from "./sketchgit/ShareModal";
import { MembersModal } from "./sketchgit/MembersModal";
import { RoomPasswordModal } from "./sketchgit/RoomPasswordModal";
import { RoomSettingsModal } from "./sketchgit/RoomSettingsModal";
import { ShapeLibraryModal } from "./sketchgit/ShapeLibraryModal";
import { MinimapPanel } from "./sketchgit/MinimapPanel";
import { CookieNotice } from "./sketchgit/CookieNotice";
import { CommitModal } from "./sketchgit/modals/CommitModal";
import { BranchModal } from "./sketchgit/modals/BranchModal";
import { BranchCreateModal } from "./sketchgit/modals/BranchCreateModal";
import { MergeModal } from "./sketchgit/modals/MergeModal";
import { ConflictModal } from "./sketchgit/modals/ConflictModal";
import { NameModal } from "./sketchgit/modals/NameModal";
import { ConfirmModal } from "./sketchgit/modals/ConfirmModal";
import type { SketchGitAppApi } from "./sketchgit/types";

export default function SketchGitApp() {
  const appRef = useRef<SketchGitAppApi | null>(null);
  const { data: session, status } = useSession();
  // P050 – access the pre-loaded translation catalogue
  const t = useTranslations();

  // ── Share modal state ──────────────────────────────────────────────────────
  // Opened from the topbar "Share" button (no pre-fill) or from the commit
  // popup "Share this commit" action (commitSha pre-filled).
  const [shareOpen, setShareOpen] = useState(false);
  const [shareCommitSha, setShareCommitSha] = useState<string | null>(null);
  // Read from window.location.search when the modal opens so the value is
  // always current even after the canvas engine calls history.replaceState().
  const [shareRoomId, setShareRoomId] = useState('default');

  // ── Members modal state ──────────────────────────────────────────────────
  const [membersOpen, setMembersOpen] = useState(false);
  const [membersRoomId, setMembersRoomId] = useState('default');

  // ── Room password modal state (P093) ─────────────────────────────────────
  const [roomPasswordOpen, setRoomPasswordOpen] = useState(false);
  const [roomPasswordRoomId, setRoomPasswordRoomId] = useState<string | null>(null);

  // ── Room settings modal state (P093) ─────────────────────────────────────
  const [roomSettingsOpen, setRoomSettingsOpen] = useState(false);
  const [roomSettingsRoomId, setRoomSettingsRoomId] = useState('default');

  // ── Shape library modal state (P095) ──────────────────────────────────────
  const [shapeLibraryOpen, setShapeLibraryOpen] = useState(false);
  const [shapeLibraryPendingSave, setShapeLibraryPendingSave] = useState<{ objects: object[] } | null>(null);

  // Listen for the canvas-side custom event that requests the share modal to open.
  useEffect(() => {
    function handleOpenShareModal(e: Event) {
      const detail = (e as CustomEvent<{ commitSha?: string }>).detail;
      setShareCommitSha(detail.commitSha ?? null);
      setShareRoomId(new URLSearchParams(window.location.search).get('room') ?? 'default');
      setShareOpen(true);
    }
    document.addEventListener('sketchgit:openShareModal', handleOpenShareModal);
    return () => document.removeEventListener('sketchgit:openShareModal', handleOpenShareModal);
  }, []);

  // Listen for the canvas-side custom event that requests the members modal to open.
  useEffect(() => {
    function handleOpenMembersModal() {
      setMembersRoomId(new URLSearchParams(window.location.search).get('room') ?? 'default');
      setMembersOpen(true);
    }
    document.addEventListener('sketchgit:openMembersModal', handleOpenMembersModal);
    return () => document.removeEventListener('sketchgit:openMembersModal', handleOpenMembersModal);
  }, []);

  // P093 – listen for the WS-layer custom event fired when the server
  // rejects the connection because the room needs a password.
  useEffect(() => {
    function handleRoomPasswordRequired(e: Event) {
      const detail = (e as CustomEvent<{ roomId: string }>).detail;
      setRoomPasswordRoomId(detail.roomId);
      setRoomPasswordOpen(true);
    }
    document.addEventListener('sketchgit:roomPasswordRequired', handleRoomPasswordRequired);
    return () => document.removeEventListener('sketchgit:roomPasswordRequired', handleRoomPasswordRequired);
  }, []);

  // P093 – listen for the topbar "Room Settings" button.
  useEffect(() => {
    function handleOpenRoomSettingsModal() {
      setRoomSettingsRoomId(new URLSearchParams(window.location.search).get('room') ?? 'default');
      setRoomSettingsOpen(true);
    }
    document.addEventListener('sketchgit:openRoomSettingsModal', handleOpenRoomSettingsModal);
    return () => document.removeEventListener('sketchgit:openRoomSettingsModal', handleOpenRoomSettingsModal);
  }, []);

  // P095 – listen for the "Shape Library" topbar button and the context
  // menu's "Save as Template" action (which pre-fills pendingSave).
  useEffect(() => {
    function handleOpenShapeLibraryModal(e: Event) {
      const detail = (e as CustomEvent<{ pendingSave?: { objects: object[] } }>).detail;
      setShapeLibraryPendingSave(detail.pendingSave ?? null);
      setShapeLibraryOpen(true);
    }
    document.addEventListener('sketchgit:openShapeLibraryModal', handleOpenShapeLibraryModal);
    return () => document.removeEventListener('sketchgit:openShapeLibraryModal', handleOpenShapeLibraryModal);
  }, []);

  // P020: Return a cleanup function so the engine is destroyed on unmount,
  //       preventing duplicate WebSocket connections and stacked event listeners
  //       in React Strict Mode and during component re-mounts.
  useEffect(() => {
    if (appRef.current) return;
    let cancelled = false;
    let app: SketchGitAppApi | null = null;

    // P058 – Dynamic import: the Fabric.js canvas engine (~350 KB gzip) is only
    // downloaded when the canvas component mounts, not on every page.
    void import("../lib/sketchgit/createSketchGitApp").then(({ createSketchGitApp }) => {
      if (cancelled) return;
      app = createSketchGitApp();
      appRef.current = app;
    });

    return () => {
      cancelled = true;
      app?.destroy();
      appRef.current = null;
    };
  }, []);

  // P021: Stabilize the dispatcher so child components receive a stable reference.
  // appRef is stable (useRef), so the empty dependency array is correct.
  const call = useCallback((method: keyof SketchGitAppApi, ...args: unknown[]) => {
    const app = appRef.current;
    if (!app || typeof app[method] !== "function") return;
    (app[method] as (...a: unknown[]) => void)(...args);
  }, []);

  // Stable getter for the live canvas JSON — used by ExportDropdown to POST
  // the canvas state directly and bypass the DB-based GET export endpoint.
  // appRef is stable (useRef), so the empty dependency array is correct.
  const getCanvasJson = useCallback((): string | null => {
    return appRef.current?.getCanvasJson?.() ?? null;
  }, []);

  // P096 — stable getter for the minimap's poll loop, same reasoning as
  // getCanvasJson above (call() is fire-and-forget and can't return a value).
  const getMinimapData = useCallback(() => {
    return appRef.current?.getMinimapData?.() ?? null;
  }, []);

  // P021: useMemo for session-derived display value so AppTopbar re-renders
  // only when the session user actually changes (not on every re-render).
  // The dependency array intentionally uses the nested fields directly – the
  // outer `session` reference changes on every NextAuth poll even when user
  // data is unchanged.
  const sessionForTopbar = useMemo(
    () => session ?? null,
    [session?.user?.name, session?.user?.email, session?.user?.image],
  );

  return (
    <>
      {/* P025: Skip navigation – lets keyboard users bypass the toolbar */}
      <a
        href="#canvas-wrap"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-violet-600 focus:text-white focus:rounded"
      >
        {t("toolbar.skipToCanvas")}
      </a>
      <AppTopbar call={call} session={sessionForTopbar} sessionStatus={status} getCanvasJson={getCanvasJson} />

      <div id="wrap">
        <div id="mid">
          {/* P021: LeftToolbar is memoized; re-renders only when call changes (never) */}
          <LeftToolbar call={call} />

          {/* P025: main landmark wraps the primary drawing area */}
          <main id="canvas-wrap" aria-label="Drawing canvas area">
            <CanvasErrorBoundary>
              <canvas
                id="c"
                aria-label="Sketch canvas — draw here using the toolbar tools on the left"
                role="img"
              />
              <div id="cursor-layer" aria-hidden="true"></div>
            </CanvasErrorBoundary>
            <div id="dirty" className="hide" role="status" aria-live="polite">
              <div className="yd" aria-hidden="true"></div>
              <span>{t("toolbar.uncommittedChanges")}</span>
              <button
                className="topbtn primary"
                style={{ padding: "2px 10px", fontSize: "10px" }}
                onClick={() => call("openCommitModal")}
                aria-label="Commit current changes"
                aria-haspopup="dialog"
              >{t("modal.commit.confirm")}</button>
            </div>

            {/* Properties panel – shown when a drawing tool is active or a shape is selected */}
            <PropertiesPanel call={call} />
          </main>

          {/* Right-click context menu overlay */}
          <ContextMenu call={call} />
        </div>

        {/* P025: complementary landmark for the timeline panel */}
        <aside id="timeline" aria-label="Version timeline">
          <TimelineErrorBoundary>
            <div id="tlbar">
            <span className="tl-label" aria-hidden="true">{t("timeline.title")}</span>
            <div className="tl-actions">
              <button className="topbtn" onClick={() => call("tlScrollLeft")} aria-label="Scroll timeline left">◀</button>
              <button className="topbtn" onClick={() => call("tlScrollRight")} aria-label="Scroll timeline right">▶</button>
            </div>
          </div>
            <div id="tlscroll" role="region" aria-label="Commit graph" tabIndex={0}>
              <svg id="tlsvg" aria-label="Git commit graph" role="img"></svg>
            </div>
          </TimelineErrorBoundary>
        </aside>
      </div>

      {/* P025: Collaboration panel – complementary landmark */}
      <aside
        id="collab-panel"
        aria-label="Live collaboration panel"
        role="complementary"
      >
        <h3>{t("collab.title")}</h3>
        <div className="peer-label">{t("collab.currentRoom")}</div>
        <div
          className="peer-id-box"
          id="myPeerId"
          onClick={() => call("copyPeerId")}
          role="button"
          tabIndex={0}
          aria-label="Room invite link — click to copy"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault(); // prevent page scroll on Space
              call("copyPeerId");
            }
          }}
        >{t("collab.notConnected")}</div>
        <div className="peer-label" style={{ marginTop: "8px" }}>
          <label htmlFor="remotePeerInput">{t("collab.roomIdLabel")}</label>
        </div>
        <input
          id="remotePeerInput"
          type="text"
          placeholder={t("collab.roomPlaceholder")}
          aria-label="Room ID to join"
          style={{ marginBottom: "8px" }}
        />
        <button
          className="mbtn ok"
          style={{ width: "100%" }}
          onClick={() => call("connectToPeer")}
          aria-label="Join the specified room"
        >{t("collab.joinRoom")}</button>
        <div id="peerStatus" className="peer-status" role="status" aria-live="polite"></div>
        <div id="connectedList" className="connected-list" role="list" aria-label="Connected peers"></div>
        {/* P080 – Presenter mode button */}
        <button
          id="presentBtn"
          className="mbtn"
          style={{ width: "100%", marginTop: "8px" }}
          onClick={() => call("togglePresenting")}
          aria-label="Toggle presenter mode — broadcast your canvas view to all peers"
        >{t("collab.present")}</button>
      </aside>

      {/* P025: Commit popup – floating popover panel (not a modal; no focus trap) */}
      <div
        id="commit-popup"
        role="dialog"
        aria-label="Commit details"
      >
        <button className="cp-close" onClick={() => call("closeCommitPopup")} aria-label="Close commit popup">✕</button>
        <div id="cp-head-badge" className="cp-head-badge" style={{ display: "none" }} aria-label="This is the current HEAD commit">{t("commitPopup.headBadge")}</div>
        <div className="cp-sha" id="cp-sha" aria-label="Commit SHA"></div>
        <div className="cp-msg" id="cp-msg" aria-label="Commit message"></div>
        <div className="cp-meta" id="cp-meta" aria-label="Branch and timestamp"></div>
        <div className="cp-actions">
          <button className="cp-btn accent" onClick={() => call("cpCheckout")} aria-label="View this commit (detached HEAD)">{t("commitPopup.view")}</button>
          <button className="cp-btn green" onClick={() => call("cpBranchFrom")} aria-label="Create a new branch from this commit">{t("commitPopup.newBranch")}</button>
          <button className="cp-btn" onClick={() => call("cpShareCommit")} aria-label="Share this commit via a link">{t("commitPopup.share")}</button>
          <div className="cp-divider" role="separator"></div>
          <button className="cp-btn warn" onClick={() => call("cpRollback")} aria-label="Roll back the current branch tip to this commit">{t("commitPopup.rollback")}</button>
        </div>
      </div>

      {/* P025: All modals use role="dialog", aria-modal, aria-labelledby */}
      <ModalErrorBoundary>
        <CommitModal call={call} />
      </ModalErrorBoundary>

      <ModalErrorBoundary>
        <BranchModal call={call} />
      </ModalErrorBoundary>

      <ModalErrorBoundary>
        <BranchCreateModal call={call} />
      </ModalErrorBoundary>

      <ModalErrorBoundary>
        <MergeModal call={call} />
      </ModalErrorBoundary>

      <ModalErrorBoundary>
        <ConflictModal call={call} />
      </ModalErrorBoundary>

      <ModalErrorBoundary>
        <NameModal call={call} />
      </ModalErrorBoundary>

      <div id="toast" role="status" aria-live="assertive" aria-atomic="true"></div>

      {/* P025: Accessible confirmation modal – replaces window.confirm() for destructive actions */}
      <ModalErrorBoundary>
        <ConfirmModal call={call} />
      </ModalErrorBoundary>

      {/* P091: Share links modal – opened from topbar or commit popup */}
      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        roomId={shareRoomId}
        prefilledCommitSha={shareCommitSha}
      />

      {/* P091: Room members/roles modal – opened from topbar */}
      <MembersModal
        isOpen={membersOpen}
        onClose={() => setMembersOpen(false)}
        roomId={membersRoomId}
      />

      <RoomPasswordModal
        isOpen={roomPasswordOpen}
        roomId={roomPasswordRoomId}
        onUnlocked={() => {
          setRoomPasswordOpen(false);
          call("retryRoomConnection");
        }}
      />

      <RoomSettingsModal
        isOpen={roomSettingsOpen}
        onClose={() => setRoomSettingsOpen(false)}
        roomId={roomSettingsRoomId}
      />

      <ShapeLibraryModal
        isOpen={shapeLibraryOpen}
        onClose={() => setShapeLibraryOpen(false)}
        pendingSave={shapeLibraryPendingSave}
        call={call}
      />

      <MinimapPanel call={call} getMinimapData={getMinimapData} />

      <CookieNotice />
    </>
  );
}
