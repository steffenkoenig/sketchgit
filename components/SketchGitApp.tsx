"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { createSketchGitApp } from "../lib/sketchgit/createSketchGitApp";

type SketchGitAppApi = ReturnType<typeof createSketchGitApp>;

export default function SketchGitApp() {
  const appRef = useRef<SketchGitAppApi | null>(null);
  const [fabricReady, setFabricReady] = useState(false);
  const { data: session, status } = useSession();

  useEffect(() => {
    if (!fabricReady || appRef.current) return;
    appRef.current = createSketchGitApp();
  }, [fabricReady]);

  const call = (method: keyof SketchGitAppApi, ...args: any[]) => {
    const app = appRef.current;
    if (!app || typeof app[method] !== "function") return;
    (app[method] as (...methodArgs: any[]) => void)(...args);
  };

  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js"
        strategy="beforeInteractive"
        onLoad={() => setFabricReady(true)}
      />

      <div id="topbar">
        <div className="logo">
          <div className="logo-badge">⌥</div>
          SketchGit
        </div>
        <div className="branch-selector" id="currentBranchBtn" onClick={() => call("openBranchModal")}>
          <div className="dot" id="currentBranchDot" style={{ background: "var(--a1)" }}></div>
          <span id="currentBranchName">main</span>
          <span style={{ color: "var(--tx3)", marginLeft: "2px" }}>▾</span>
        </div>
        <span style={{ fontSize: "10px", color: "var(--tx3)" }} id="headSHA"></span>
        <div className="sep"></div>
        <div className="avatar-row" id="avatarRow"></div>
        <div className="live-ind" id="liveInd" style={{ display: "none" }}></div>
        <button className="topbtn" onClick={() => call("toggleCollabPanel")}>⟳ Collab</button>
        <button className="topbtn danger" onClick={() => call("openMergeModal")} id="mergeBtn">⇄ Merge</button>
        <button className="topbtn" onClick={() => call("openBranchCreate")}>⎇ Branch</button>
        <button className="topbtn primary" onClick={() => call("openCommitModal")} id="commitBtn">● Commit</button>

        {/* Auth section */}
        <div className="sep"></div>
        {status === "loading" ? null : session?.user ? (
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
              title="My Drawings"
            >
              <span>👤</span>
              <span style={{ maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {session.user.name ?? session.user.email}
              </span>
            </Link>
            <button
              className="topbtn"
              onClick={() => signOut({ callbackUrl: "/" })}
              title="Sign out"
            >
              ⤴ Sign out
            </button>
          </div>
        ) : (
          <button
            className="topbtn"
            onClick={() => signIn()}
            title="Sign in or create an account"
          >
            👤 Sign in
          </button>
        )}
      </div>

      <div id="wrap">
        <div id="mid">
          <div id="toolbar">
            <button className="tbtn on" id="tsel" onClick={() => call("setTool", "select")} title="select">
              <svg viewBox="0 0 24 24"><path d="M5 3l14 9-7 1-4 6z"/></svg>
              <span className="tt">Select (S)</span>
            </button>
            <div className="tsep"></div>
            <button className="tbtn" id="tpen" onClick={() => call("setTool", "pen")}>
              <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              <span className="tt">Pen (P)</span>
            </button>
            <button className="tbtn" id="tline" onClick={() => call("setTool", "line")}>
              <svg viewBox="0 0 24 24"><line x1="5" y1="19" x2="19" y2="5"/></svg>
              <span className="tt">Line (L)</span>
            </button>
            <button className="tbtn" id="tarrow" onClick={() => call("setTool", "arrow")}>
              <svg viewBox="0 0 24 24"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="12 5 19 5 19 12"/></svg>
              <span className="tt">Arrow (A)</span>
            </button>
            <button className="tbtn" id="trect" onClick={() => call("setTool", "rect")}>
              <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
              <span className="tt">Rectangle (R)</span>
            </button>
            <button className="tbtn" id="tellipse" onClick={() => call("setTool", "ellipse")}>
              <svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="10" ry="6"/></svg>
              <span className="tt">Ellipse (E)</span>
            </button>
            <button className="tbtn" id="ttext" onClick={() => call("setTool", "text")}>
              <svg viewBox="0 0 24 24"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
              <span className="tt">Text (T)</span>
            </button>
            <div className="tsep"></div>
            <button className="tbtn" id="terase" onClick={() => call("setTool", "eraser")}>
              <svg viewBox="0 0 24 24"><path d="M20 20H7L3 16l13-13 7 7-3 3"/><line x1="6" y1="20" x2="19" y2="20"/></svg>
              <span className="tt">Eraser (X)</span>
            </button>
            <div className="tsep"></div>
            <div className="color-dot" id="strokeDot" title="Stroke color" style={{ background: "#e2e2ef" }}>
              <input type="color" id="strokeColorInput" defaultValue="#e2e2ef" onInput={(e) => call("updateStrokeColor", (e.currentTarget as HTMLInputElement).value)} />
            </div>
            <div className="color-dot" id="fillDot" title="Fill color" style={{ background: "transparent", borderStyle: "dashed" }}>
              <input type="color" id="fillColorInput" defaultValue="#1a1a2e" onInput={(e) => call("updateFillColor", (e.currentTarget as HTMLInputElement).value)} />
            </div>
            <button className="tbtn" id="tfillToggle" onClick={() => call("toggleFill")} title="Toggle fill" style={{ fontSize: "11px", height: "30px", marginTop: "-2px" }}>
              <span className="tt">Toggle Fill</span>⊡
            </button>
            <div className="tsep"></div>
            <button className="sz-btn on" id="sz1" onClick={() => call("setStrokeWidth", 1.5)}><div className="sz-line" style={{ height: "1.5px" }}></div></button>
            <button className="sz-btn" id="sz3" onClick={() => call("setStrokeWidth", 3)}><div className="sz-line" style={{ height: "3px" }}></div></button>
            <button className="sz-btn" id="sz5" onClick={() => call("setStrokeWidth", 5)}><div className="sz-line" style={{ height: "5px" }}></div></button>
            <div className="tsep"></div>
            <button className="tbtn" onClick={() => call("zoomIn")}><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg><span className="tt">Zoom In (+)</span></button>
            <button className="tbtn" onClick={() => call("zoomOut")}><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg><span className="tt">Zoom Out (-)</span></button>
            <button className="tbtn" onClick={() => call("resetZoom")}><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg><span className="tt">Reset View</span></button>
          </div>

          <div id="canvas-wrap">
            <canvas id="c"></canvas>
            <div id="cursor-layer"></div>
            <div id="dirty" className="hide">
              <div className="yd"></div>
              <span>Uncommitted changes</span>
              <button className="topbtn primary" style={{ padding: "2px 10px", fontSize: "10px" }} onClick={() => call("openCommitModal")}>Commit</button>
            </div>
          </div>
        </div>

        <div id="timeline">
          <div id="tlbar">
            <span className="tl-label">⌥ Version Timeline</span>
            <div className="tl-actions">
              <button className="topbtn" onClick={() => call("tlScrollLeft")}>◀</button>
              <button className="topbtn" onClick={() => call("tlScrollRight")}>▶</button>
            </div>
          </div>
          <div id="tlscroll"><svg id="tlsvg"></svg></div>
        </div>
      </div>

      <div id="collab-panel">
        <h3>⟳ Live Collaboration</h3>
        <div className="peer-label">Current room (click to copy invite link)</div>
        <div className="peer-id-box" id="myPeerId" onClick={() => call("copyPeerId")}>Not connected</div>
        <div className="peer-label" style={{ marginTop: "8px" }}>Room ID</div>
        <input id="remotePeerInput" type="text" placeholder="e.g. sketch-session" style={{ marginBottom: "8px" }} />
        <button className="mbtn ok" style={{ width: "100%" }} onClick={() => call("connectToPeer")}>Join Room</button>
        <div id="peerStatus" className="peer-status"></div>
        <div id="connectedList" className="connected-list"></div>
      </div>

      <div id="commit-popup">
        <button className="cp-close" onClick={() => call("closeCommitPopup")}>✕</button>
        <div id="cp-head-badge" className="cp-head-badge" style={{ display: "none" }}>◉ HEAD</div>
        <div className="cp-sha" id="cp-sha"></div>
        <div className="cp-msg" id="cp-msg"></div>
        <div className="cp-meta" id="cp-meta"></div>
        <div className="cp-actions">
          <button className="cp-btn accent" onClick={() => call("cpCheckout")}>⤵ View this commit</button>
          <button className="cp-btn green" onClick={() => call("cpBranchFrom")}>⎇ New branch from here</button>
          <div className="cp-divider"></div>
          <button className="cp-btn warn" onClick={() => call("cpRollback")}>⚠ Rollback branch to here</button>
        </div>
      </div>

      <div className="overlay" id="commitModal">
        <div className="modal">
          <h2>● Commit Changes</h2>
          <label>Commit message</label>
          <input id="commitMsg" type="text" placeholder="Describe what you drew..." />
          <div className="modal-actions">
            <button className="mbtn" onClick={() => call("closeModal", "commitModal")}>Cancel</button>
            <button className="mbtn ok" onClick={() => call("doCommit")}>Commit</button>
          </div>
        </div>
      </div>

      <div className="overlay" id="branchModal">
        <div className="modal">
          <h2>⎇ Branches</h2>
          <div id="branchListEl" className="branch-list"></div>
          <div className="modal-actions">
            <button className="mbtn" onClick={() => call("closeModal", "branchModal")}>Close</button>
            <button className="mbtn ok" onClick={() => call("openBranchCreate")}>+ New Branch</button>
          </div>
        </div>
      </div>

      <div className="overlay" id="branchCreateModal">
        <div className="modal">
          <h2>⎇ New Branch</h2>
          <div className="info-box" id="branchFromInfo"></div>
          <label>Branch name</label>
          <input id="newBranchName" type="text" placeholder="feature/my-idea" />
          <div className="modal-actions">
            <button className="mbtn" onClick={() => call("closeModal", "branchCreateModal")}>Cancel</button>
            <button className="mbtn ok" onClick={() => call("doCreateBranch")}>Create Branch</button>
          </div>
        </div>
      </div>

      <div className="overlay" id="mergeModal">
        <div className="modal">
          <h2>⇄ Merge Branch</h2>
          <div className="info-box">Merge another branch <b>into</b> <span id="mergeTargetName"></span>. Objects sind per UUID verfolgt — Duplikate werden erkannt und Konflikte aufgelöst.</div>
          <label>Source branch (merge from)</label>
          <select id="mergeSourceSelect"></select>
          <div className="modal-actions">
            <button className="mbtn" onClick={() => call("closeModal", "mergeModal")}>Cancel</button>
            <button className="mbtn warn" onClick={() => call("doMerge")}>Merge</button>
          </div>
        </div>
      </div>

      <div className="overlay" id="conflictModal">
        <div className="modal" style={{ maxWidth: "640px", minWidth: "500px" }}>
          <h2>⚡ Merge Conflicts</h2>
          <div className="conflict-header">
            <span>⚠</span>
            <span id="conflictSummary">Einige Objekte wurden in beiden Branches geändert. Wähle für jeden Konflikt, welche Version übernommen werden soll.</span>
          </div>
          <div className="conflict-list" id="conflictList"></div>
          <div className="conflict-stats" id="conflictStats"></div>
          <div className="modal-actions">
            <button className="mbtn" onClick={() => call("resolveAllOurs")}>← Alle: Ours</button>
            <button className="mbtn" onClick={() => call("resolveAllTheirs")}>Alle: Theirs →</button>
            <div style={{ flex: 1 }}></div>
            <button className="mbtn" onClick={() => call("closeModal", "conflictModal")}>Cancel</button>
            <button className="mbtn ok" id="applyMergeBtn" onClick={() => call("applyMergeResolution")}>✓ Merge anwenden</button>
          </div>
        </div>
      </div>

      <div className="overlay" id="nameModal">
        <div className="modal">
          <h2>👤 Welcome to SketchGit</h2>
          <label>Your display name</label>
          <input id="nameInput" type="text" placeholder="e.g. Alice" />
          <div className="modal-actions">
            <button className="mbtn ok" onClick={() => call("setName")}>Start Drawing</button>
          </div>
        </div>
      </div>

      <div id="toast"></div>
    </>
  );
}
