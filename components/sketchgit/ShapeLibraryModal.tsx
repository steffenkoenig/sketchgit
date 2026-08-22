"use client";
/**
 * ShapeLibraryModal – P095 custom shape templates.
 *
 * Two things happen here:
 *  - Browsing/inserting: lists the caller's saved templates as a thumbnail
 *    grid; clicking one fetches its full canvasJson and inserts it onto the
 *    canvas (click-to-insert — see the P095 report's Implementation Notes
 *    for why true drag-and-drop was scoped out).
 *  - Saving: when opened via "Save as Template" from the context menu with
 *    a selection already serialized (`pendingSave`), a name field + Save
 *    button appear at the top.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { openModal, closeModal } from "@/lib/sketchgit/ui/modals";
import type { SketchGitCall } from "@/components/sketchgit/types";

const MODAL_ID = "shapeLibraryModal";

export type ShapeLibraryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  pendingSave: { objects: object[] } | null;
  call: SketchGitCall;
};

interface TemplateSummary {
  id: string;
  name: string;
  hasThumbnail: boolean;
}

export function ShapeLibraryModal({ isOpen, onClose, pendingSave, call }: ShapeLibraryModalProps) {
  const t = useTranslations();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) openModal(MODAL_ID);
    else closeModal(MODAL_ID);
  }, [isOpen]);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/templates")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: { templates: TemplateSummary[] }) => setTemplates(data.templates))
      .catch(() => setError(t("errors.INTERNAL_ERROR")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    if (!isOpen) return;
    setSaveName("");
    refresh();
  }, [isOpen, refresh]);

  const handleSave = useCallback(async () => {
    if (!pendingSave || !saveName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveName.trim(), canvasJson: pendingSave }),
      });
      if (res.ok) {
        setSaveName("");
        refresh();
      } else {
        const err = (await res.json().catch(() => ({}))) as { code?: string };
        setError(t(`errors.${err.code ?? "INTERNAL_ERROR"}` as Parameters<typeof t>[0]) ?? t("errors.INTERNAL_ERROR"));
      }
    } catch {
      setError(t("errors.INTERNAL_ERROR"));
    } finally {
      setSaving(false);
    }
  }, [pendingSave, saveName, refresh, t]);

  const handleInsert = useCallback(
    async (id: string) => {
      setBusyId(id);
      setError(null);
      try {
        const res = await fetch(`/api/templates/${encodeURIComponent(id)}`);
        if (res.ok) {
          const data = (await res.json()) as { template: { canvasJson: { objects: unknown[] } } };
          call("insertTemplate", data.template.canvasJson);
          onClose();
        } else {
          setError(t("errors.INTERNAL_ERROR"));
        }
      } catch {
        setError(t("errors.INTERNAL_ERROR"));
      } finally {
        setBusyId(null);
      }
    },
    [call, onClose, t],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setBusyId(id);
      setError(null);
      try {
        const res = await fetch(`/api/templates/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (res.ok) {
          setTemplates((prev) => prev.filter((tpl) => tpl.id !== id));
        } else {
          setError(t("errors.INTERNAL_ERROR"));
        }
      } catch {
        setError(t("errors.INTERNAL_ERROR"));
      } finally {
        setBusyId(null);
      }
    },
    [t],
  );

  return (
    <div
      className={`overlay${isOpen ? " open" : ""}`}
      id={MODAL_ID}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shapeLibraryModalTitle"
    >
      <div className="modal">
        <h2 id="shapeLibraryModalTitle">▦ Shape Library</h2>

        {pendingSave && (
          <>
            <p className="info-box">Save the current selection as a reusable template.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSave();
              }}
            >
              <label htmlFor="shapeLibrarySaveName">Template name</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  id="shapeLibrarySaveName"
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g. Flowchart decision node"
                  maxLength={80}
                  autoFocus
                />
                <button type="submit" className="mbtn ok" disabled={saving || !saveName.trim()}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
            <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid var(--bdr)" }} />
          </>
        )}

        {error && (
          <p role="alert" className="info-box error">
            {error}
          </p>
        )}

        {loading ? (
          <p>Loading…</p>
        ) : templates.length === 0 ? (
          <p className="info-box">No saved templates yet. Select something on the canvas and choose &quot;Save as Template&quot; from its right-click menu.</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
              gap: "10px",
              maxHeight: "360px",
              overflowY: "auto",
            }}
          >
            {templates.map((tpl) => (
              <div key={tpl.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                <button
                  type="button"
                  onClick={() => void handleInsert(tpl.id)}
                  disabled={busyId === tpl.id}
                  aria-label={`Insert template ${tpl.name}`}
                  style={{
                    width: "96px",
                    height: "72px",
                    padding: 0,
                    border: "1px solid var(--bdr)",
                    borderRadius: "6px",
                    background: "var(--bg2)",
                    cursor: busyId === tpl.id ? "wait" : "pointer",
                    overflow: "hidden",
                  }}
                >
                  {tpl.hasThumbnail ? (
                    <img
                      src={`/api/templates/${encodeURIComponent(tpl.id)}/thumbnail`}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  ) : (
                    <span style={{ fontSize: "24px" }}>▦</span>
                  )}
                </button>
                <span style={{ fontSize: "11px", textAlign: "center", wordBreak: "break-word", maxWidth: "96px" }}>
                  {tpl.name}
                </span>
                <button
                  type="button"
                  className="mbtn"
                  style={{ fontSize: "11px", padding: "2px 8px", color: "var(--a2)" }}
                  onClick={() => void handleDelete(tpl.id)}
                  disabled={busyId === tpl.id}
                  aria-label={`Delete template ${tpl.name}`}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="mbtn" onClick={onClose} aria-label="Close shape library">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
