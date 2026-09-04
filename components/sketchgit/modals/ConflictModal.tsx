"use client";

import { useTranslations } from "next-intl";
import type { SketchGitCall } from "../types";

export function ConflictModal({ call }: { call: SketchGitCall }) {
  const t = useTranslations();
  return (
    <div className="overlay" id="conflictModal" role="dialog" aria-modal="true" aria-labelledby="conflictModalTitle">
      <div className="modal" style={{ maxWidth: "640px" }}>
        <h2 id="conflictModalTitle">{t("modal.conflict.title")}</h2>
        <div className="conflict-header" role="alert">
          <span aria-hidden="true">⚠</span>
          <span id="conflictSummary">{t("modal.conflict.summary")}</span>
        </div>
        <div className="conflict-list" id="conflictList" role="list" aria-label="Merge conflicts"></div>
        <div className="conflict-stats" id="conflictStats" role="status" aria-live="polite" aria-label="Resolution progress"></div>
        <div className="modal-actions">
          <button className="mbtn" onClick={() => call("resolveAllOurs")} aria-label="Resolve all conflicts by keeping our version">{t("modal.conflict.allOurs")}</button>
          <button className="mbtn" onClick={() => call("resolveAllTheirs")} aria-label="Resolve all conflicts by keeping their version">{t("modal.conflict.allTheirs")}</button>
          <div style={{ flex: 1 }} aria-hidden="true"></div>
          <button className="mbtn" onClick={() => call("closeModal", "conflictModal")} aria-label="Cancel the merge and close the conflict dialog">{t("modal.conflict.cancel")}</button>
          <button className="mbtn ok" id="applyMergeBtn" onClick={() => call("applyMergeResolution")} aria-label="Apply the selected conflict resolutions and complete the merge">{t("modal.conflict.apply")}</button>
        </div>
      </div>
    </div>
  );
}
