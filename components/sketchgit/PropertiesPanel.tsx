"use client";
/**
 * PropertiesPanel – contextual shape-properties toolbox.
 *
 * Rendered inside #canvas-wrap as an absolutely-positioned floating panel.
 * The panel is always present in the DOM but hidden (class "hide") until a
 * drawing tool is selected or a canvas object is clicked.
 *
 * Visibility of individual *sections* (pp-*-section) is controlled by
 * CanvasEngine.showPropertiesPanelForShape() via classList manipulation so
 * that only options relevant to the active shape type are visible.
 */

import React from "react";
import { useTranslations } from "next-intl";
import type { SketchGitCall } from "@/components/sketchgit/types";

type PropsPanelProps = { call: SketchGitCall };

export const PropertiesPanel = React.memo(function PropertiesPanel({ call }: PropsPanelProps) {
  const t = useTranslations("toolbar");

  return (
    <div id="props-panel" className="hide" role="complementary" aria-label={t("shapeProperties")}>

      {/* ── Colors ──────────────────────────────────────────────────────────── */}
      <div className="pp-section" id="pp-color-section">
        <span className="pp-label">{t("colors")}</span>
        <div className="pp-row">
          <div className="color-dot" id="strokeDot" style={{ background: "#e2e2ef" }} title={t("strokeColor")}>
            <label htmlFor="strokeColorInput" className="sr-only">{t("strokeColor")}</label>
            <input
              type="color"
              id="strokeColorInput"
              defaultValue="#e2e2ef"
              aria-label={t("strokeColor")}
              onInput={(e) => call("updateStrokeColor", (e.currentTarget as HTMLInputElement).value)}
            />
          </div>
          {/* fill dot – visible only for shapes that support fill (same sections as pp-fill-pattern-section) */}
          <div className="color-dot" id="fillDot" style={{ background: "transparent", borderStyle: "dashed" }} title={t("fillColor")}>
            <label htmlFor="fillColorInput" className="sr-only">{t("fillColor")}</label>
            <input
              type="color"
              id="fillColorInput"
              defaultValue="#1a1a2e"
              aria-label={t("fillColor")}
              onInput={(e) => call("updateFillColor", (e.currentTarget as HTMLInputElement).value)}
            />
          </div>
          <button
            id="tfillToggle"
            className="tbtn"
            onClick={() => call("toggleFill")}
            aria-label={t("toggleFill")}
            aria-pressed="false"
            style={{ width: 28, height: 28, fontSize: "13px" }}
          >⊡</button>
        </div>
      </div>

      {/* ── Stroke width ────────────────────────────────────────────────────── */}
      <div className="pp-section" id="pp-stroke-width-section">
        <span className="pp-label">{t("strokeWidth")}</span>
        <div className="pp-row">
          <button className="sz-btn on" id="sz1" onClick={() => call("setStrokeWidth", 1.5)} aria-label={t("strokeThin")} aria-pressed="true">
            <div className="sz-line" style={{ height: "1.5px" }} aria-hidden="true"></div>
          </button>
          <button className="sz-btn" id="sz3" onClick={() => call("setStrokeWidth", 3)} aria-label={t("strokeMedium")} aria-pressed="false">
            <div className="sz-line" style={{ height: "3px" }} aria-hidden="true"></div>
          </button>
          <button className="sz-btn" id="sz5" onClick={() => call("setStrokeWidth", 5)} aria-label={t("strokeThick")} aria-pressed="false">
            <div className="sz-line" style={{ height: "5px" }} aria-hidden="true"></div>
          </button>
        </div>
      </div>

      {/* ── Stroke dash ─────────────────────────────────────────────────────── */}
      <div className="pp-section" id="pp-stroke-dash-section">
        <span className="pp-label">{t("strokeStyle")}</span>
        <div className="pp-row">
          <button className="sz-btn on" id="dash-solid" onClick={() => call("setStrokeDash", "solid")} aria-label={t("dashSolid")} aria-pressed="true">
            <div className="sz-line" style={{ height: "2px" }} aria-hidden="true"></div>
          </button>
          <button className="sz-btn" id="dash-dashed" onClick={() => call("setStrokeDash", "dashed")} aria-label={t("dashDashed")} aria-pressed="false">
            <div className="sz-line dashed" aria-hidden="true"></div>
          </button>
          <button className="sz-btn" id="dash-dotted" onClick={() => call("setStrokeDash", "dotted")} aria-label={t("dashDotted")} aria-pressed="false">
            <div className="sz-line dotted" aria-hidden="true"></div>
          </button>
        </div>
      </div>

      {/* ── Fill (rect / ellipse only) ──────────────────────────────────────── */}
      <div className="pp-section hide" id="pp-fill-pattern-section">
        <span className="pp-label">{t("fillPattern")}</span>
        <div className="pp-row">
          <button className="sz-btn on" id="fp-filled" onClick={() => call("setFillPattern", "filled")} aria-label={t("fpFilled")} aria-pressed="true">
            <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true"><rect x="3" y="3" width="12" height="12" rx="1" fill="currentColor" opacity="0.7"/></svg>
          </button>
          <button className="sz-btn" id="fp-striped" onClick={() => call("setFillPattern", "striped")} aria-label={t("fpStriped")} aria-pressed="false">
            <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.2 }}><rect x="3" y="3" width="12" height="12" rx="1"/><line x1="3" y1="9" x2="9" y2="3"/><line x1="6" y1="15" x2="15" y2="6"/><line x1="9" y1="15" x2="15" y2="9"/></svg>
          </button>
          <button className="sz-btn" id="fp-crossed" onClick={() => call("setFillPattern", "crossed")} aria-label={t("fpCrossed")} aria-pressed="false">
            <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.2 }}><rect x="3" y="3" width="12" height="12" rx="1"/><line x1="3" y1="9" x2="9" y2="3"/><line x1="6" y1="15" x2="15" y2="6"/><line x1="9" y1="15" x2="15" y2="9"/><line x1="3" y1="9" x2="9" y2="15"/><line x1="6" y1="3" x2="15" y2="12"/></svg>
          </button>
        </div>
      </div>

      {/* ── Border radius (rect only) ───────────────────────────────────────── */}
      <div className="pp-section hide" id="pp-border-radius-section">
        <span className="pp-label">{t("borderRadius")}</span>
        <div className="pp-row">
          <button className="sz-btn on" id="br-sharp" onClick={() => call("setBorderRadius", "sharp")} aria-label={t("brSharp")} aria-pressed="true">
            <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.6 }}><rect x="3" y="3" width="12" height="12" rx="0"/></svg>
          </button>
          <button className="sz-btn" id="br-rounded" onClick={() => call("setBorderRadius", "rounded")} aria-label={t("brRounded")} aria-pressed="false">
            <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.6 }}><rect x="3" y="3" width="12" height="12" rx="4"/></svg>
          </button>
        </div>
      </div>

      {/* ── Sloppiness (all non-text shapes) ────────────────────────────────── */}
      <div className="pp-section hide" id="pp-sloppiness-section">
        <span className="pp-label">{t("sloppiness")}</span>
        <div className="pp-row">
          <button className="sz-btn on" id="sloppy-architect" onClick={() => call("setSloppiness", "architect")} aria-label={t("sloppyArchitect")} aria-pressed="true">
            <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.8, strokeLinecap: "butt" }}><line x1="4" y1="14" x2="14" y2="4"/></svg>
          </button>
          <button className="sz-btn" id="sloppy-artist" onClick={() => call("setSloppiness", "artist")} aria-label={t("sloppyArtist")} aria-pressed="false">
            <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.8, strokeLinecap: "round" }}><path d="M4 14 Q7 5 14 4"/></svg>
          </button>
          <button className="sz-btn" id="sloppy-cartoonist" onClick={() => call("setSloppiness", "cartoonist")} aria-label={t("sloppyCartoonist")} aria-pressed="false">
            <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true" style={{ stroke: "currentColor", fill: "none", strokeWidth: 2.5, strokeLinecap: "round" }}><path d="M4 14 Q9 3 14 4"/></svg>
          </button>
          <button className="sz-btn" id="sloppy-doodle" onClick={() => call("setSloppiness", "doodle")} aria-label={t("sloppyDoodle")} aria-pressed="false">
            <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.8, strokeLinecap: "round" }}><path d="M4 14 Q7 4 14 4"/><path d="M4 14 Q8 5 14 5"/></svg>
          </button>
        </div>
      </div>

      {/* ── Arrow type (arrow only) ─────────────────────────────────────────── */}
      <div className="pp-section hide" id="pp-arrow-type-section">
        <span className="pp-label">{t("arrowType")}</span>
        <div className="pp-row">
          <button className="sz-btn on" id="at-sharp" onClick={() => call("setArrowType", "sharp")} aria-label={t("arrowSharp")} aria-pressed="true">
            <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.6, strokeLinecap: "round" }}><line x1="4" y1="14" x2="14" y2="4"/><polyline points="8 4 14 4 14 10"/></svg>
          </button>
          <button className="sz-btn" id="at-curved" onClick={() => call("setArrowType", "curved")} aria-label={t("arrowCurved")} aria-pressed="false">
            <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.6, strokeLinecap: "round" }}><path d="M4 14 Q4 4 14 4"/><polyline points="10 4 14 4 14 8"/></svg>
          </button>
          <button className="sz-btn" id="at-elbow" onClick={() => call("setArrowType", "elbow")} aria-label={t("arrowElbow")} aria-pressed="false">
            <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.6, strokeLinecap: "round" }}><polyline points="4 14 4 4 14 4"/><polyline points="10 4 14 4 14 8"/></svg>
          </button>
        </div>
      </div>

      {/* ── Arrow heads (arrow only) ────────────────────────────────────────── */}
      <div className="pp-section hide" id="pp-arrow-heads-section">
        <span className="pp-label">{t("arrowHeads")}</span>
        {/* End head row */}
        <div className="pp-row" style={{ gap: "3px" }}>
          <button className="sz-btn" id="ahe-none" onClick={() => call("setArrowHeadEnd", "none")} aria-label={t("headNone")} aria-pressed="false">
            <svg viewBox="0 0 18 9" width="18" height="9" aria-hidden="true" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.5 }}><line x1="2" y1="4.5" x2="16" y2="4.5"/></svg>
          </button>
          <button className="sz-btn on" id="ahe-open" onClick={() => call("setArrowHeadEnd", "open")} aria-label={t("headOpen")} aria-pressed="true">
            <svg viewBox="0 0 18 9" width="18" height="9" aria-hidden="true" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.5, strokeLinecap: "round" }}><line x1="2" y1="4.5" x2="13" y2="4.5"/><polyline points="10,1 14,4.5 10,8"/></svg>
          </button>
          <button className="sz-btn" id="ahe-triangle" onClick={() => call("setArrowHeadEnd", "triangle")} aria-label={t("headTriangle")} aria-pressed="false">
            <svg viewBox="0 0 18 9" width="18" height="9" aria-hidden="true"><line x1="2" y1="4.5" x2="11" y2="4.5" stroke="currentColor" strokeWidth="1.5" fill="none"/><polygon points="11,1 16,4.5 11,8" fill="currentColor"/></svg>
          </button>
          <button className="sz-btn" id="ahe-triangleoutline" onClick={() => call("setArrowHeadEnd", "triangle-outline")} aria-label={t("headTriangleOutline")} aria-pressed="false">
            <svg viewBox="0 0 18 9" width="18" height="9" aria-hidden="true" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.5 }}><line x1="2" y1="4.5" x2="11" y2="4.5"/><polygon points="11,1 16,4.5 11,8"/></svg>
          </button>
        </div>
        {/* Start head row */}
        <div className="pp-row" style={{ gap: "3px" }}>
          <button className="sz-btn on" id="ahs-none" onClick={() => call("setArrowHeadStart", "none")} aria-label={t("headStartNone")} aria-pressed="true">
            <svg viewBox="0 0 18 9" width="18" height="9" aria-hidden="true" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.5 }}><line x1="2" y1="4.5" x2="16" y2="4.5"/></svg>
          </button>
          <button className="sz-btn" id="ahs-open" onClick={() => call("setArrowHeadStart", "open")} aria-label={t("headStartOpen")} aria-pressed="false">
            <svg viewBox="0 0 18 9" width="18" height="9" aria-hidden="true" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.5, strokeLinecap: "round" }}><line x1="5" y1="4.5" x2="16" y2="4.5"/><polyline points="8,1 4,4.5 8,8"/></svg>
          </button>
          <button className="sz-btn" id="ahs-triangle" onClick={() => call("setArrowHeadStart", "triangle")} aria-label={t("headStartTriangle")} aria-pressed="false">
            <svg viewBox="0 0 18 9" width="18" height="9" aria-hidden="true"><line x1="7" y1="4.5" x2="16" y2="4.5" stroke="currentColor" strokeWidth="1.5" fill="none"/><polygon points="7,1 2,4.5 7,8" fill="currentColor"/></svg>
          </button>
          <button className="sz-btn" id="ahs-triangleoutline" onClick={() => call("setArrowHeadStart", "triangle-outline")} aria-label={t("headStartOutline")} aria-pressed="false">
            <svg viewBox="0 0 18 9" width="18" height="9" aria-hidden="true" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.5 }}><line x1="7" y1="4.5" x2="16" y2="4.5"/><polygon points="7,1 2,4.5 7,8"/></svg>
          </button>
        </div>
      </div>

      {/* ── Opacity ─────────────────────────────────────────────────────────── */}
      <div className="pp-section" id="pp-opacity-section">
        <label className="pp-label" htmlFor="opacitySlider">{t("opacity")}</label>
        <div className="pp-row">
          <input
            id="opacitySlider"
            type="range"
            min="0"
            max="100"
            defaultValue="100"
            aria-label={t("opacity")}
            className="pp-slider"
            onInput={(e) => call("setOpacity", parseInt((e.currentTarget as HTMLInputElement).value, 10))}
          />
          <span id="opacityValue" className="pp-val">100%</span>
        </div>
      </div>

      {/* ── Layer controls (only when an object is selected) ────────────────── */}
      <div className="pp-section hide" id="pp-layer-section">
        <span className="pp-label">{t("layers")}</span>
        <div className="pp-row">
          <button className="tbtn" onClick={() => call("bringToFront")} aria-label={t("bringToFront")} title={t("bringToFront")} style={{ width: 28, height: 28 }}>
            <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><rect x="1" y="8" width="9" height="9" rx="1" fill="currentColor" opacity="0.45"/><rect x="7" y="1" width="10" height="10" rx="1" fill="currentColor"/></svg>
          </button>
          <button className="tbtn" onClick={() => call("bringForward")} aria-label={t("bringForward")} title={t("bringForward")} style={{ width: 28, height: 28 }}>
            <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><rect x="2" y="6" width="9" height="9" rx="1" fill="currentColor" opacity="0.45"/><rect x="6" y="2" width="10" height="10" rx="1" fill="currentColor"/></svg>
          </button>
          <button className="tbtn" onClick={() => call("sendBackward")} aria-label={t("sendBackward")} title={t("sendBackward")} style={{ width: 28, height: 28 }}>
            <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><rect x="6" y="2" width="10" height="10" rx="1" fill="currentColor" opacity="0.45"/><rect x="2" y="6" width="9" height="9" rx="1" fill="currentColor"/></svg>
          </button>
          <button className="tbtn" onClick={() => call("sendToBack")} aria-label={t("sendToBack")} title={t("sendToBack")} style={{ width: 28, height: 28 }}>
            <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><rect x="7" y="1" width="10" height="10" rx="1" fill="currentColor" opacity="0.45"/><rect x="1" y="8" width="9" height="9" rx="1" fill="currentColor"/></svg>
          </button>
        </div>
      </div>

      {/* ── Link (only when an object is selected) ──────────────────────────── */}
      <div className="pp-section hide" id="pp-link-section">
        <label className="pp-label" htmlFor="linkInput">{t("addLink")}</label>
        <div className="pp-row">
          <input
            id="linkInput"
            type="url"
            placeholder={t("linkPlaceholder")}
            aria-label={t("addLink")}
            className="pp-input"
            onBlur={(e) => call("setObjectLink", (e.currentTarget as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                call("setObjectLink", (e.currentTarget as HTMLInputElement).value);
              }
            }}
          />
        </div>
      </div>

    </div>
  );
});
