import { Button } from "@/components/ui/button";
import type { SketchGitCall } from "@/components/sketchgit/types";

type AppTopbarProps = {
  call: SketchGitCall;
};

export function AppTopbar({ call }: AppTopbarProps) {
  return (
    <div id="topbar" className="border-b border-slate-800">
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
      <Button variant="outline" size="sm" className="h-7 border-slate-700 bg-transparent text-slate-300 hover:border-violet-500 hover:bg-slate-800" onClick={() => call("toggleCollabPanel")}>⟳ Collab</Button>
      <Button variant="outline" size="sm" className="h-7 border-slate-700 bg-transparent text-slate-300 hover:border-rose-500 hover:bg-slate-800" onClick={() => call("openMergeModal")} id="mergeBtn">⇄ Merge</Button>
      <Button variant="outline" size="sm" className="h-7 border-slate-700 bg-transparent text-slate-300 hover:border-violet-500 hover:bg-slate-800" onClick={() => call("openBranchCreate")}>⎇ Branch</Button>
      <Button size="sm" className="h-7 bg-violet-600 text-white hover:bg-violet-500" onClick={() => call("openCommitModal")} id="commitBtn">● Commit</Button>
    </div>
  );
}
