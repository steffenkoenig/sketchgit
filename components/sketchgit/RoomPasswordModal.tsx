"use client";
/**
 * RoomPasswordModal – P093 interstitial shown when the WebSocket connection
 * is rejected because the room requires a password.
 *
 * Flow: submit → POST /api/rooms/[roomId]/unlock (sets a signed HttpOnly
 * unlock cookie on success) → retry the WS connection, which now passes the
 * server-side password check via that cookie → close the modal once
 * connected (or on close(), leave it — SketchGitApp's WS status listener
 * covers the "still not connected" case the same as any other outage).
 */

import React, { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { openModal, closeModal } from "@/lib/sketchgit/ui/modals";

const MODAL_ID = "roomPasswordModal";

export type RoomPasswordModalProps = {
  isOpen: boolean;
  roomId: string | null;
  onUnlocked: () => void;
};

export function RoomPasswordModal({ isOpen, roomId, onUnlocked }: RoomPasswordModalProps) {
  const t = useTranslations();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // P093 accessibility requirement — reuse the same focus-trap/Escape-key
  // handling the vanilla-DOM modals (nameModal, commitModal, ...) already
  // have, via lib/sketchgit/ui/modals.ts. The element must stay mounted
  // (not conditionally rendered) for openModal() to find and focus it.
  useEffect(() => {
    if (isOpen) openModal(MODAL_ID);
    else closeModal(MODAL_ID);
  }, [isOpen]);

  const resolveApiError = useCallback(
    (err: { code?: string; message?: string }): string => {
      const code = err.code ?? "INTERNAL_ERROR";
      return t(`errors.${code}` as Parameters<typeof t>[0]) ?? err.message ?? t("errors.INTERNAL_ERROR");
    },
    [t],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!roomId || !password) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/unlock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (res.ok) {
          setPassword("");
          onUnlocked();
        } else {
          const err = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
          setError(resolveApiError(err));
        }
      } catch {
        setError(t("errors.INTERNAL_ERROR"));
      } finally {
        setSubmitting(false);
      }
    },
    [roomId, password, onUnlocked, resolveApiError, t],
  );

  return (
    <div
      className={`overlay${isOpen ? " open" : ""}`}
      id={MODAL_ID}
      role="dialog"
      aria-modal="true"
      aria-labelledby="roomPasswordModalTitle"
    >
      <div className="modal">
        <h2 id="roomPasswordModalTitle">🔒 Password Required</h2>
        <p className="info-box">This room is password-protected. Enter the password to continue.</p>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <label htmlFor="roomPasswordInput">Password</label>
          <input
            id="roomPasswordInput"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "roomPasswordModalError" : undefined}
          />
          {error && (
            <p id="roomPasswordModalError" role="alert" className="info-box error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              type="submit"
              className="mbtn ok"
              disabled={submitting || !password}
              aria-label="Submit room password"
            >
              {submitting ? "Checking…" : "Unlock"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
