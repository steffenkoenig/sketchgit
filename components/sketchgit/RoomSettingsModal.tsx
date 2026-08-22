"use client";
/**
 * RoomSettingsModal – P093 room password protection settings.
 *
 * Owner-only in practice: PATCH /api/rooms/[roomId] returns 403 for
 * non-owners, so a non-owner opening this modal simply sees the resulting
 * error rather than needing a client-side ownership check here — same
 * pattern as MembersModal.
 */

import React, { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { openModal, closeModal } from "@/lib/sketchgit/ui/modals";

const MODAL_ID = "roomSettingsModal";

export type RoomSettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  roomId: string | null;
};

type DigestFrequency = "HOURLY" | "DAILY";

export function RoomSettingsModal({ isOpen, onClose, roomId }: RoomSettingsModalProps) {
  const t = useTranslations();
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── P094: email subscription state ─────────────────────────────────────
  const [subscribed, setSubscribed] = useState(false);
  const [frequency, setFrequency] = useState<DigestFrequency>("DAILY");
  const [subLoading, setSubLoading] = useState(false);
  const [subSaving, setSubSaving] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  // P093 accessibility requirement — same focus-trap/Escape-key handling
  // the vanilla-DOM modals already have (lib/sketchgit/ui/modals.ts).
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

  // Reset transient form state each time the modal opens. There's no GET
  // endpoint for "does this room currently have a password" from the
  // owner's perspective (the /unlock GET check is about *this caller's*
  // unlock status, which is always satisfied for the owner and so can't
  // distinguish "no password" from "owner") — the form works correctly
  // without that: "Set password" always overwrites, "Remove password"
  // always clears, regardless of prior state.
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSuccess(null);
    setPassword("");
    setHasPassword(null);
  }, [isOpen]);

  // P094 – load the caller's current subscription state each time the
  // modal opens (separate from the password logic above — subscriptions
  // are per-caller, not owner-only, so this works for any signed-in user).
  useEffect(() => {
    if (!isOpen || !roomId) return;
    setSubError(null);
    setSubLoading(true);
    fetch(`/api/rooms/${encodeURIComponent(roomId)}/subscribe`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { subscription: { frequency: DigestFrequency } | null } | null) => {
        if (data?.subscription) {
          setSubscribed(true);
          setFrequency(data.subscription.frequency);
        } else {
          setSubscribed(false);
        }
      })
      .catch(() => {})
      .finally(() => setSubLoading(false));
  }, [isOpen, roomId]);

  const saveSubscription = useCallback(
    async (nextSubscribed: boolean, nextFrequency: DigestFrequency) => {
      if (!roomId) return;
      setSubSaving(true);
      setSubError(null);
      try {
        if (nextSubscribed) {
          const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/subscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ frequency: nextFrequency }),
          });
          if (res.ok) {
            setSubscribed(true);
            setFrequency(nextFrequency);
          } else {
            const err = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
            setSubError(resolveApiError(err));
          }
        } else {
          const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/subscribe`, { method: "DELETE" });
          if (res.ok) setSubscribed(false);
          else setSubError(t("errors.INTERNAL_ERROR"));
        }
      } catch {
        setSubError(t("errors.INTERNAL_ERROR"));
      } finally {
        setSubSaving(false);
      }
    },
    [roomId, resolveApiError, t],
  );

  const submitPassword = useCallback(
    async (newPassword: string | null) => {
      if (!roomId) return;
      setSaving(true);
      setError(null);
      setSuccess(null);
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: newPassword }),
        });
        if (res.ok) {
          const data = (await res.json()) as { passwordProtected?: boolean };
          setHasPassword(data.passwordProtected ?? null);
          setPassword("");
          setSuccess(newPassword === null ? "Password removed." : "Password set.");
        } else {
          const err = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
          setError(resolveApiError(err));
        }
      } catch {
        setError(t("errors.INTERNAL_ERROR"));
      } finally {
        setSaving(false);
      }
    },
    [roomId, resolveApiError, t],
  );

  return (
    <div
      className={`overlay${isOpen ? " open" : ""}`}
      id={MODAL_ID}
      role="dialog"
      aria-modal="true"
      aria-labelledby="roomSettingsModalTitle"
    >
      <div className="modal">
        <h2 id="roomSettingsModalTitle">⚙ Room Settings</h2>
        <p className="info-box">
          Set a password to restrict this room to people who know it, regardless of who has the
          link. As the room owner, you will never be prompted for it yourself.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (password) void submitPassword(password);
          }}
        >
          <label htmlFor="roomSettingsPasswordInput">New password</label>
          <input
            id="roomSettingsPasswordInput"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank to keep current setting"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "roomSettingsModalError" : success ? "roomSettingsModalSuccess" : undefined}
          />
          {error && (
            <p id="roomSettingsModalError" role="alert" className="info-box error">
              {error}
            </p>
          )}
          {success && (
            <p id="roomSettingsModalSuccess" role="status" className="info-box">
              {success}
            </p>
          )}
          {hasPassword === false && !success && (
            <p className="info-box">This room does not currently have a password.</p>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="mbtn"
              onClick={() => void submitPassword(null)}
              disabled={saving}
              aria-label="Remove the room password"
            >
              Remove password
            </button>
            <button
              type="submit"
              className="mbtn ok"
              disabled={saving || !password}
              aria-label="Set the new room password"
            >
              {saving ? "Saving…" : "Set password"}
            </button>
            <button type="button" className="mbtn" onClick={onClose} aria-label="Close room settings">
              Close
            </button>
          </div>
        </form>

        <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid var(--bdr)" }} />

        <h3 style={{ fontSize: "14px", margin: "0 0 8px" }}>Email updates</h3>
        <p className="info-box">Get an email digest summarizing new commits and activity in this room.</p>
        {subLoading ? (
          <p>Loading…</p>
        ) : (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="checkbox"
                checked={subscribed}
                disabled={subSaving}
                onChange={(e) => void saveSubscription(e.target.checked, frequency)}
                aria-describedby={subError ? "roomSettingsSubError" : undefined}
              />
              Email me updates for this room
            </label>
            {subscribed && (
              <div style={{ marginTop: "8px" }}>
                <label htmlFor="roomSettingsFrequency">Frequency</label>
                <select
                  id="roomSettingsFrequency"
                  value={frequency}
                  disabled={subSaving}
                  onChange={(e) => void saveSubscription(true, e.target.value as DigestFrequency)}
                >
                  <option value="HOURLY">Hourly digest</option>
                  <option value="DAILY">Daily digest</option>
                </select>
              </div>
            )}
            {subError && (
              <p id="roomSettingsSubError" role="alert" className="info-box error">
                {subError}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
