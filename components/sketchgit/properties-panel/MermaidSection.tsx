import React from "react";
import { useTranslations } from "next-intl";
import type { SketchGitCall } from "@/components/sketchgit/types";

type SectionProps = { call: SketchGitCall };

export const MermaidSection = React.memo(function MermaidSection({ call }: SectionProps) {
  const t = useTranslations("toolbar");
  return (
    <div className="pp-section hide" id="pp-mermaid-section">
      <label className="pp-label" htmlFor="mermaidCodeInput">{t("mermaidCode")}</label>
      <div className="pp-row" style={{ flexDirection: "column", gap: "6px" }}>
        <textarea
          id="mermaidCodeInput"
          rows={5}
          defaultValue=""
          placeholder={t("mermaidPlaceholder")}
          aria-label={t("mermaidCode")}
          className="pp-input"
          style={{ resize: "vertical", fontFamily: "Fira Code, monospace", fontSize: "11px", width: "100%" }}
        />
        <button
          className="tbtn"
          style={{ width: "100%", fontSize: "12px", padding: "4px 8px" }}
          onClick={() => {
            const ta = document.getElementById("mermaidCodeInput") as HTMLTextAreaElement | null;
            if (ta) call("updateMermaidCode", ta.value);
          }}
          aria-label={t("mermaidRender")}
        >
          {t("mermaidRender")}
        </button>
      </div>
    </div>
  );
});
