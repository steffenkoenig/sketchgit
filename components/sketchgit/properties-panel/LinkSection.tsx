import React from "react";
import { useTranslations } from "next-intl";
import type { SketchGitCall } from "@/components/sketchgit/types";

type SectionProps = { call: SketchGitCall };

export const LinkSection = React.memo(function LinkSection({ call }: SectionProps) {
  const t = useTranslations("toolbar");
  return (
    <div className="pp-section hide" id="pp-link-section">
      <label className="pp-label" htmlFor="linkInput">{t("addLink")}</label>
      <div className="pp-row">
        <input
          id="linkInput"
          type="url"
          placeholder={t("linkPlaceholder")}
          aria-label={t("addLink")}
          className="pp-input"
          onBlur={(e) => call("setObjectLink", (e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              call("setObjectLink", (e.currentTarget as HTMLInputElement).value);
            }
          }}
        />
      </div>
    </div>
  );
});
