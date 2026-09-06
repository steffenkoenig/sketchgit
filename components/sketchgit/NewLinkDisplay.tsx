import React from "react";
import { useTranslations } from "next-intl";

type NewLinkDisplayProps = {
  newLinkUrl: string | null;
  copiedNew: boolean;
  handleCopyNew: () => void;
};

export function NewLinkDisplay({
  newLinkUrl,
  copiedNew,
  handleCopyNew,
}: NewLinkDisplayProps) {
  const t = useTranslations();

  if (!newLinkUrl) return null;

  return (
    <div
      className="info-box"
      style={{
        marginTop: "8px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
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
  );
}
