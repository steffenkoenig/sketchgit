import React from "react";
import { useTranslations } from "next-intl";
import type { ShareScope, SharePermission, TFunction } from "./shareModalTypes.js";
import { SettingsInputs } from "./ShareFormSettings.js";

type ShareFormProps = {
  label: string; setLabel: (label: string) => void;
  scope: ShareScope; setScope: (scope: ShareScope) => void;
  branches: string; setBranches: (branches: string) => void;
  commitSha: string; setCommitSha: (commitSha: string) => void;
  permission: SharePermission; setPermission: (permission: SharePermission) => void;
  expiresInHours: string; setExpiresInHours: (expiresInHours: string) => void;
  maxUses: string; setMaxUses: (maxUses: string) => void;
  prefilledCommitSha: string | null; createError: string | null;
};

type ScopeInputsProps = Pick<
  ShareFormProps,
  | "scope" | "branches" | "setBranches"
  | "commitSha" | "setCommitSha" | "prefilledCommitSha"
> & { t: TFunction };

function ScopeSpecificInputs({
  scope, branches, setBranches, commitSha,
  setCommitSha, prefilledCommitSha, t,
}: ScopeInputsProps) {
  if (scope === "BRANCH") {
    return (
      <>
        <label htmlFor="shareBranchesInput">{t("modal.share.branches")}</label>
        <input
          id="shareBranchesInput" type="text" value={branches}
          onChange={(e) => setBranches(e.target.value)}
          placeholder={t("modal.share.branchesPlaceholder")}
        />
      </>
    );
  }

  if (scope === "COMMIT") {
    return (
      <>
        <label htmlFor="shareCommitShaInput">{t("modal.share.commitSha")}</label>
        <input
          id="shareCommitShaInput" type="text" value={commitSha}
          onChange={(e) => setCommitSha(e.target.value)}
          placeholder={t("modal.share.commitShaPlaceholder")}
          readOnly={!!prefilledCommitSha} style={{ fontFamily: "monospace" }}
        />
      </>
    );
  }

  return null;
}

function BaseInputs({
  label, setLabel, scope, setScope, prefilledCommitSha, t
}: Pick<ShareFormProps, "label" | "setLabel" | "scope" | "setScope" | "prefilledCommitSha"> & { t: TFunction }) {
  return (
    <>
      <label htmlFor="shareLabelInput">{t("modal.share.label")}</label>
      <input
        id="shareLabelInput" type="text" value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={t("modal.share.labelPlaceholder")} maxLength={120}
      />
      <label htmlFor="shareScopeSelect">{t("modal.share.scope")}</label>
      <select
        id="shareScopeSelect" value={scope}
        onChange={(e) => setScope(e.target.value as ShareScope)}
        disabled={!!prefilledCommitSha} aria-label={t("modal.share.scope")}
      >
        <option value="ROOM">{t("modal.share.scopeRoom")}</option>
        <option value="BRANCH">{t("modal.share.scopeBranch")}</option>
        <option value="COMMIT">{t("modal.share.scopeCommit")}</option>
      </select>
    </>
  );
}

export function ShareForm({
  label, setLabel, scope, setScope, branches, setBranches,
  commitSha, setCommitSha, permission, setPermission,
  expiresInHours, setExpiresInHours, maxUses, setMaxUses,
  prefilledCommitSha, createError,
}: ShareFormProps) {
  const t = useTranslations();

  return (
    <>
      <BaseInputs
        label={label} setLabel={setLabel}
        scope={scope} setScope={setScope}
        prefilledCommitSha={prefilledCommitSha} t={t}
      />

      <ScopeSpecificInputs
        scope={scope} branches={branches} setBranches={setBranches}
        commitSha={commitSha} setCommitSha={setCommitSha}
        prefilledCommitSha={prefilledCommitSha} t={t}
      />

      <SettingsInputs
        scope={scope} permission={permission} setPermission={setPermission}
        expiresInHours={expiresInHours} setExpiresInHours={setExpiresInHours}
        maxUses={maxUses} setMaxUses={setMaxUses} t={t}
      />

      {createError && (
        <div
          className="info-box"
          role="alert"
          style={{ color: "var(--a2)", borderColor: "var(--a2)", marginTop: "8px" }}
        >
          {createError}
        </div>
      )}
    </>
  );
}
