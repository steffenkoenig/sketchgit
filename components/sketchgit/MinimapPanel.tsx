"use client";
/**
 * MinimapPanel – P096 canvas minimap / radar view.
 *
 * A floating overview of the whole canvas in the bottom-right corner: a
 * faint box for the content's overall bounds, a highlighted rectangle for
 * the current viewport, and click/drag/keyboard navigation to jump around
 * a large board without hunting for content by scrolling and zooming.
 *
 * Sync strategy: this app has no single "viewport changed" event — the
 * viewport moves via zoomIn/zoomOut/resetZoom/wheel-zoom/pinch-zoom/
 * presenter-follow, and content bounds move via drawing, undo/redo,
 * checkout, merge, and remote peer edits. Hooking every one of those call
 * sites individually would be invasive and easy to miss one. Instead this
 * polls CanvasEngine.getMinimapData() on a fixed interval while visible —
 * simple, catches every case uniformly, and (deliberately) attaches no
 * listeners of its own to the Fabric.js canvas, so there is nothing here
 * that could leak across a canvas re-init.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { SketchGitCall } from "@/components/sketchgit/types";

const POLL_MS = 200;
const PAN_STEP = 60;
const MINIMAP_WIDTH = 180;
const MINIMAP_HEIGHT = 130;
const EXTENT_PADDING_RATIO = 0.15;

type Rect = { left: number; top: number; width: number; height: number };
type MinimapData = { worldBounds: Rect | null; viewport: Rect };

export type MinimapPanelProps = {
  call: SketchGitCall;
  getMinimapData: () => MinimapData | null;
};

function isFiniteRect(r: Rect | null | undefined): r is Rect {
  return !!r && [r.left, r.top, r.width, r.height].every((v) => Number.isFinite(v)) && r.width > 0 && r.height > 0;
}

/** Union of two rects, padded proportionally. Guards against non-finite input. */
function computeExtent(worldBounds: Rect | null, viewport: Rect): Rect {
  const rects = [worldBounds, viewport].filter(isFiniteRect);
  if (rects.length === 0) return { left: 0, top: 0, width: 1, height: 1 };
  const minX = Math.min(...rects.map((r) => r.left));
  const minY = Math.min(...rects.map((r) => r.top));
  const maxX = Math.max(...rects.map((r) => r.left + r.width));
  const maxY = Math.max(...rects.map((r) => r.top + r.height));
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const padX = width * EXTENT_PADDING_RATIO;
  const padY = height * EXTENT_PADDING_RATIO;
  return { left: minX - padX, top: minY - padY, width: width + padX * 2, height: height + padY * 2 };
}

