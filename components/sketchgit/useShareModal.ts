import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { ShareModalProps, SharePermission } from "./shareModalTypes.js";
import { useShareModalForm } from "./useShareModalForm.js";
import { useShareModalLinks } from "./useShareModalLinks.js";

type FormState = ReturnType<typeof useShareModalForm>;

function buildCreatePayload(formState: FormState) {
  const effectivePermission: SharePermission =
    formState.scope === "COMMIT" ? "VIEW" : formState.permission;
  const body: Record<string, unknown> = {
    scope: formState.scope,
    permission: effectivePermission,
  };

  if (formState.label.trim()) body.label = formState.label.trim();
  if (formState.scope === "BRANCH") {
    body.branches = formState.branches.split(",").map((b) => b.trim()).filter(Boolean);
  }
  if (formState.scope === "COMMIT") body.commitSha = formState.commitSha.trim();

  const hours = Number(formState.expiresInHours);
  if (formState.expiresInHours.trim() && !Number.isNaN(hours)) body.expiresInHours = hours;

  const uses = Number(formState.maxUses);
  if (formState.maxUses.trim() && !Number.isNaN(uses)) body.maxUses = uses;

  return body;
}

export function useShareModal({
  isOpen, roomId, prefilledCommitSha,
}: Pick<ShareModalProps, "isOpen" | "roomId" | "prefilledCommitSha">) {
  const t = useTranslations();
  const formState = useShareModalForm({ isOpen, prefilledCommitSha });
  const linksState = useShareModalLinks({ isOpen, roomId });
  const [creating, setCreating] = useState(false);

  const performCreate = async () => {
    const res = await fetch(`/api/rooms/${encodeURIComponent(roomId!)}/share-links`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildCreatePayload(formState)),
    });
    const data = (await res.json()) as { url?: string; code?: string; message?: string; };
    if (!res.ok) formState.setCreateError(linksState.resolveApiError(data));
    else { formState.setNewLinkUrl(data.url ?? null); void linksState.loadLinks(); }
  };

  const handleCreate = useCallback(async () => {
    if (!roomId) return;
    setCreating(true); formState.setCreateError(null); formState.setNewLinkUrl(null);
    try { await performCreate(); } catch { formState.setCreateError(t("errors.INTERNAL_ERROR"));
    } finally { setCreating(false); }
  }, [roomId, formState, linksState, t]);

  const handleCopyNew = useCallback(() => {
    if (!formState.newLinkUrl) return;
    void navigator.clipboard.writeText(formState.newLinkUrl).then(() => {
      formState.setCopiedNew(true);
      setTimeout(() => formState.setCopiedNew(false), 1500);
    });
  }, [formState]);

  return { ...formState, ...linksState, creating, handleCreate, handleCopyNew };
}
