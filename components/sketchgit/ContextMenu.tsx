import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { SketchGitCall } from "@/components/sketchgit/types";

type ContextMenuProps = { call: SketchGitCall };

export const ContextMenu = React.memo(function ContextMenu({ call }: ContextMenuProps) {
  const t = useTranslations("toolbar");
  const [menuState, setMenuState] = useState<{ x: number; y: number; show: boolean } | null>(null);

  const [canGroup, setCanGroup] = useState(false);
  const [canUngroup, setCanUngroup] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);

  useEffect(() => {
    const handleContext = (e: Event) => {
      const ce = e as CustomEvent;
      // Use client coordinates for position overlay correctly
      setMenuState({
        x: ce.detail.x,
        y: ce.detail.y,
        show: true
      });
      setCanGroup(ce.detail.canGroup);
      setCanUngroup(ce.detail.canUngroup);
      setHasSelection(ce.detail.hasSelection);
    };

    const handleClick = () => setMenuState(null);
    const handleScroll = () => setMenuState(null);

    window.addEventListener("sketchgit-context-menu", handleContext);
    window.addEventListener("click", handleClick);
    // Any scroll event or tool change should close it
    window.addEventListener("scroll", handleScroll, true);

    // Support escape to close
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuState(null);
    };
    window.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("sketchgit-context-menu", handleContext);
      window.removeEventListener("click", handleClick);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("keydown", handleKey);
    };
  }, []);

  if (!menuState?.show) return null;

  // We reuse tb-dropdown styles since they look good
  return (
    <div
      className="tb-dropdown-menu open"
      style={{
        position: "fixed",
        top: menuState.y,
        left: menuState.x,
        margin: 0,
        // Override tb-dropdown-menu translation animation for perfect cursor positioning
        transform: "none",
        zIndex: 9999
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        // Right clicking inside the menu stops propagation
        e.stopPropagation();
      }}
    >
      {hasSelection ? (
        <>
          {canGroup && (
            <button className="tb-dropdown-item" onClick={() => call("groupSelection")}>
              {t("groupObjects") || "Group"}
            </button>
          )}
          {canUngroup && (
            <button className="tb-dropdown-item" onClick={() => call("ungroupSelection")}>
              {t("ungroupObjects") || "Ungroup"}
            </button>
          )}
          {(canGroup || canUngroup) && <div className="tb-dropdown-sep" />}

          <button className="tb-dropdown-item" onClick={() => call("bringForward")}>
            {t("bringForward") || "Bring Forward"}
          </button>
          <button className="tb-dropdown-item" onClick={() => call("sendBackward")}>
            {t("sendBackward") || "Send Backward"}
          </button>
          <button className="tb-dropdown-item" onClick={() => call("bringToFront")}>
            {t("bringToFront") || "Bring to Front"}
          </button>
          <button className="tb-dropdown-item" onClick={() => call("sendToBack")}>
            {t("sendToBack") || "Send to Back"}
          </button>

          <div className="tb-dropdown-sep" />

          <button className="tb-dropdown-item" style={{ color: "var(--a2)" }} onClick={() => call("deleteSelection")}>
            {t("delete") || "Delete"}
          </button>
        </>
      ) : (
        <div style={{ padding: "8px 12px", color: "var(--tx2)", fontSize: "12px", textAlign: "center" }}>
          No selection
        </div>
      )}
    </div>
  );
});
