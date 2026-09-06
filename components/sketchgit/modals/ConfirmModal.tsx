"use client";

import type { SketchGitCall } from "../types";

export function ConfirmModal({ call }: { call: SketchGitCall }) {
  return (
    <div className="overlay" id="confirmModal" role="dialog" aria-modal="true" aria-labelledby="confirmModalTitle">
      <div className="modal">
        <h2 id="confirmModalTitle">⚠ Confirm Action</h2>
        <p id="confirmModalMessage" className="info-box"></p>
        <div className="modal-actions">
          <button
            className="mbtn"
            onClick={() => call("cancelConfirm")}
            aria-label="Cancel and close"
          >Cancel</button>
          <button
            className="mbtn warn"
            id="confirmModalOkBtn"
            onClick={() => call("acceptConfirm")}
            aria-label="Confirm destructive action"
          >Confirm</button>
        </div>
      </div>
    </div>
  );
}
