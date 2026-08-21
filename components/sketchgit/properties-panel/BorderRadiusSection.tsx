import React from "react";
import { useTranslations } from "next-intl";
import type { SketchGitCall } from "@/components/sketchgit/types";

type SectionProps = { call: SketchGitCall };

export const BorderRadiusSection = React.memo(function BorderRadiusSection({ call }: SectionProps) {
  const t = useTranslations("toolbar");
  return (
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
  );
});
