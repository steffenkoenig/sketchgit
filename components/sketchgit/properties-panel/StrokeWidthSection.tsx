import React from "react";
import { useTranslations } from "next-intl";
import type { SketchGitCall } from "@/components/sketchgit/types";

type SectionProps = { call: SketchGitCall };

export const StrokeWidthSection = React.memo(function StrokeWidthSection({ call }: SectionProps) {
  const t = useTranslations("toolbar");
  return (
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
  );
});
