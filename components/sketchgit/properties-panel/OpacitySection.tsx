import React from "react";
import { useTranslations } from "next-intl";
import type { SketchGitCall } from "@/components/sketchgit/types";

type SectionProps = { call: SketchGitCall };

export const OpacitySection = React.memo(function OpacitySection({ call }: SectionProps) {
  const t = useTranslations("toolbar");
  return (
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
  );
});
