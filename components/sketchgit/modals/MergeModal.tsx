"use client";

import { useTranslations } from "next-intl";
import type { SketchGitCall } from "../types";

export function MergeModal({ call }: { call: SketchGitCall }) {
  const t = useTranslations();
  return (
    <div className="overlay" id="mergeModal" role="dialog" aria-modal="true" aria-labelledby="mergeModalTitle">
      <div className="modal">
        <h2 id="mergeModalTitle">{t("modal.merge.title")}</h2>
        <div className="info-box">Merge another branch <b>into</b> <span id="mergeTargetName" aria-live="polite"></span>. Objects are tracked by UUID — duplicates are detected and conflicts resolved.</div>
        <label htmlFor="mergeSourceSelect">{t("modal.merge.label")}</label>
        <select id="mergeSourceSelect" aria-label="Select source branch to merge from"></select>
        <div className="modal-actions">
          <button className="mbtn" onClick={() => call("closeModal", "mergeModal")} aria-label="Cancel the merge">{t("modal.merge.cancel")}</button>
          <button className="mbtn warn" onClick={() => call("doMerge")} aria-label="Perform the merge">{t("modal.merge.confirm")}</button>
        </div>
      </div>
    </div>
  );
}
