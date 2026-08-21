import React from "react";
import { useTranslations } from "next-intl";
import type { SketchGitCall } from "@/components/sketchgit/types";

type SectionProps = { call: SketchGitCall };

export const LayerControlsSection = React.memo(function LayerControlsSection({ call }: SectionProps) {
  const t = useTranslations("toolbar");
  return (
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
  );
});
