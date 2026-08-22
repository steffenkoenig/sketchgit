import React from "react";
import type { ShareScope, SharePermission, TFunction } from "./shareModalTypes.js";

type SettingsInputsProps = {
  scope: ShareScope;
  permission: SharePermission;
  setPermission: (permission: SharePermission) => void;
  expiresInHours: string;
  setExpiresInHours: (expiresInHours: string) => void;
  maxUses: string;
  setMaxUses: (maxUses: string) => void;
  t: TFunction;
};

export function SettingsInputs({
  scope,
  permission,
  setPermission,
  expiresInHours,
  setExpiresInHours,
  maxUses,
  setMaxUses,
  t,
}: SettingsInputsProps) {
  return (
    <>
      {scope !== "COMMIT" && (
        <>
          <label htmlFor="sharePermissionSelect">{t("modal.share.permission")}</label>
          <select
            id="sharePermissionSelect"
            value={permission}
            onChange={(e) => setPermission(e.target.value as SharePermission)}
          >
            <option value="VIEW">{t("modal.share.permView")}</option>
            <option value="WRITE">{t("modal.share.permWrite")}</option>
            <option value="BRANCH_CREATE">{t("modal.share.permBranchCreate")}</option>
            <option value="ADMIN">{t("modal.share.permAdmin")}</option>
          </select>
        </>
      )}

      <label htmlFor="shareExpiresInput">{t("modal.share.expiresIn")}</label>
      <input
        id="shareExpiresInput" type="number" min={1} max={8760}
        value={expiresInHours} onChange={(e) => setExpiresInHours(e.target.value)}
        placeholder={t("modal.share.expiresPlaceholder")}
      />

      <label htmlFor="shareMaxUsesInput">{t("modal.share.maxUses")}</label>
      <input
        id="shareMaxUsesInput" type="number" min={1} max={100000}
        value={maxUses} onChange={(e) => setMaxUses(e.target.value)}
        placeholder={t("modal.share.maxUsesPlaceholder")}
      />
    </>
  );
}
