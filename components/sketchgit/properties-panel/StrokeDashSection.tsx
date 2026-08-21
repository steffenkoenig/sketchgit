import React from "react";
import { useTranslations } from "next-intl";
import type { SketchGitCall } from "@/components/sketchgit/types";

type SectionProps = { call: SketchGitCall };

export const StrokeDashSection = React.memo(function StrokeDashSection({ call }: SectionProps) {
  const t = useTranslations("toolbar");
  return (
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
  );
});
