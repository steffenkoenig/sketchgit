import React from "react";
import { useTranslations } from "next-intl";
import type { ShareLinkSummary, TFunction } from "./shareModalTypes.js";

type LinkItemProps = {
  link: ShareLinkSummary;
  handleRevoke: (id: string) => Promise<void>;
};

function Badge({c, t}: {c: React.ReactNode, t: string}) {
  return (
    <span
      style={{
        fontSize: "9px",
        padding: "1px 6px",
        borderRadius: "4px",
        background: "var(--s4)",
        color: `var(--${t})`
      }}
    >
      {c}
    </span>
  );
}

function LinkItemBadges({ link, expiry, t }: { link: ShareLinkSummary, expiry: string | null, t: TFunction }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
      <Badge c={link.scope} t="tx2" />
      <Badge c={link.permission} t="tx2" />
      {expiry && <Badge c={`⏱ ${expiry}`} t="a4" />}
      {link.maxUses != null && <Badge c={`${link.useCount}/${link.maxUses} ${t("modal.share.uses")}`} t="tx3" />}
    </div>
  );
}

function LinkItemDetails({ link }: { link: ShareLinkSummary }) {
  return (
    <>
      {link.commitSha && (
        <div style={{ fontSize: "9px", fontFamily: "monospace", color: "var(--tx3)", marginTop: "3px" }}>
          {link.commitSha.slice(0, 12)}…
        </div>
      )}
      {link.branches.length > 0 && (
        <div style={{ fontSize: "9px", color: "var(--tx3)", marginTop: "3px" }}>
          {link.branches.join(", ")}
        </div>
      )}
    </>
  );
}

export function LinkItem({ link, handleRevoke }: LinkItemProps) {
  const t = useTranslations();
  const expiry = link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : null;

  return (
    <div
      style={{
        background: "var(--s3)", border: "1px solid var(--bdr)",
        borderRadius: "8px", padding: "8px 10px",
        display: "flex", alignItems: "flex-start", gap: "8px",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {link.label && (
          <div style={{ fontSize: "12px", color: "var(--tx)", marginBottom: "3px" }}>{link.label}</div>
        )}
        <LinkItemBadges link={link} expiry={expiry} t={t} />
        <LinkItemDetails link={link} />
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
}
