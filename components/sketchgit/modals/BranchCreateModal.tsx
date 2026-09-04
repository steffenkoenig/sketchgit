"use client";

import { useTranslations } from "next-intl";
import type { SketchGitCall } from "../types";

export function BranchCreateModal({ call }: { call: SketchGitCall }) {
  const t = useTranslations();
  return (
    <div className="overlay" id="branchCreateModal" role="dialog" aria-modal="true" aria-labelledby="branchCreateModalTitle">
      <div className="modal">
        <h2 id="branchCreateModalTitle">{t("modal.branchCreate.title")}</h2>
        <div className="info-box" id="branchFromInfo" aria-live="polite"></div>
        <label htmlFor="newBranchName">{t("modal.branchCreate.label")}</label>
        <input id="newBranchName" type="text" placeholder={t("modal.branchCreate.placeholder")} />
        <div className="modal-actions">
          <button className="mbtn" onClick={() => call("closeModal", "branchCreateModal")} aria-label="Cancel creating a new branch">{t("modal.branchCreate.cancel")}</button>
          <button className="mbtn ok" onClick={() => call("doCreateBranch")} aria-label="Create the new branch">{t("modal.branchCreate.confirm")}</button>
        </div>
      </div>
    </div>
  );
}
