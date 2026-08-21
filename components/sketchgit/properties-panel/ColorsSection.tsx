import React from "react";
import { useTranslations } from "next-intl";
import type { SketchGitCall } from "@/components/sketchgit/types";

type SectionProps = { call: SketchGitCall };

export const ColorsSection = React.memo(function ColorsSection({ call }: SectionProps) {
  const t = useTranslations("toolbar");
  return (
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
  );
});
