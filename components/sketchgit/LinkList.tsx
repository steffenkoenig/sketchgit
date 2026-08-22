import React from "react";
import { useTranslations } from "next-intl";
import type { ShareLinkSummary, TFunction } from "./shareModalTypes.js";
import { LinkItem } from "./LinkItem.js";

type LinkListProps = {
  loadingLinks: boolean;
  linksError: string | null;
  linksLoaded: boolean;
  links: ShareLinkSummary[];
  handleRevoke: (id: string) => Promise<void>;
};

function LinkListContainer({
  links,
  handleRevoke,
  t,
}: {
  links: ShareLinkSummary[];
  handleRevoke: (id: string) => Promise<void>;
  t: TFunction;
}) {
  return (
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
        {links.map((link) => (
          <LinkItem key={link.id} link={link} handleRevoke={handleRevoke} />
        ))}
      </div>
    </div>
  );
}

export function LinkList({
  loadingLinks,
  linksError,
  linksLoaded,
  links,
  handleRevoke,
}: LinkListProps) {
  const t = useTranslations();

  if (loadingLinks) {
    return (
      <div className="info-box" style={{ marginTop: "12px" }}>
        {t("modal.share.loading")}
      </div>
    );
  }

  if (linksError) {
    return (
      <div
        className="info-box"
        role="alert"
        style={{
          marginTop: "12px",
          color: "var(--a2)",
          borderColor: "var(--a2)",
        }}
      >
        {linksError}
      </div>
    );
  }

  if (linksLoaded && links.length > 0) {
    return (
      <LinkListContainer links={links} handleRevoke={handleRevoke} t={t} />
    );
  }

  if (linksLoaded) {
    return (
      <p style={{ fontSize: "11px", color: "var(--tx3)", marginTop: "12px" }}>
        {t("modal.share.noLinks")}
      </p>
    );
  }

  return null;
}
