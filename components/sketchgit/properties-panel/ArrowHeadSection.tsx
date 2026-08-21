import React from "react";
import { useTranslations } from "next-intl";
import type { SketchGitCall } from "@/components/sketchgit/types";

type SectionProps = { call: SketchGitCall };

export const ArrowHeadSection = React.memo(function ArrowHeadSection({ call }: SectionProps) {
  const t = useTranslations("toolbar");
  return (
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
      <div className="pp-row" style={{ gap: "3px", marginTop: "4px" }}>
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
  );
});
