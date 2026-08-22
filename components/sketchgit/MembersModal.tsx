"use client";
/**
 * MembersModal – lists room members and lets the room owner change roles.
 *
 * P091 – Owner-only in practice: the underlying REST endpoints
 * (GET/PATCH /api/rooms/[roomId]/members) return 403 for non-owners, so a
 * non-owner opening this modal simply sees the resulting error rather than
 * a client-side gate duplicating that check.
 */

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";

type MemberRole = "OWNER" | "EDITOR" | "COMMITTER" | "VIEWER";

type RoomMember = {
  userId: string;
  role: MemberRole;
  joinedAt: string;
  name: string | null;
  email: string | null;
};

export type MembersModalProps = {
  isOpen: boolean;
  onClose: () => void;
  roomId: string | null;
};

const ROLES: MemberRole[] = ["OWNER", "EDITOR", "COMMITTER", "VIEWER"];

export function MembersModal({ isOpen, onClose, roomId }: MembersModalProps) {
  const t = useTranslations();

  const resolveApiError = useCallback(
    (err: { code?: string; message?: string }): string => {
      const code = err.code ?? "INTERNAL_ERROR";
      return t(`errors.${code}` as Parameters<typeof t>[0]) ?? err.message ?? t("errors.INTERNAL_ERROR");
    },
    [t],
  );

  const [members, setMembers] = useState<RoomMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/members`);
      if (res.ok) {
        const data = (await res.json()) as { members: RoomMember[] };
        setMembers(data.members ?? []);
      } else {
        const err = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
        setError(resolveApiError(err));
        setMembers([]);
      }
    } catch {
      setError(t("errors.INTERNAL_ERROR"));
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [roomId, resolveApiError, t]);

  useEffect(() => {
    if (isOpen && roomId) void loadMembers();
  }, [isOpen, roomId, loadMembers]);

  const handleRoleChange = useCallback(
    async (userId: string, role: MemberRole) => {
      if (!roomId) return;
      setSavingUserId(userId);
      setError(null);
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/members/${encodeURIComponent(userId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        });
        if (res.ok) {
          setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, role } : m)));
        } else {
          const err = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
          setError(resolveApiError(err));
        }
      } catch {
        setError(t("errors.INTERNAL_ERROR"));
      } finally {
        setSavingUserId(null);
      }
    },
    [roomId, resolveApiError, t],
  );

  return (
    <div
      className={`overlay${isOpen ? " open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="membersModalTitle"
    >
      <div className="modal" style={{ maxWidth: "540px" }}>
        <h2 id="membersModalTitle">{t("modal.members.title")}</h2>

        {loading && <p>{t("modal.members.loading")}</p>}
        {error && (
          <p role="alert" className="auth-error">
            {error}
          </p>
        )}

        {!loading && !error && members.length === 0 && <p>{t("modal.members.empty")}</p>}

        {!loading && members.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0" }}>
            {members.map((m) => (
              <li
                key={m.userId}
                style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 0" }}
              >
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.name ?? m.email ?? m.userId}
                </span>
                <label className="sr-only" htmlFor={`role-select-${m.userId}`}>
                  {t("modal.members.roleFor", { name: m.name ?? m.email ?? m.userId })}
                </label>
                <select
                  id={`role-select-${m.userId}`}
                  value={m.role}
                  disabled={savingUserId === m.userId}
                  onChange={(e) => void handleRoleChange(m.userId, e.target.value as MemberRole)}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <div style={{ flex: 1 }} aria-hidden="true" />
          <button className="mbtn" onClick={onClose} aria-label={t("modal.members.close")}>
            {t("modal.members.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
