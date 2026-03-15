"use client";
/**
 * LeftToolbar – vertical drawing tool strip.
 *
 * P021: Wrapped with React.memo.
 * P025: Accessible labels and aria attributes.
 *
 * Only drawing tools and zoom controls live here.
 * All per-shape style settings (stroke, fill, opacity, etc.) have been moved
 * to the contextual PropertiesPanel which appears when a tool or shape is selected.
 */

import React from "react";
import { useTranslations } from "next-intl";
import type { SketchGitCall } from "@/components/sketchgit/types";

type LeftToolbarProps = {
  call: SketchGitCall;
};

export const LeftToolbar = React.memo(function LeftToolbar({ call }: LeftToolbarProps) {
  const t = useTranslations("toolbar");
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
      <button className="tbtn" id="tmermaid" onClick={() => call("setTool", "mermaid")} aria-label={t('mermaid')} aria-pressed="false">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M7 12h2l2-4 2 8 2-4h2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        <span className="tt" aria-hidden="true">{t('mermaid')}</span>
      </button>
      <div className="tsep" role="separator"></div>
      <button className="tbtn" id="teraser" onClick={() => call("setTool", "eraser")} aria-label="Eraser tool (X)" aria-pressed="false">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 20H7L3 16l13-13 7 7-3 3"/><line x1="6" y1="20" x2="19" y2="20"/></svg>
        <span className="tt" aria-hidden="true">Eraser (X)</span>
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
