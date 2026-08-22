import { useState, useEffect } from "react";
import type { ShareScope, SharePermission, ShareModalProps } from "./shareModalTypes.js";

type FormState = {
  label: string; scope: ShareScope; branches: string; commitSha: string;
  permission: SharePermission; expiresInHours: string; maxUses: string;
  createError: string | null; newLinkUrl: string | null; copiedNew: boolean;
};

const DEFAULT_STATE: FormState = {
  label: "", scope: "ROOM", branches: "", commitSha: "",
  permission: "VIEW", expiresInHours: "", maxUses: "",
  createError: null, newLinkUrl: null, copiedNew: false,
};

export function useShareModalForm({
  isOpen, prefilledCommitSha,
}: Pick<ShareModalProps, "isOpen" | "prefilledCommitSha">) {
  const [state, setState] = useState<FormState>(DEFAULT_STATE);

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setState((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (!isOpen) return;
    setState(prefilledCommitSha
      ? { ...DEFAULT_STATE, scope: "COMMIT", commitSha: prefilledCommitSha, permission: "VIEW" }
      : DEFAULT_STATE
    );
  }, [isOpen, prefilledCommitSha]);

  return {
    label: state.label, setLabel: (v: string) => updateField("label", v),
    scope: state.scope, setScope: (v: ShareScope) => updateField("scope", v),
    branches: state.branches, setBranches: (v: string) => updateField("branches", v),
    commitSha: state.commitSha, setCommitSha: (v: string) => updateField("commitSha", v),
    permission: state.permission, setPermission: (v: SharePermission) => updateField("permission", v),
    expiresInHours: state.expiresInHours, setExpiresInHours: (v: string) => updateField("expiresInHours", v),
    maxUses: state.maxUses, setMaxUses: (v: string) => updateField("maxUses", v),
    createError: state.createError, setCreateError: (v: string | null) => updateField("createError", v),
    newLinkUrl: state.newLinkUrl, setNewLinkUrl: (v: string | null) => updateField("newLinkUrl", v),
    copiedNew: state.copiedNew, setCopiedNew: (v: boolean) => updateField("copiedNew", v),
  };
}
