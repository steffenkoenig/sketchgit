"use client";
/**
 * ShareModal – create, list, and revoke granular share links for a room.
 *
 * Opened from two entry points:
 *  1. The "🔗 Share" button in AppTopbar (scope defaults to ROOM).
 *  2. The "🔗 Share this commit" action in the commit popup (scope locked to
 *     COMMIT, commitSha pre-filled from the popup's SHA).
 *
 * The modal calls the P091 share-link REST endpoints:
 *   POST   /api/rooms/[roomId]/share-links   – create
 *   GET    /api/rooms/[roomId]/share-links   – list (tokens excluded for security)
 *   DELETE /api/rooms/[roomId]/share-links/[linkId] – revoke one
 *   DELETE /api/rooms/[roomId]/share-links   – revoke all
 */

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";

type ShareScope = "ROOM" | "BRANCH" | "COMMIT";
type SharePermission = "ADMIN" | "BRANCH_CREATE" | "WRITE" | "VIEW";

type ShareLinkSummary = {
  id: string;
  label: string | null;
  scope: ShareScope;
  branches: string[];
  commitSha: string | null;
  permission: SharePermission;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  createdAt: string;
};

export type ShareModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** The room ID (slug or cuid) currently in the URL. Null before a room is loaded. */
  roomId: string | null;
  /** When set, scope is locked to COMMIT and this SHA is pre-filled read-only. */
  prefilledCommitSha: string | null;
};

