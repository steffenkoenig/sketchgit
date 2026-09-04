"use client";

import { useTranslations } from "next-intl";
import type { SketchGitCall } from "../types";

export function BranchModal({ call }: { call: SketchGitCall }) {
  const t = useTranslations();
  return (
    <div className="overlay" id="branchModal" role="dialog" aria-modal="true" aria-labelledby="branchModalTitle">
      <div className="modal">
        <h2 id="branchModalTitle">{t("modal.branch.title")}</h2>
        <div id="branchListEl" className="branch-list" role="list" aria-label="Available branches"></div>
        <div className="modal-actions">
          <button className="mbtn" onClick={() => call("closeModal", "branchModal")} aria-label="Close the branches dialog">{t("modal.branch.close")}</button>
          <button className="mbtn ok" onClick={() => call("openBranchCreate")} aria-label="Create a new branch" aria-haspopup="dialog">{t("modal.branch.newBranch")}</button>
        </div>
      </div>
    </div>
  );
}
