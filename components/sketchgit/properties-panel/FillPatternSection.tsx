import React from "react";
import { useTranslations } from "next-intl";
import type { SketchGitCall } from "@/components/sketchgit/types";

type SectionProps = { call: SketchGitCall };

export const FillPatternSection = React.memo(function FillPatternSection({ call }: SectionProps) {
  const t = useTranslations("toolbar");
  return (
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
  );
});
