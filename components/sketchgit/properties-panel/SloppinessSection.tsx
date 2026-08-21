import React from "react";
import { useTranslations } from "next-intl";
import type { SketchGitCall } from "@/components/sketchgit/types";

type SectionProps = { call: SketchGitCall };

export const SloppinessSection = React.memo(function SloppinessSection({ call }: SectionProps) {
  const t = useTranslations("toolbar");
  return (
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
  );
});
