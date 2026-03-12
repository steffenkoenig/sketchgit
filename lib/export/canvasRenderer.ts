/**
 * canvasRenderer – headless Fabric.js canvas rendering helpers.
 *
 * P039 – used by the canvas export API route to render a stored canvas
 * JSON snapshot into SVG or PNG format without requiring a browser DOM.
 *
 * Fabric.js v7 `StaticCanvas` is documented to work in Node.js when no
 * actual canvas painting is required (SVG export). PNG export relies on
 * canvas.toDataURL() which Fabric.js may stub in a Node.js environment
 * without node-canvas — it returns an empty data URL in that case.
 * The route tests mock this module to avoid the headless rendering limitation.
 */
import { StaticCanvas } from 'fabric';

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const BACKGROUND_COLOR = '#0a0a0f';

/**
 * Render a canvas JSON snapshot to SVG markup.
 * Returns a string starting with `<svg …>`.
 */
export async function renderToSVG(json: object): Promise<string> {
  const canvas = new StaticCanvas(undefined, {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    backgroundColor: BACKGROUND_COLOR,
  });
  await canvas.loadFromJSON(json);
  const svg = canvas.toSVG();
  void canvas.dispose();
  return svg;
}

/**
 * Render a canvas JSON snapshot to a PNG Buffer (2× multiplier for retina quality).
 * Returns a Node.js Buffer containing the raw PNG bytes.
 */
export async function renderToPNG(json: object): Promise<Buffer> {
  const canvas = new StaticCanvas(undefined, {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    backgroundColor: BACKGROUND_COLOR,
  });
  await canvas.loadFromJSON(json);
  const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2 });
  void canvas.dispose();
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  return Buffer.from(base64, 'base64');
}
