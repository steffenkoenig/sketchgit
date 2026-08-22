"use client";
import React from "react";
import { useTranslations } from "next-intl";
import type { ShareModalProps, TFunction } from "./shareModalTypes.js";
import { useShareModal } from "./useShareModal.js";
import { ShareForm } from "./ShareForm.js";
import { NewLinkDisplay } from "./NewLinkDisplay.js";
import { LinkList } from "./LinkList.js";

type ShareModalState = ReturnType<typeof useShareModal>;

function ModalActions({
  state,
  onClose,
  t,
}: {
  state: ShareModalState;
  onClose: () => void;
  t: TFunction;
}) {
  return (
    <div className="modal-actions">
      {state.links.length > 0 && (
        <button
          className="mbtn warn"
          onClick={() => void state.handleRevokeAll()}
          aria-label="Revoke all share links"
        >
          {t("modal.share.revokeAll")}
        </button>
      )}
      <div style={{ flex: 1 }} aria-hidden="true" />
      <button
        className="mbtn"
        onClick={onClose}
        aria-label="Close share dialog"
      >
        {t("modal.share.cancel")}
      </button>
      <button
        className="mbtn ok"
        onClick={() => void state.handleCreate()}
        disabled={state.creating}
        aria-label="Create share link"
      >
        {state.creating ? "…" : t("modal.share.create")}
      </button>
    </div>
  );
}

function ShareModalBody({
  state,
  prefilledCommitSha,
  onClose,
  t,
}: {
  state: ShareModalState;
  prefilledCommitSha: string | null;
  onClose: () => void;
  t: TFunction;
}) {
  return (
    <div className="modal" style={{ maxWidth: "540px" }}>
      <h2 id="shareModalTitle">{t("modal.share.title")}</h2>
      <ShareForm
        label={state.label}
        setLabel={state.setLabel}
        scope={state.scope}
        setScope={state.setScope}
        branches={state.branches}
        setBranches={state.setBranches}
        commitSha={state.commitSha}
        setCommitSha={state.setCommitSha}
        permission={state.permission}
        setPermission={state.setPermission}
        expiresInHours={state.expiresInHours}
        setExpiresInHours={state.setExpiresInHours}
        maxUses={state.maxUses}
        setMaxUses={state.setMaxUses}
        prefilledCommitSha={prefilledCommitSha}
        createError={state.createError}
      />
      <NewLinkDisplay
        newLinkUrl={state.newLinkUrl}
        copiedNew={state.copiedNew}
        handleCopyNew={state.handleCopyNew}
      />
      <LinkList
        loadingLinks={state.loadingLinks}
        linksError={state.linksError}
        linksLoaded={state.linksLoaded}
        links={state.links}
        handleRevoke={state.handleRevoke}
      />
      <ModalActions state={state} onClose={onClose} t={t} />
    </div>
  );
}

export function ShareModal({
  isOpen,
  onClose,
  roomId,
  prefilledCommitSha,
}: ShareModalProps) {
  const t = useTranslations();
  const state = useShareModal({ isOpen, roomId, prefilledCommitSha });

  return (
    <div
      className={`overlay${isOpen ? " open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shareModalTitle"
    >
      <ShareModalBody
        state={state}
        prefilledCommitSha={prefilledCommitSha}
        onClose={onClose}
        t={t}
      />
    </div>
  );
}
