import React from "react";
import { useTranslations } from "next-intl";
import type { SketchGitCall } from "@/components/sketchgit/types";

type SectionProps = { call: SketchGitCall };

export const ArrowTypeSection = React.memo(function ArrowTypeSection({ call }: SectionProps) {
  const t = useTranslations("toolbar");
  return (
    <div className="pp-section hide" id="pp-arrow-type-section">
      <span className="pp-label">{t("arrowType")}</span>
      <div className="pp-row">
        <button className="sz-btn on" id="at-sharp" onClick={() => call("setArrowType", "sharp")} aria-label={t("arrowSharp")} aria-pressed="true">
          <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.6, strokeLinecap: "round" }}><line x1="4" y1="14" x2="14" y2="4"/><polyline points="8 4 14 4 14 10"/></svg>
        </button>
        <button className="sz-btn" id="at-curved" onClick={() => call("setArrowType", "curved")} aria-label={t("arrowCurved")} aria-pressed="false">
          <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true" style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.6, strokeLinecap: "round" }}><path d="M4 14 Q4 4 14 4"/><polyline points="10 4 14 4 14 8"/></svg>
        </button>
      </div>
    </div>
  );
});
