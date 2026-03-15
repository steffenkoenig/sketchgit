/**
 * mermaidRenderer – renders Mermaid diagram source code to an SVG data URL.
 *
 * This module is browser-only (never imported from SSR or Node.js paths).
 * The mermaid package is imported dynamically to ensure it is never included
 * in server-side bundles.
 */

import { logger } from '../logger';

let mermaidTheme: 'dark' | 'default' | null = null;
let renderCounter = 0;

async function ensureMermaidInit(theme: 'dark' | 'default'): Promise<void> {
  if (mermaidTheme === theme) return;
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false,
    theme,
    fontFamily: 'Fira Code, monospace',
    securityLevel: 'strict',
  });
  mermaidTheme = theme;
}

/**
 * Mermaid's default configuration uses `useMaxWidth: true` which causes the
 * output SVG to have `width="100%"` with a `style="max-width: Xpx"` attribute
 * instead of explicit pixel dimensions.  When such an SVG is loaded by a
 * browser as an `<img>` data URL (as FabricImage does), the `100%` width has
 * no parent context and the image loads at the browser default (300×150 px),
 * cutting off the diagram content.
 *
 * This function post-processes the SVG string from mermaid to replace the
 * relative width with explicit pixel dimensions derived from the `viewBox`.
 * The `style` attribute is cleared so no `max-width` constraint remains.
 * If the SVG lacks a viewBox, the original string is returned unchanged.
 *
 * Exported for unit testing only – treat as internal.
 */
export function _fixSvgDimensions(svgString: string): string {
  if (typeof window === 'undefined') return svgString;
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) return svgString;

  const svg = doc.documentElement;
  const viewBox = svg.getAttribute('viewBox');
  if (!viewBox) return svgString;

  // viewBox format: "min-x min-y width height"
  const parts = viewBox.trim().split(/[\s,]+/);
  if (parts.length < 4) return svgString;

  const vbWidth = parseFloat(parts[2]);
  const vbHeight = parseFloat(parts[3]);
  if (!isFinite(vbWidth) || !isFinite(vbHeight) || vbWidth <= 0 || vbHeight <= 0) {
    return svgString;
  }

  // Set explicit pixel dimensions so the SVG has a predictable intrinsic size
  // regardless of the rendering context.
  svg.setAttribute('width', String(Math.ceil(vbWidth)));
  svg.setAttribute('height', String(Math.ceil(vbHeight)));
  // Remove the max-width style injected by mermaid when useMaxWidth is true
  svg.removeAttribute('style');

  return new XMLSerializer().serializeToString(doc);
}

/**
 * Render a Mermaid diagram code string to an SVG data URL.
 *
 * @param code    Mermaid diagram source code.
 * @param theme   Optional theme – defaults to 'dark'. Pass 'default' for the
 *                light-mode canvas background.
 * @returns An SVG data URL string on success, or `null` if rendering failed
 *          (e.g. invalid mermaid syntax).
 */
export async function renderMermaidToDataUrl(
  code: string,
  theme: 'dark' | 'default' = 'dark',
): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    await ensureMermaidInit(theme);
    const { default: mermaid } = await import('mermaid');
    const id = `mermaid-render-${++renderCounter}`;
    const { svg } = await mermaid.render(id, code);
    const fixedSvg = _fixSvgDimensions(svg);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fixedSvg)}`;
  } catch (err) {
    logger.warn({ err }, 'mermaidRenderer: failed to render mermaid code');
    return null;
  }
}
