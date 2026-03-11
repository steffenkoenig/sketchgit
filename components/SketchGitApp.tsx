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
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import { createSketchGitApp } from "../lib/sketchgit/createSketchGitApp";
import { AppTopbar } from "./sketchgit/AppTopbar";
import { LeftToolbar } from "./sketchgit/LeftToolbar";
import type { SketchGitAppApi } from "./sketchgit/types";

export default function SketchGitApp() {
  const appRef = useRef<SketchGitAppApi | null>(null);
  const { data: session, status } = useSession();

  // P018: Fabric.js is now bundled via npm – no CDN Script tag needed.
  // P020: Return a cleanup function so the engine is destroyed on unmount,
  //       preventing duplicate WebSocket connections and stacked event listeners
  //       in React Strict Mode and during component re-mounts.
  useEffect(() => {
    if (appRef.current) return;
    const app = createSketchGitApp();
    appRef.current = app;
    return () => {
      app.destroy();
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

  // P021: useMemo for session-derived display value so AppTopbar re-renders
  // only when the session user actually changes (not on every re-render).
  // The dependency array intentionally uses the nested fields directly – the
  // outer `session` reference changes on every NextAuth poll even when user
  // data is unchanged.
  const sessionForTopbar = useMemo(
    () => session ?? null,
    [session?.user?.name, session?.user?.email, session?.user?.image], // eslint-disable-line
  );

  return (
    <>
      {/* P025: Skip navigation – lets keyboard users bypass the toolbar */}
      <a
        href="#canvas-wrap"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-violet-600 focus:text-white focus:rounded"
      >
        Skip to canvas
      </a>

      {/* P021: AppTopbar is memoized; re-renders only when session changes */}
      <AppTopbar call={call} session={sessionForTopbar} sessionStatus={status} />

      <div id="wrap">
        <div id="mid">
          {/* P021: LeftToolbar is memoized; re-renders only when call changes (never) */}
          <LeftToolbar call={call} />

          {/* P025: main landmark wraps the primary drawing area */}
          <main id="canvas-wrap" aria-label="Drawing canvas area">
            <canvas
              id="c"
              aria-label="Sketch canvas — draw here using the toolbar tools on the left"
              role="img"
            />
            <div id="cursor-layer" aria-hidden="true"></div>
            <div id="dirty" className="hide" role="status" aria-live="polite">
              <div className="yd" aria-hidden="true"></div>
              <span>Uncommitted changes</span>
              <button
                className="topbtn primary"
                style={{ padding: "2px 10px", fontSize: "10px" }}
                onClick={() => call("openCommitModal")}
                aria-label="Commit current changes"
                aria-haspopup="dialog"
              >Commit</button>
            </div>
          </main>
        </div>

        {/* P025: complementary landmark for the timeline panel */}
        <aside id="timeline" aria-label="Version timeline">
          <div id="tlbar">
            <span className="tl-label" aria-hidden="true">⌥ Version Timeline</span>
            <div className="tl-actions">
              <button className="topbtn" onClick={() => call("tlScrollLeft")} aria-label="Scroll timeline left">◀</button>
              <button className="topbtn" onClick={() => call("tlScrollRight")} aria-label="Scroll timeline right">▶</button>
            </div>
          </div>
          <div id="tlscroll" role="region" aria-label="Commit graph" tabIndex={0}>
            <svg id="tlsvg" aria-label="Git commit graph" role="img"></svg>
          </div>
        </aside>
      </div>

      {/* P025: Collaboration panel – complementary landmark */}
      <aside
        id="collab-panel"
        aria-label="Live collaboration panel"
        role="complementary"
      >
        <h3>⟳ Live Collaboration</h3>
        <div className="peer-label">Current room (click to copy invite link)</div>
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
        >Not connected</div>
        <div className="peer-label" style={{ marginTop: "8px" }}>
          <label htmlFor="remotePeerInput">Room ID</label>
        </div>
        <input
          id="remotePeerInput"
          type="text"
          placeholder="e.g. sketch-session"
          aria-label="Room ID to join"
          style={{ marginBottom: "8px" }}
        />
        <button
          className="mbtn ok"
          style={{ width: "100%" }}
          onClick={() => call("connectToPeer")}
          aria-label="Join the specified room"
        >Join Room</button>
        <div id="peerStatus" className="peer-status" role="status" aria-live="polite"></div>
        <div id="connectedList" className="connected-list" role="list" aria-label="Connected peers"></div>
      </aside>

      {/* P025: Commit popup – floating popover panel (not a modal; no focus trap) */}
      <div
        id="commit-popup"
        role="dialog"
        aria-label="Commit details"
      >
        <button className="cp-close" onClick={() => call("closeCommitPopup")} aria-label="Close commit popup">✕</button>
        <div id="cp-head-badge" className="cp-head-badge" style={{ display: "none" }} aria-label="This is the current HEAD commit">◉ HEAD</div>
        <div className="cp-sha" id="cp-sha" aria-label="Commit SHA"></div>
        <div className="cp-msg" id="cp-msg" aria-label="Commit message"></div>
        <div className="cp-meta" id="cp-meta" aria-label="Branch and timestamp"></div>
        <div className="cp-actions">
          <button className="cp-btn accent" onClick={() => call("cpCheckout")} aria-label="View this commit (detached HEAD)">⤵ View this commit</button>
          <button className="cp-btn green" onClick={() => call("cpBranchFrom")} aria-label="Create a new branch from this commit">⎇ New branch from here</button>
          <div className="cp-divider" role="separator"></div>
          <button className="cp-btn warn" onClick={() => call("cpRollback")} aria-label="Roll back the current branch tip to this commit">⚠ Rollback branch to here</button>
        </div>
      </div>

      {/* P025: All modals use role="dialog", aria-modal, aria-labelledby */}
      <div className="overlay" id="commitModal" role="dialog" aria-modal="true" aria-labelledby="commitModalTitle">
        <div className="modal">
          <h2 id="commitModalTitle">● Commit Changes</h2>
          <label htmlFor="commitMsg">Commit message</label>
          <input id="commitMsg" type="text" placeholder="Describe what you drew..." />
          <div className="modal-actions">
            <button className="mbtn" onClick={() => call("closeModal", "commitModal")} aria-label="Cancel and close the commit dialog">Cancel</button>
            <button className="mbtn ok" onClick={() => call("doCommit")} aria-label="Save a new commit with the entered message">Commit</button>
          </div>
        </div>
      </div>

      <div className="overlay" id="branchModal" role="dialog" aria-modal="true" aria-labelledby="branchModalTitle">
        <div className="modal">
          <h2 id="branchModalTitle">⎇ Branches</h2>
          <div id="branchListEl" className="branch-list" role="list" aria-label="Available branches"></div>
          <div className="modal-actions">
            <button className="mbtn" onClick={() => call("closeModal", "branchModal")} aria-label="Close the branches dialog">Close</button>
            <button className="mbtn ok" onClick={() => call("openBranchCreate")} aria-label="Create a new branch" aria-haspopup="dialog">+ New Branch</button>
          </div>
        </div>
      </div>

      <div className="overlay" id="branchCreateModal" role="dialog" aria-modal="true" aria-labelledby="branchCreateModalTitle">
        <div className="modal">
          <h2 id="branchCreateModalTitle">⎇ New Branch</h2>
          <div className="info-box" id="branchFromInfo" aria-live="polite"></div>
          <label htmlFor="newBranchName">Branch name</label>
          <input id="newBranchName" type="text" placeholder="feature/my-idea" />
          <div className="modal-actions">
            <button className="mbtn" onClick={() => call("closeModal", "branchCreateModal")} aria-label="Cancel creating a new branch">Cancel</button>
            <button className="mbtn ok" onClick={() => call("doCreateBranch")} aria-label="Create the new branch">Create Branch</button>
          </div>
        </div>
      </div>

      <div className="overlay" id="mergeModal" role="dialog" aria-modal="true" aria-labelledby="mergeModalTitle">
        <div className="modal">
          <h2 id="mergeModalTitle">⇄ Merge Branch</h2>
          <div className="info-box">Merge another branch <b>into</b> <span id="mergeTargetName" aria-live="polite"></span>. Objects are tracked by UUID — duplicates are detected and conflicts resolved.</div>
          <label htmlFor="mergeSourceSelect">Source branch (merge from)</label>
          <select id="mergeSourceSelect" aria-label="Select source branch to merge from"></select>
          <div className="modal-actions">
            <button className="mbtn" onClick={() => call("closeModal", "mergeModal")} aria-label="Cancel the merge">Cancel</button>
            <button className="mbtn warn" onClick={() => call("doMerge")} aria-label="Perform the merge">Merge</button>
          </div>
        </div>
      </div>

      <div className="overlay" id="conflictModal" role="dialog" aria-modal="true" aria-labelledby="conflictModalTitle">
        <div className="modal" style={{ maxWidth: "640px", minWidth: "500px" }}>
          <h2 id="conflictModalTitle">⚡ Merge Conflicts</h2>
          <div className="conflict-header" role="alert">
            <span aria-hidden="true">⚠</span>
            <span id="conflictSummary">Some objects were changed in both branches. Choose which version to keep for each conflict.</span>
          </div>
          <div className="conflict-list" id="conflictList" role="list" aria-label="Merge conflicts"></div>
          <div className="conflict-stats" id="conflictStats" aria-live="polite" aria-label="Resolution progress"></div>
          <div className="modal-actions">
            <button className="mbtn" onClick={() => call("resolveAllOurs")} aria-label="Resolve all conflicts by keeping our version">← All: Ours</button>
            <button className="mbtn" onClick={() => call("resolveAllTheirs")} aria-label="Resolve all conflicts by keeping their version">All: Theirs →</button>
            <div style={{ flex: 1 }} aria-hidden="true"></div>
            <button className="mbtn" onClick={() => call("closeModal", "conflictModal")} aria-label="Cancel the merge and close the conflict dialog">Cancel</button>
            <button className="mbtn ok" id="applyMergeBtn" onClick={() => call("applyMergeResolution")} aria-label="Apply the selected conflict resolutions and complete the merge">✓ Apply Merge</button>
          </div>
        </div>
      </div>

      <div className="overlay" id="nameModal" role="dialog" aria-modal="true" aria-labelledby="nameModalTitle">
        <div className="modal">
          <h2 id="nameModalTitle">👤 Welcome to SketchGit</h2>
          <label htmlFor="nameInput">Your display name</label>
          <input id="nameInput" type="text" placeholder="e.g. Alice" autoFocus />
          <div className="modal-actions">
            <button className="mbtn ok" onClick={() => call("setName")} aria-label="Set your display name and start drawing">Start Drawing</button>
          </div>
        </div>
      </div>

      <div id="toast" role="status" aria-live="assertive" aria-atomic="true"></div>
    </>
  );
}
