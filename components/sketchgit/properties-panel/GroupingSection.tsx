import React from "react";
import { useTranslations } from "next-intl";
import type { SketchGitCall } from "@/components/sketchgit/types";

type SectionProps = { call: SketchGitCall };

export const GroupingSection = React.memo(function GroupingSection({ call }: SectionProps) {
  const t = useTranslations("toolbar");
  return (
    <div className="pp-section hide" id="pp-group-section">
      <span className="pp-label">{t("groupingAndAlignment")}</span>
      <div className="pp-row" style={{ gap: "4px" }}>
        <button className="tbtn" onClick={() => call("groupSelection")} aria-label={t("groupObjects")} title={t("groupObjects")} style={{ width: 28, height: 28 }}>
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" fill="currentColor">
            <rect x="2" y="2" width="6" height="6" rx="1"/>
            <rect x="12" y="12" width="6" height="6" rx="1"/>
            <path d="M5 8v4h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2"/>
          </svg>
        </button>
        <button className="tbtn" onClick={() => call("ungroupSelection")} aria-label={t("ungroupObjects")} title={t("ungroupObjects")} style={{ width: 28, height: 28 }}>
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" fill="currentColor">
            <rect x="2" y="2" width="6" height="6" rx="1"/>
            <rect x="12" y="12" width="6" height="6" rx="1"/>
            <path d="M5 12V8h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2"/>
          </svg>
        </button>
      </div>
      <div className="pp-row" style={{ gap: "4px", marginTop: "4px" }}>
        <button className="tbtn" onClick={() => call("alignLeft")} aria-label={t("alignLeft")} title={t("alignLeft")} style={{ width: 28, height: 28 }}>
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><rect x="2" y="2" width="10" height="4" fill="currentColor"/><rect x="2" y="10" width="14" height="4" fill="currentColor"/><line x1="1" y1="0" x2="1" y2="20" stroke="currentColor" strokeWidth="1.5"/></svg>
        </button>
        <button className="tbtn" onClick={() => call("alignCenterH")} aria-label={t("alignCenterH")} title={t("alignCenterH")} style={{ width: 28, height: 28 }}>
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><rect x="5" y="2" width="10" height="4" fill="currentColor"/><rect x="3" y="10" width="14" height="4" fill="currentColor"/><line x1="10" y1="0" x2="10" y2="20" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2"/></svg>
        </button>
        <button className="tbtn" onClick={() => call("alignRight")} aria-label={t("alignRight")} title={t("alignRight")} style={{ width: 28, height: 28 }}>
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><rect x="8" y="2" width="10" height="4" fill="currentColor"/><rect x="4" y="10" width="14" height="4" fill="currentColor"/><line x1="19" y1="0" x2="19" y2="20" stroke="currentColor" strokeWidth="1.5"/></svg>
        </button>
        <button className="tbtn" onClick={() => call("alignTop")} aria-label={t("alignTop")} title={t("alignTop")} style={{ width: 28, height: 28 }}>
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><rect x="2" y="2" width="4" height="10" fill="currentColor"/><rect x="10" y="2" width="4" height="14" fill="currentColor"/><line x1="0" y1="1" x2="20" y2="1" stroke="currentColor" strokeWidth="1.5"/></svg>
        </button>
        <button className="tbtn" onClick={() => call("alignCenterV")} aria-label={t("alignCenterV")} title={t("alignCenterV")} style={{ width: 28, height: 28 }}>
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><rect x="2" y="5" width="4" height="10" fill="currentColor"/><rect x="10" y="3" width="4" height="14" fill="currentColor"/><line x1="0" y1="10" x2="20" y2="10" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2"/></svg>
        </button>
        <button className="tbtn" onClick={() => call("alignBottom")} aria-label={t("alignBottom")} title={t("alignBottom")} style={{ width: 28, height: 28 }}>
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><rect x="2" y="8" width="4" height="10" fill="currentColor"/><rect x="10" y="4" width="4" height="14" fill="currentColor"/><line x1="0" y1="19" x2="20" y2="19" stroke="currentColor" strokeWidth="1.5"/></svg>
        </button>
      </div>
    </div>
  );
});
