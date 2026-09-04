"use client";

import { useTranslations } from "next-intl";
import type { SketchGitCall } from "../types";

export function NameModal({ call }: { call: SketchGitCall }) {
  const t = useTranslations();
  return (
    <div className="overlay" id="nameModal" role="dialog" aria-modal="true" aria-labelledby="nameModalTitle">
      <div className="modal">
        <h2 id="nameModalTitle">{t("modal.name.title")}</h2>
        <label htmlFor="nameInput">{t("modal.name.label")}</label>
        <input id="nameInput" type="text" placeholder={t("modal.name.placeholder")} autoFocus />
        <div className="modal-actions">
          <button className="mbtn ok" onClick={() => call("setName")} aria-label="Set your display name and start drawing">{t("modal.name.confirm")}</button>
        </div>
      </div>
    </div>
  );
}
