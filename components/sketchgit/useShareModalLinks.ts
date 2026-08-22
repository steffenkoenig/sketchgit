import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { ShareLinkSummary, ShareModalProps } from "./shareModalTypes.js";

type LinkReturn = {
  links: ShareLinkSummary[]; setLinks: (links: ShareLinkSummary[]) => void;
  loadingLinks: boolean; linksLoaded: boolean; linksError: string | null;
  loadLinks: () => Promise<void>; handleRevoke: (id: string) => Promise<void>;
  handleRevokeAll: () => Promise<void>;
  resolveApiError: (err: { code?: string; message?: string }) => string;
};

export function useShareModalLinks({
  isOpen, roomId,
}: Pick<ShareModalProps, "isOpen" | "roomId">): LinkReturn {
  const t = useTranslations();
  const [links, setLinks] = useState<ShareLinkSummary[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [linksLoaded, setLinksLoaded] = useState(false);
  const [linksError, setLinksError] = useState<string | null>(null);

  const resolveApiError = useCallback((err: { code?: string; message?: string }) => {
    const key = `errors.${err.code ?? "INTERNAL_ERROR"}` as Parameters<typeof t>[0];
    return t(key) ?? err.message ?? t("errors.INTERNAL_ERROR");
  }, [t]);

  const loadLinks = useCallback(async () => {
    if (!roomId) return;
    setLoadingLinks(true); setLinksError(null);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/share-links`);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { code?: string; message?: string; };
        setLinksError(resolveApiError(err)); setLinks([]);
      } else {
        setLinks(((await res.json()) as { links: ShareLinkSummary[] }).links ?? []);
      }
    } catch { setLinksError(t("errors.INTERNAL_ERROR")); setLinks([]);
    } finally { setLoadingLinks(false); setLinksLoaded(true); }
  }, [roomId, resolveApiError, t]);

  useEffect(() => {
    if (isOpen && roomId) void loadLinks();
    else if (!isOpen) { setLinksLoaded(false); setLinksError(null); }
  }, [isOpen, roomId, loadLinks]);

  const apiFetch = useCallback(async (path: string) => {
    if (roomId) await fetch(`/api/rooms/${encodeURIComponent(roomId)}${path}`, { method: "DELETE" });
  }, [roomId]);

  const handleRevoke = useCallback(async (id: string) => {
    await apiFetch(`/share-links/${id}`); setLinks((prev) => prev.filter((l) => l.id !== id));
  }, [apiFetch]);

  const handleRevokeAll = useCallback(async () => {
    await apiFetch(`/share-links`); setLinks([]);
  }, [apiFetch]);

  return { links, setLinks, loadingLinks, linksLoaded, linksError,
           loadLinks, handleRevoke, handleRevokeAll, resolveApiError };
}