export function ShareModal({ isOpen, onClose, roomId, prefilledCommitSha }: ShareModalProps) {
  const t = useTranslations();

  /** Translate an API error `{ code?, message? }` to a localised string. */
  const resolveApiError = useCallback(
    (err: { code?: string; message?: string }): string => {
      const code = err.code ?? "INTERNAL_ERROR";
      return t(`errors.${code}` as Parameters<typeof t>[0]) ?? err.message ?? t("errors.INTERNAL_ERROR");
    },
    [t],
  );

  // ── form state ─────────────────────────────────────────────────────────────
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<ShareScope>("ROOM");
  const [branches, setBranches] = useState("");
  const [commitSha, setCommitSha] = useState("");
  const [permission, setPermission] = useState<SharePermission>("VIEW");
  const [expiresInHours, setExpiresInHours] = useState("");
  const [maxUses, setMaxUses] = useState("");

  // ── async / display state ──────────────────────────────────────────────────
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newLinkUrl, setNewLinkUrl] = useState<string | null>(null);
  const [copiedNew, setCopiedNew] = useState(false);
  const [links, setLinks] = useState<ShareLinkSummary[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [linksLoaded, setLinksLoaded] = useState(false);
  const [linksError, setLinksError] = useState<string | null>(null);

  // ── reset form and pre-fill on open ────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setLabel("");
    setBranches("");
    setExpiresInHours("");
    setMaxUses("");
    setCreateError(null);
    setNewLinkUrl(null);
    setCopiedNew(false);
    setLinksLoaded(false);
    setLinksError(null);
    if (prefilledCommitSha) {
      setScope("COMMIT");
      setCommitSha(prefilledCommitSha);
      setPermission("VIEW");
    } else {
      setScope("ROOM");
      setCommitSha("");
      setPermission("VIEW");
    }
  }, [isOpen, prefilledCommitSha]);

  // ── load existing links when the modal opens ───────────────────────────────
  const loadLinks = useCallback(async () => {
    if (!roomId) return;
    setLoadingLinks(true);
    setLinksError(null);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/share-links`);
      if (res.ok) {
        const data = (await res.json()) as { links: ShareLinkSummary[] };
        setLinks(data.links ?? []);
      } else {
        const err = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
        setLinksError(resolveApiError(err));
        setLinks([]);
      }
    } catch {
      setLinksError(t("errors.INTERNAL_ERROR"));
      setLinks([]);
    } finally {
      setLoadingLinks(false);
      setLinksLoaded(true);
    }
  }, [roomId, resolveApiError]);

  useEffect(() => {
    if (isOpen && roomId) {
      void loadLinks();
    }
  }, [isOpen, roomId, loadLinks]);

  // ── create a new share link ────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!roomId) return;
    setCreating(true);
    setCreateError(null);
    setNewLinkUrl(null);

    const effectivePermission: SharePermission = scope === "COMMIT" ? "VIEW" : permission;
    const body: Record<string, unknown> = { scope, permission: effectivePermission };
    if (label.trim()) body.label = label.trim();
    if (scope === "BRANCH") {
      body.branches = branches
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean);
    }
    if (scope === "COMMIT") {
      body.commitSha = commitSha.trim();
    }
    const hours = Number(expiresInHours);
    if (expiresInHours.trim() && !Number.isNaN(hours)) body.expiresInHours = hours;
    const uses = Number(maxUses);
    if (maxUses.trim() && !Number.isNaN(uses)) body.maxUses = uses;

    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/share-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { url?: string; code?: string; message?: string };
      if (!res.ok) {
        setCreateError(resolveApiError(data));
      } else {
        setNewLinkUrl(data.url ?? null);
        void loadLinks();
      }
    } catch {
      setCreateError(t("errors.INTERNAL_ERROR"));
    } finally {
      setCreating(false);
    }
  }, [roomId, scope, permission, label, branches, commitSha, expiresInHours, maxUses, t, resolveApiError, loadLinks]);

  // ── copy the newly created link to clipboard ──────────────────────────────
  const handleCopyNew = useCallback(() => {
    if (!newLinkUrl) return;
    void navigator.clipboard.writeText(newLinkUrl).then(() => {
      setCopiedNew(true);
      setTimeout(() => setCopiedNew(false), 1500);
    });
  }, [newLinkUrl]);

  // ── revoke a single link ───────────────────────────────────────────────────
  const handleRevoke = useCallback(
    async (linkId: string) => {
      if (!roomId) return;
      await fetch(`/api/rooms/${encodeURIComponent(roomId)}/share-links/${linkId}`, {
        method: "DELETE",
      });
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    },
    [roomId],
  );

  // ── revoke all links ───────────────────────────────────────────────────────
  const handleRevokeAll = useCallback(async () => {
    if (!roomId) return;
    await fetch(`/api/rooms/${encodeURIComponent(roomId)}/share-links`, { method: "DELETE" });
    setLinks([]);
    setNewLinkUrl(null);
  }, [roomId]);

  return (
    <div
      className={`overlay${isOpen ? " open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shareModalTitle"
    >
      <div className="modal" style={{ maxWidth: "540px" }}>
        <h2 id="shareModalTitle">{t("modal.share.title")}</h2>

        {/* ── Create new link form ──────────────────────────────────────────── */}
        <label htmlFor="shareLabelInput">{t("modal.share.label")}</label>
        <input
          id="shareLabelInput"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("modal.share.labelPlaceholder")}
          maxLength={120}
        />

        <label htmlFor="shareScopeSelect">{t("modal.share.scope")}</label>
        <select
          id="shareScopeSelect"
          value={scope}
          onChange={(e) => setScope(e.target.value as ShareScope)}
          disabled={!!prefilledCommitSha}
          aria-label={t("modal.share.scope")}
        >
          <option value="ROOM">{t("modal.share.scopeRoom")}</option>
          <option value="BRANCH">{t("modal.share.scopeBranch")}</option>
          <option value="COMMIT">{t("modal.share.scopeCommit")}</option>
        </select>

        {scope === "BRANCH" && (
          <>
            <label htmlFor="shareBranchesInput">{t("modal.share.branches")}</label>
            <input
              id="shareBranchesInput"
              type="text"
              value={branches}
              onChange={(e) => setBranches(e.target.value)}
              placeholder={t("modal.share.branchesPlaceholder")}
            />
          </>
        )}

        {scope === "COMMIT" && (
          <>
            <label htmlFor="shareCommitShaInput">{t("modal.share.commitSha")}</label>
            <input
              id="shareCommitShaInput"
              type="text"
              value={commitSha}
              onChange={(e) => setCommitSha(e.target.value)}
              placeholder={t("modal.share.commitShaPlaceholder")}
              readOnly={!!prefilledCommitSha}
              style={{ fontFamily: "monospace" }}
            />
          </>
        )}

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
          id="shareExpiresInput"
          type="number"
          min={1}
          max={8760}
          value={expiresInHours}
          onChange={(e) => setExpiresInHours(e.target.value)}
          placeholder={t("modal.share.expiresPlaceholder")}
        />

        <label htmlFor="shareMaxUsesInput">{t("modal.share.maxUses")}</label>
        <input
          id="shareMaxUsesInput"
          type="number"
          min={1}
          max={100000}
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
          placeholder={t("modal.share.maxUsesPlaceholder")}
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

        {/* Newly created link URL – shown right after creation */}
        {newLinkUrl && (
          <div
            className="info-box"
            style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "8px" }}
          >
            <span
              style={{
                flex: 1,
                wordBreak: "break-all",
                fontSize: "10px",
                fontFamily: "monospace",
                color: "var(--a5)",
              }}
            >
              {newLinkUrl}
            </span>
            <button
              className="mbtn"
              onClick={handleCopyNew}
              style={{ flexShrink: 0 }}
              aria-label="Copy share link to clipboard"
            >
              {copiedNew ? t("modal.share.copied") : t("modal.share.copyLink")}
            </button>
          </div>
        )}

        {/* ── Existing links list ───────────────────────────────────────────── */}
        {loadingLinks ? (
          <div className="info-box" style={{ marginTop: "12px" }}>
            {t("modal.share.loading")}
          </div>
        ) : linksError ? (
          <div
            className="info-box"
            role="alert"
            style={{ marginTop: "12px", color: "var(--a2)", borderColor: "var(--a2)" }}
          >
            {linksError}
          </div>
        ) : linksLoaded && links.length > 0 ? (
          <div style={{ marginTop: "12px" }}>
            <div
              style={{
                fontSize: "11px",
                color: "var(--tx3)",
                marginBottom: "6px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              {t("modal.share.existingLinks")} ({links.length})
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                maxHeight: "200px",
                overflowY: "auto",
              }}
            >
              {links.map((link) => {
                const expiry = link.expiresAt
                  ? new Date(link.expiresAt).toLocaleDateString()
                  : null;
                return (
                  <div
                    key={link.id}
                    style={{
                      background: "var(--s3)",
                      border: "1px solid var(--bdr)",
                      borderRadius: "8px",
                      padding: "8px 10px",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "8px",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {link.label && (
                        <div style={{ fontSize: "12px", color: "var(--tx)", marginBottom: "3px" }}>
                          {link.label}
                        </div>
                      )}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        <span
                          style={{
                            fontSize: "9px",
                            padding: "1px 6px",
                            borderRadius: "4px",
                            background: "var(--s4)",
                            color: "var(--tx2)",
                          }}
                        >
                          {link.scope}
                        </span>
                        <span
                          style={{
                            fontSize: "9px",
                            padding: "1px 6px",
                            borderRadius: "4px",
                            background: "var(--s4)",
                            color: "var(--tx2)",
                          }}
                        >
                          {link.permission}
                        </span>
                        {expiry && (
                          <span
                            style={{
                              fontSize: "9px",
                              padding: "1px 6px",
                              borderRadius: "4px",
                              background: "var(--s4)",
                              color: "var(--a4)",
                            }}
                          >
                            ⏱ {expiry}
                          </span>
                        )}
                        {link.maxUses != null && (
                          <span
                            style={{
                              fontSize: "9px",
                              padding: "1px 6px",
                              borderRadius: "4px",
                              background: "var(--s4)",
                              color: "var(--tx3)",
                            }}
                          >
                            {link.useCount}/{link.maxUses} {t("modal.share.uses")}
                          </span>
                        )}
                      </div>
                      {link.commitSha && (
                        <div
                          style={{
                            fontSize: "9px",
                            fontFamily: "monospace",
                            color: "var(--tx3)",
                            marginTop: "3px",
                          }}
                        >
                          {link.commitSha.slice(0, 12)}…
                        </div>
                      )}
                      {link.branches.length > 0 && (
                        <div
                          style={{ fontSize: "9px", color: "var(--tx3)", marginTop: "3px" }}
                        >
                          {link.branches.join(", ")}
                        </div>
                      )}
                    </div>
                    <button
                      className="mbtn warn"
                      style={{ padding: "3px 10px", fontSize: "10px", flexShrink: 0 }}
                      onClick={() => void handleRevoke(link.id)}
                      aria-label={`Revoke share link${link.label ? ` "${link.label}"` : ""}`}
                    >
                      {t("modal.share.revoke")}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          linksLoaded && (
            <p
              style={{
                fontSize: "11px",
                color: "var(--tx3)",
                marginTop: "12px",
              }}
            >
              {t("modal.share.noLinks")}
            </p>
          )
        )}

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <div className="modal-actions">
          {links.length > 0 && (
            <button
              className="mbtn warn"
              onClick={() => void handleRevokeAll()}
              aria-label="Revoke all share links"
            >
              {t("modal.share.revokeAll")}
            </button>
          )}
          <div style={{ flex: 1 }} aria-hidden="true" />
          <button className="mbtn" onClick={onClose} aria-label="Close share dialog">
            {t("modal.share.cancel")}
          </button>
          <button
            className="mbtn ok"
            onClick={() => void handleCreate()}
            disabled={creating}
            aria-label="Create share link"
          >
            {creating ? "…" : t("modal.share.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
