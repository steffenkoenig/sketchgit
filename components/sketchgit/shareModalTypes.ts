import type { useTranslations } from "next-intl";

export type ShareScope = "ROOM" | "BRANCH" | "COMMIT";
export type SharePermission = "ADMIN" | "BRANCH_CREATE" | "WRITE" | "VIEW";

export type ShareLinkSummary = {
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

// Next-intl translation function type, derived from the real hook so it stays
// in sync with next-intl's actual (generic, overloaded) signature.
export type TFunction = ReturnType<typeof useTranslations>;
