"use client";
/**
 * LeftToolbar – the vertical drawing tool strip.
 *
 * P021: Wrapped with React.memo so it only re-renders when its `call` prop
 * changes (which is stable due to useCallback in SketchGitApp.tsx).
 *
 * P025: All interactive controls have accessible labels:
 *  - role="toolbar" on the container enables arrow-key navigation (ARIA pattern).
 *  - aria-label on every button provides a programmatic name for screen readers.
 *  - aria-hidden="true" on decorative SVG icons prevents double-announcement.
 *  - <label> elements (visually hidden via .sr-only) on color pickers.
 */

import React from "react";
import type { SketchGitCall } from "@/components/sketchgit/types";

type LeftToolbarProps = {
  call: SketchGitCall;
};

export const LeftToolbar = React.memo(function LeftToolbar({ call }: LeftToolbarProps) {
  return (
    <div
      id="toolbar"
      className="bg-slate-950/80"
      role="toolbar"
      aria-label="Drawing tools"
      aria-orientation="vertical"
    >
      <button className="tbtn on" id="tselect" onClick={() => call("setTool", "select")} aria-label="Select tool (S)" aria-pressed="false">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 3l14 9-7 1-4 6z"/></svg>
        <span className="tt" aria-hidden="true">Select (S)</span>
      </button>
      <div className="tsep" role="separator"></div>
      <button className="tbtn" id="tpen" onClick={() => call("setTool", "pen")} aria-label="Pen tool (P)" aria-pressed="false">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        <span className="tt" aria-hidden="true">Pen (P)</span>
      </button>
      <button className="tbtn" id="tline" onClick={() => call("setTool", "line")} aria-label="Line tool (L)" aria-pressed="false">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><line x1="5" y1="19" x2="19" y2="5"/></svg>
        <span className="tt" aria-hidden="true">Line (L)</span>
      </button>
      <button className="tbtn" id="tarrow" onClick={() => call("setTool", "arrow")} aria-label="Arrow tool (A)" aria-pressed="false">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="12 5 19 5 19 12"/></svg>
        <span className="tt" aria-hidden="true">Arrow (A)</span>
      </button>
      <button className="tbtn" id="trect" onClick={() => call("setTool", "rect")} aria-label="Rectangle tool (R)" aria-pressed="false">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
        <span className="tt" aria-hidden="true">Rectangle (R)</span>
      </button>
      <button className="tbtn" id="tellipse" onClick={() => call("setTool", "ellipse")} aria-label="Ellipse tool (E)" aria-pressed="false">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><ellipse cx="12" cy="12" rx="10" ry="6"/></svg>
        <span className="tt" aria-hidden="true">Ellipse (E)</span>
      </button>
      <button className="tbtn" id="ttext" onClick={() => call("setTool", "text")} aria-label="Text tool (T)" aria-pressed="false">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
        <span className="tt" aria-hidden="true">Text (T)</span>
      </button>
      <div className="tsep" role="separator"></div>
      <button className="tbtn" id="teraser" onClick={() => call("setTool", "eraser")} aria-label="Eraser tool (X)" aria-pressed="false">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 20H7L3 16l13-13 7 7-3 3"/><line x1="6" y1="20" x2="19" y2="20"/></svg>
        <span className="tt" aria-hidden="true">Eraser (X)</span>
      </button>
      <div className="tsep" role="separator"></div>

      {/* Color pickers with visible labels for screen readers */}
      <div className="color-dot" id="strokeDot" style={{ background: "#e2e2ef" }}>
        <label htmlFor="strokeColorInput" className="sr-only">Stroke colour</label>
        <input
          type="color"
          id="strokeColorInput"
          defaultValue="#e2e2ef"
          aria-label="Stroke colour"
          onInput={(e) => call("updateStrokeColor", (e.currentTarget as HTMLInputElement).value)}
        />
      </div>
      <div className="color-dot" id="fillDot" style={{ background: "transparent", borderStyle: "dashed" }}>
        <label htmlFor="fillColorInput" className="sr-only">Fill colour</label>
        <input
          type="color"
          id="fillColorInput"
          defaultValue="#1a1a2e"
          aria-label="Fill colour"
          onInput={(e) => call("updateFillColor", (e.currentTarget as HTMLInputElement).value)}
        />
      </div>
      <button className="tbtn" id="tfillToggle" onClick={() => call("toggleFill")} aria-label="Toggle fill on/off" aria-pressed="false" style={{ fontSize: "11px", height: "30px", marginTop: "-2px" }}>
        <span className="tt" aria-hidden="true">Toggle Fill</span>⊡
      </button>

      <div className="tsep" role="separator"></div>

      {/* Stroke width */}
      <button className="sz-btn on" id="sz1" onClick={() => call("setStrokeWidth", 1.5)} aria-label="Thin stroke (1.5px)" aria-pressed="true"><div className="sz-line" style={{ height: "1.5px" }} aria-hidden="true"></div></button>
      <button className="sz-btn" id="sz3" onClick={() => call("setStrokeWidth", 3)} aria-label="Medium stroke (3px)" aria-pressed="false"><div className="sz-line" style={{ height: "3px" }} aria-hidden="true"></div></button>
      <button className="sz-btn" id="sz5" onClick={() => call("setStrokeWidth", 5)} aria-label="Thick stroke (5px)" aria-pressed="false"><div className="sz-line" style={{ height: "5px" }} aria-hidden="true"></div></button>

      <div className="tsep" role="separator"></div>

      {/* Stroke dash type */}
      <button className="sz-btn on" id="dash-solid" onClick={() => call("setStrokeDash", "solid")} aria-label="Solid stroke" aria-pressed="true">
        <div className="sz-line" style={{ height: "2px" }} aria-hidden="true"></div>
        <span className="tt" aria-hidden="true">Solid</span>
      </button>
      <button className="sz-btn" id="dash-dashed" onClick={() => call("setStrokeDash", "dashed")} aria-label="Dashed stroke" aria-pressed="false">
        <div className="sz-line dashed" aria-hidden="true"></div>
        <span className="tt" aria-hidden="true">Dashed</span>
      </button>
      <button className="sz-btn" id="dash-dotted" onClick={() => call("setStrokeDash", "dotted")} aria-label="Dotted stroke" aria-pressed="false">
        <div className="sz-line dotted" aria-hidden="true"></div>
        <span className="tt" aria-hidden="true">Dotted</span>
      </button>

      <div className="tsep" role="separator"></div>

      {/* Border radius */}
      <button className="sz-btn on" id="br-sharp" onClick={() => call("setBorderRadius", "sharp")} aria-label="Sharp corners" aria-pressed="true">
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.6 }}><rect x="3" y="3" width="12" height="12" rx="0"/></svg>
        <span className="tt" aria-hidden="true">Sharp</span>
      </button>
      <button className="sz-btn" id="br-rounded" onClick={() => call("setBorderRadius", "rounded")} aria-label="Rounded corners" aria-pressed="false">
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.6 }}><rect x="3" y="3" width="12" height="12" rx="4"/></svg>
        <span className="tt" aria-hidden="true">Rounded</span>
      </button>

      <div className="tsep" role="separator"></div>

      {/* Fill pattern */}
      <button className="sz-btn on" id="fp-filled" onClick={() => call("setFillPattern", "filled")} aria-label="Solid fill" aria-pressed="true">
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false"><rect x="3" y="3" width="12" height="12" rx="1" fill="currentColor" opacity="0.7"/></svg>
        <span className="tt" aria-hidden="true">Filled</span>
      </button>
      <button className="sz-btn" id="fp-striped" onClick={() => call("setFillPattern", "striped")} aria-label="Striped fill" aria-pressed="false">
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.2 }}><rect x="3" y="3" width="12" height="12" rx="1"/><line x1="3" y1="9" x2="9" y2="3"/><line x1="6" y1="15" x2="15" y2="6"/><line x1="9" y1="15" x2="15" y2="9"/></svg>
        <span className="tt" aria-hidden="true">Striped</span>
      </button>
      <button className="sz-btn" id="fp-crossed" onClick={() => call("setFillPattern", "crossed")} aria-label="Crossed fill" aria-pressed="false">
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.2 }}><rect x="3" y="3" width="12" height="12" rx="1"/><line x1="3" y1="9" x2="9" y2="3"/><line x1="6" y1="15" x2="15" y2="6"/><line x1="9" y1="15" x2="15" y2="9"/><line x1="3" y1="9" x2="9" y2="15"/><line x1="6" y1="3" x2="15" y2="12"/></svg>
        <span className="tt" aria-hidden="true">Crossed</span>
      </button>

      <div className="tsep" role="separator"></div>

      {/* Sloppiness / stroke type */}
      <button className="sz-btn on" id="sloppy-architect" onClick={() => call("setSloppiness", "architect")} aria-label="Architect style (clean)" aria-pressed="true">
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.8, strokeLinecap: "butt" }}><line x1="4" y1="14" x2="14" y2="4"/></svg>
        <span className="tt" aria-hidden="true">Architect</span>
      </button>
      <button className="sz-btn" id="sloppy-artist" onClick={() => call("setSloppiness", "artist")} aria-label="Artist style (slightly rough)" aria-pressed="false">
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.8, strokeLinecap: "round" }}><path d="M4 14 Q7 5 14 4"/></svg>
        <span className="tt" aria-hidden="true">Artist</span>
      </button>
      <button className="sz-btn" id="sloppy-cartoonist" onClick={() => call("setSloppiness", "cartoonist")} aria-label="Cartoonist style (rough)" aria-pressed="false">
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" style={{ stroke: "currentColor", fill: "none", strokeWidth: 2.5, strokeLinecap: "round" }}><path d="M4 14 Q9 3 14 4"/></svg>
        <span className="tt" aria-hidden="true">Cartoonist</span>
      </button>

      <div className="tsep" role="separator"></div>

      {/* Arrow type & heads (always shown; most relevant when arrow tool active) */}
      <button className="sz-btn on" id="at-sharp" onClick={() => call("setArrowType", "sharp")} aria-label="Sharp arrow" aria-pressed="true">
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.6, strokeLinecap: "round" }}><line x1="4" y1="14" x2="14" y2="4"/><polyline points="8 4 14 4 14 10"/></svg>
        <span className="tt" aria-hidden="true">Sharp Arrow</span>
      </button>
      <button className="sz-btn" id="at-curved" onClick={() => call("setArrowType", "curved")} aria-label="Curved arrow" aria-pressed="false">
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.6, strokeLinecap: "round" }}><path d="M4 14 Q4 4 14 4"/><polyline points="10 4 14 4 14 8"/></svg>
        <span className="tt" aria-hidden="true">Curved Arrow</span>
      </button>
      <button className="sz-btn" id="at-elbow" onClick={() => call("setArrowType", "elbow")} aria-label="Elbow arrow" aria-pressed="false">
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.6, strokeLinecap: "round" }}><polyline points="4 14 4 4 14 4"/><polyline points="10 4 14 4 14 8"/></svg>
        <span className="tt" aria-hidden="true">Elbow Arrow</span>
      </button>

      <div className="tsep" role="separator"></div>

      {/* Arrow head end type */}
      <button className="sz-btn" id="ahe-none" onClick={() => call("setArrowHeads", "none", "none")} aria-label="No arrowhead" aria-pressed="false">
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.6 }}><line x1="4" y1="9" x2="14" y2="9"/></svg>
        <span className="tt" aria-hidden="true">No Head</span>
      </button>
      <button className="sz-btn on" id="ahe-open" onClick={() => call("setArrowHeads", "none", "open")} aria-label="Open arrow head" aria-pressed="true">
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.6, strokeLinecap: "round" }}><line x1="4" y1="9" x2="14" y2="9"/><polyline points="10 5 14 9 10 13"/></svg>
        <span className="tt" aria-hidden="true">Open Head</span>
      </button>
      <button className="sz-btn" id="ahe-triangle" onClick={() => call("setArrowHeads", "none", "triangle")} aria-label="Triangle arrowhead" aria-pressed="false">
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" style={{ strokeLinecap: "round" }}><line x1="4" y1="9" x2="11" y2="9" stroke="currentColor" strokeWidth="1.6" fill="none"/><polygon points="11,5 15,9 11,13" fill="currentColor"/></svg>
        <span className="tt" aria-hidden="true">Triangle Head</span>
      </button>
      <button className="sz-btn" id="ahe-triangleoutline" onClick={() => call("setArrowHeads", "none", "triangle-outline")} aria-label="Triangle outline arrowhead" aria-pressed="false">
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.6, strokeLinecap: "round" }}><line x1="4" y1="9" x2="11" y2="9"/><polygon points="11,5 15,9 11,13"/></svg>
        <span className="tt" aria-hidden="true">Triangle Outline</span>
      </button>

      <div className="tsep" role="separator"></div>

      {/* Layer depth controls */}
      <button className="tbtn" onClick={() => call("bringToFront")} aria-label="Bring to front">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="2" y="10" width="12" height="12" rx="1"/><rect x="10" y="2" width="12" height="12" rx="1" fill="none"/></svg>
        <span className="tt" aria-hidden="true">Bring to Front</span>
      </button>
      <button className="tbtn" onClick={() => call("bringForward")} aria-label="Bring forward">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="8" width="12" height="12" rx="1"/><rect x="8" y="4" width="12" height="12" rx="1" fill="none"/></svg>
        <span className="tt" aria-hidden="true">Bring Forward</span>
      </button>
      <button className="tbtn" onClick={() => call("sendBackward")} aria-label="Send backward">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="8" y="4" width="12" height="12" rx="1"/><rect x="4" y="8" width="12" height="12" rx="1" fill="none"/></svg>
        <span className="tt" aria-hidden="true">Send Backward</span>
      </button>
      <button className="tbtn" onClick={() => call("sendToBack")} aria-label="Send to back">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="10" y="2" width="12" height="12" rx="1"/><rect x="2" y="10" width="12" height="12" rx="1" fill="none"/></svg>
        <span className="tt" aria-hidden="true">Send to Back</span>
      </button>

      <div className="tsep" role="separator"></div>
      <button className="tbtn" onClick={() => call("zoomIn")} aria-label="Zoom in (+)">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        <span className="tt" aria-hidden="true">Zoom In (+)</span>
      </button>
      <button className="tbtn" onClick={() => call("zoomOut")} aria-label="Zoom out (-)">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        <span className="tt" aria-hidden="true">Zoom Out (-)</span>
      </button>
      <button className="tbtn" onClick={() => call("resetZoom")} aria-label="Reset zoom to 100%">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        <span className="tt" aria-hidden="true">Reset View</span>
      </button>
    </div>
  );
});
