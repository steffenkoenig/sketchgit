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
 * @param width,height - canvas dimensions in CSS pixels before the
 *   multiplier is applied (default 1920x1080, the full-room export size).
 *   P095 – overridden with small dimensions for shape-template thumbnails.
 */
export async function renderToPNG(
  json: object,
  theme: 'dark' | 'light' = 'dark',
  multiplier = 2,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
): Promise<Buffer> {
  const canvas = new StaticCanvas(undefined, {
    width,
    height,
    backgroundColor: backgroundColor(theme),
  });
  await canvas.loadFromJSON(json);
  const dataUrl = canvas.toDataURL({ format: 'png', multiplier });
  void canvas.dispose();
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  return Buffer.from(base64, 'base64');
}

/**
 * P095 – Render a saved shape-template selection to a small PNG thumbnail.
 *
 * Unlike renderToPNG() (which renders a full room canvas at its original
 * absolute coordinates), a template's objects keep the absolute x/y they had
 * on the room canvas they were copied from — which could be anywhere, or
 * outside a small thumbnail viewport. This computes the objects' combined
 * bounding box after loading and fits/centers it into the thumbnail via a
 * viewport transform, with a small margin.
 */
export async function renderShapeTemplateThumbnail(
  json: object,
  theme: 'dark' | 'light' = 'dark',
  width = 320,
  height = 240,
): Promise<Buffer> {
  const canvas = new StaticCanvas(undefined, {
    width,
    height,
    backgroundColor: backgroundColor(theme),
  });
  await canvas.loadFromJSON(json);

  const objects = canvas.getObjects();
  if (objects.length > 0) {
    const margin = 16;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const obj of objects) {
      const rect = obj.getBoundingRect();
      minX = Math.min(minX, rect.left);
      minY = Math.min(minY, rect.top);
      maxX = Math.max(maxX, rect.left + rect.width);
      maxY = Math.max(maxY, rect.top + rect.height);
    }
    const boxWidth = Math.max(maxX - minX, 1);
    const boxHeight = Math.max(maxY - minY, 1);
    const scale = Math.min((width - margin * 2) / boxWidth, (height - margin * 2) / boxHeight, 1);
    const offsetX = (width - boxWidth * scale) / 2 - minX * scale;
    const offsetY = (height - boxHeight * scale) / 2 - minY * scale;
    canvas.setViewportTransform([scale, 0, 0, scale, offsetX, offsetY]);
  }

  canvas.renderAll();
  const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2 });
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