export function MinimapPanel({ call, getMinimapData }: MinimapPanelProps) {
  const t = useTranslations();
  const [visible, setVisible] = useState(true);
  const [data, setData] = useState<MinimapData | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    function handleToggle() { setVisible((v) => !v); }
    document.addEventListener("sketchgit:toggleMinimap", handleToggle);
    return () => document.removeEventListener("sketchgit:toggleMinimap", handleToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const poll = () => setData(getMinimapData());
    poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => window.clearInterval(id);
  }, [visible, getMinimapData]);

  const extent = data ? computeExtent(data.worldBounds, data.viewport) : null;
  const scale = extent ? Math.min(MINIMAP_WIDTH / extent.width, MINIMAP_HEIGHT / extent.height) : 1;
  const drawnWidth = extent ? extent.width * scale : MINIMAP_WIDTH;
  const drawnHeight = extent ? extent.height * scale : MINIMAP_HEIGHT;
  const originX = (MINIMAP_WIDTH - drawnWidth) / 2;
  const originY = (MINIMAP_HEIGHT - drawnHeight) / 2;

  const worldToMinimap = useCallback(
    (wx: number, wy: number) => {
      if (!extent) return { x: 0, y: 0 };
      return { x: originX + (wx - extent.left) * scale, y: originY + (wy - extent.top) * scale };
    },
    [extent, scale, originX, originY],
  );

  const minimapToWorld = useCallback(
    (mx: number, my: number) => {
      if (!extent || scale === 0) return { x: 0, y: 0 };
      return { x: (mx - originX) / scale + extent.left, y: (my - originY) / scale + extent.top };
    },
    [extent, scale, originX, originY],
  );

  const panToMinimapPoint = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const { x, y } = minimapToWorld(clientX - rect.left, clientY - rect.top);
      call("panToWorldPoint", x, y);
    },
    [call, minimapToWorld],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      draggingRef.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      panToMinimapPoint(e.clientX, e.clientY);
    },
    [panToMinimapPoint],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      panToMinimapPoint(e.clientX, e.clientY);
    },
    [panToMinimapPoint],
  );

  const handlePointerUp = useCallback(() => { draggingRef.current = false; }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const deltas: Record<string, [number, number]> = {
        ArrowUp: [0, PAN_STEP], ArrowDown: [0, -PAN_STEP],
        ArrowLeft: [PAN_STEP, 0], ArrowRight: [-PAN_STEP, 0],
      };
      const delta = deltas[e.key];
      if (!delta) return;
      e.preventDefault();
      call("panByScreenDelta", delta[0], delta[1]);
    },
    [call],
  );

  if (!visible) {
    return (
      <button
        type="button"
        className="mbtn"
        onClick={() => setVisible(true)}
        aria-label={t("minimap.show") || "Show minimap"}
        style={{ position: "fixed", right: "16px", bottom: "16px", zIndex: 40 }}
      >
        ▦
      </button>
    );
  }

  const viewportRectMm = data && extent ? {
    ...worldToMinimap(data.viewport.left, data.viewport.top),
    width: data.viewport.width * scale,
    height: data.viewport.height * scale,
  } : null;

  const contentRectMm = data?.worldBounds && extent ? {
    ...worldToMinimap(data.worldBounds.left, data.worldBounds.top),
    width: data.worldBounds.width * scale,
    height: data.worldBounds.height * scale,
  } : null;

  const positionLabel = data
    ? `Viewport at x=${Math.round(data.viewport.left)}, y=${Math.round(data.viewport.top)}, zoom area ${Math.round(data.viewport.width)}×${Math.round(data.viewport.height)}`
    : "Viewport unknown";

  return (
    <div
      style={{
        position: "fixed", right: "16px", bottom: "16px", zIndex: 40,
        background: "var(--s2)", border: "1px solid var(--bdr)", borderRadius: "8px",
        padding: "6px", boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <span style={{ fontSize: "10px", color: "var(--tx2)" }}>{t("minimap.title") || "Minimap"}</span>
        <button
          type="button"
          className="mbtn"
          onClick={() => setVisible(false)}
          aria-label={t("minimap.hide") || "Hide minimap"}
          style={{ fontSize: "10px", padding: "1px 6px", lineHeight: 1.2 }}
        >
          ✕
        </button>
      </div>
      <div
        ref={containerRef}
        data-testid="minimap-surface"
        role="application"
        tabIndex={0}
        aria-label={`${t("minimap.title") || "Minimap"}. ${positionLabel}. Use arrow keys to pan.`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        style={{
          position: "relative", width: `${MINIMAP_WIDTH}px`, height: `${MINIMAP_HEIGHT}px`,
          background: "var(--canvas-bg)", borderRadius: "4px", overflow: "hidden",
          cursor: "crosshair", touchAction: "none",
        }}
      >
        {contentRectMm && (
          <div
            data-testid="minimap-content"
            style={{
              position: "absolute",
              left: `${contentRectMm.x}px`, top: `${contentRectMm.y}px`,
              width: `${Math.max(contentRectMm.width, 1)}px`, height: `${Math.max(contentRectMm.height, 1)}px`,
              background: "var(--bdr)", opacity: 0.5, borderRadius: "2px",
            }}
          />
        )}
        {viewportRectMm && (
          <div
            data-testid="minimap-viewport"
            style={{
              position: "absolute",
              left: `${viewportRectMm.x}px`, top: `${viewportRectMm.y}px`,
              width: `${Math.max(viewportRectMm.width, 2)}px`, height: `${Math.max(viewportRectMm.height, 2)}px`,
              border: "1.5px solid var(--a1)", background: "rgba(124,110,255,0.12)",
              boxSizing: "border-box", pointerEvents: "none",
            }}
          />
        )}
      </div>
    </div>
  );
}
