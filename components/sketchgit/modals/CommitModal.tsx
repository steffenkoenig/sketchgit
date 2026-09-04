"use client";

import { useTranslations } from "next-intl";
import type { SketchGitCall } from "../types";

export function CommitModal({ call }: { call: SketchGitCall }) {
  const t = useTranslations();
  return (
    <div className="overlay" id="commitModal" role="dialog" aria-modal="true" aria-labelledby="commitModalTitle">
      <div className="modal">
        <h2 id="commitModalTitle">{t("modal.commit.title")}</h2>
        <label htmlFor="commitMsg">{t("modal.commit.label")}</label>
        <input id="commitMsg" type="text" placeholder={t("modal.commit.placeholder")} />
        <div className="modal-actions">
          <button className="mbtn" onClick={() => call("closeModal", "commitModal")} aria-label="Cancel and close the commit dialog">{t("modal.commit.cancel")}</button>
          <button className="mbtn ok" onClick={() => call("doCommit")} aria-label="Save a new commit with the entered message">{t("modal.commit.confirm")}</button>
        </div>
      </div>
    </div>
  );
}
