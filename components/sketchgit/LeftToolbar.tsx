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
      <button className="tbtn on" id="tsel" onClick={() => call("setTool", "select")} aria-label="Select tool (S)" aria-pressed="false">
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
      <button className="tbtn" id="terase" onClick={() => call("setTool", "eraser")} aria-label="Eraser tool (X)" aria-pressed="false">
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
      <button className="sz-btn on" id="sz1" onClick={() => call("setStrokeWidth", 1.5)} aria-label="Thin stroke (1.5px)" aria-pressed="true"><div className="sz-line" style={{ height: "1.5px" }} aria-hidden="true"></div></button>
      <button className="sz-btn" id="sz3" onClick={() => call("setStrokeWidth", 3)} aria-label="Medium stroke (3px)" aria-pressed="false"><div className="sz-line" style={{ height: "3px" }} aria-hidden="true"></div></button>
      <button className="sz-btn" id="sz5" onClick={() => call("setStrokeWidth", 5)} aria-label="Thick stroke (5px)" aria-pressed="false"><div className="sz-line" style={{ height: "5px" }} aria-hidden="true"></div></button>
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
