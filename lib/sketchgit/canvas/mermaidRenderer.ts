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
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch (err) {
    logger.warn({ err }, 'mermaidRenderer: failed to render mermaid code');
    return null;
  }
}
