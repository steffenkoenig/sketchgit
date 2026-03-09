import type { SketchGitCall } from "@/components/sketchgit/types";

type LeftToolbarProps = {
  call: SketchGitCall;
};

export function LeftToolbar({ call }: LeftToolbarProps) {
  return (
    <div id="toolbar" className="bg-slate-950/80">
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
  );
}
