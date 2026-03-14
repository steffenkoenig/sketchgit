/**
 * canvasRenderer – headless Fabric.js canvas rendering helpers.
 *
 * P039 – used by the canvas export API route to render a stored canvas
 * JSON snapshot into SVG or PNG format without requiring a browser DOM.
 *
 * P076 – Added renderToPDF() using pdf-lib (pure-JS, no native bindings).
 *
 * Fabric.js v7 ships a dedicated Node.js entry point (`fabric/node`) that
 * provides a `StaticCanvas` backed by the `canvas` npm package.  Importing
 * the default `fabric` entry point in a server context throws
 * "document is not defined" because it targets browsers.  All three export
 * formats (SVG, PNG, PDF) require the Node.js entry point.
 * The route tests mock this module to isolate rendering from API logic.
 */
import { StaticCanvas } from 'fabric/node';
import { PDFDocument } from 'pdf-lib';

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const BACKGROUND_COLOR_DARK = '#0a0a0f';
const BACKGROUND_COLOR_LIGHT = '#ffffff';

// A4 landscape dimensions in points (1pt = 1/72 inch)
const A4_LANDSCAPE_WIDTH_PT = 841.89;
const A4_LANDSCAPE_HEIGHT_PT = 595.28;

/** P078 – resolve the background colour based on the requested theme. */
function backgroundColor(theme: 'dark' | 'light'): string {
  return theme === 'light' ? BACKGROUND_COLOR_LIGHT : BACKGROUND_COLOR_DARK;
}

/**
 * Render a canvas JSON snapshot to SVG markup.
 * Returns a string starting with `<svg …>`.
 */
export async function renderToSVG(json: object, theme: 'dark' | 'light' = 'dark'): Promise<string> {
  const canvas = new StaticCanvas(undefined, {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    backgroundColor: backgroundColor(theme),
  });
  await canvas.loadFromJSON(json);
  const svg = canvas.toSVG();
  void canvas.dispose();
  return svg;
}

/**
 * Render a canvas JSON snapshot to a PNG Buffer.
 * @param multiplier - pixel-density multiplier (default 2 = retina). Pass 3
 *   for ~300 dpi print quality when embedding in PDF.
 */
export async function renderToPNG(
  json: object,
  theme: 'dark' | 'light' = 'dark',
  multiplier = 2,
): Promise<Buffer> {
  const canvas = new StaticCanvas(undefined, {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    backgroundColor: backgroundColor(theme),
  });
  await canvas.loadFromJSON(json);
  const dataUrl = canvas.toDataURL({ format: 'png', multiplier });
  void canvas.dispose();
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  return Buffer.from(base64, 'base64');
}

/**
 * P076 – Render a canvas JSON snapshot to a PDF document.
 *
 * Strategy: rasterise the canvas at 3× (≈300 dpi for A4) and embed the PNG
 * into an A4-landscape pdf-lib document with document metadata.
 *
 * `createdAt` is intentionally omitted from the PDF metadata so that
 * SHA-addressed exports produce byte-identical output on every request,
 * preserving ETag / immutable-cache semantics (same SHA → same bytes).
 *
 * Returns a Uint8Array of the raw PDF bytes (starts with `%PDF`).
 */
export async function renderToPDF(
  json: object,
  theme: 'dark' | 'light' = 'dark',
): Promise<Uint8Array> {
  // Rasterise at 3× for print-quality embedding
  const pngBuffer = await renderToPNG(json, theme, 3);

  const pdfDoc = await PDFDocument.create();

  // Document metadata – omit creation date to keep bytes deterministic.
  pdfDoc.setTitle('SketchGit Canvas Export');
  pdfDoc.setProducer('SketchGit');

  // A4 landscape page
  const page = pdfDoc.addPage([A4_LANDSCAPE_WIDTH_PT, A4_LANDSCAPE_HEIGHT_PT]);

  const pngImage = await pdfDoc.embedPng(pngBuffer);
  const { width, height } = pngImage.scaleToFit(A4_LANDSCAPE_WIDTH_PT, A4_LANDSCAPE_HEIGHT_PT);
  const x = (A4_LANDSCAPE_WIDTH_PT - width) / 2;
  const y = (A4_LANDSCAPE_HEIGHT_PT - height) / 2;

  page.drawImage(pngImage, { x, y, width, height });

  return pdfDoc.save();
}
