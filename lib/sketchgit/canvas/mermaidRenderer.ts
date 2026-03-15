/**
 * mermaidRenderer – renders Mermaid diagram source code to an SVG data URL.
 *
 * This module is browser-only (never imported from SSR or Node.js paths).
 * The mermaid package is imported dynamically to ensure it is never included
 * in server-side bundles.
 */

import { logger } from '../logger';

let mermaidInitialized = false;
let renderCounter = 0;

async function ensureMermaidInit(): Promise<void> {
  if (mermaidInitialized) return;
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    fontFamily: 'Fira Code, monospace',
    securityLevel: 'strict',
  });
  mermaidInitialized = true;
}

/**
 * Render a Mermaid diagram code string to an SVG data URL.
 *
 * @returns An SVG data URL string on success, or `null` if rendering failed
 *          (e.g. invalid mermaid syntax).
 */
export async function renderMermaidToDataUrl(code: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    await ensureMermaidInit();
    const { default: mermaid } = await import('mermaid');
    const id = `mermaid-render-${++renderCounter}`;
    const { svg } = await mermaid.render(id, code);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch (err) {
    logger.warn({ err }, 'mermaidRenderer: failed to render mermaid code');
    return null;
  }
}
