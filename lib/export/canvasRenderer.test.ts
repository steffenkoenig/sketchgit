import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCanvasInstance = {
  loadFromJSON: vi.fn().mockResolvedValue(undefined),
  toSVG: vi.fn().mockReturnValue('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
  toDataURL: vi.fn().mockReturnValue('data:image/png;base64,iVBORw0KGgo='),
  dispose: vi.fn(),
};

// Use a real class-like constructor so `new StaticCanvas(...)` works correctly.
vi.mock('fabric/node', () => {
  function StaticCanvas() { return mockCanvasInstance; }
  return { StaticCanvas };
});

// P076 – mock pdf-lib using vi.hoisted so variables are available inside vi.mock factory.
const { mockPdfPage, mockPdfDoc } = vi.hoisted(() => {
  const mockPdfPage = { drawImage: vi.fn() };
  const mockPngImage = { scaleToFit: vi.fn().mockReturnValue({ width: 200, height: 100 }) };
  const mockPdfDoc = {
    setTitle: vi.fn(),
    setProducer: vi.fn(),
    setCreationDate: vi.fn(),
    addPage: vi.fn().mockReturnValue(mockPdfPage),
    embedPng: vi.fn().mockResolvedValue(mockPngImage),
    save: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  };
  return { mockPdfPage, mockPngImage, mockPdfDoc };
});

vi.mock('pdf-lib', () => ({
  PDFDocument: { create: vi.fn().mockResolvedValue(mockPdfDoc) },
}));

import { renderToSVG, renderToPNG, renderToPDF } from './canvasRenderer';

describe('renderToSVG', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a string starting with <svg', async () => {
    const result = await renderToSVG({ objects: [] });
    expect(result).toMatch(/^<svg/);
  });

  it('passes the JSON to loadFromJSON', async () => {
    const json = { objects: [{ type: 'rect' }] };
    await renderToSVG(json);
    expect(mockCanvasInstance.loadFromJSON).toHaveBeenCalledWith(json);
  });

  it('calls dispose after rendering', async () => {
    await renderToSVG({});
    expect(mockCanvasInstance.dispose).toHaveBeenCalled();
  });
});

describe('renderToPNG', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a Buffer', async () => {
    const result = await renderToPNG({ objects: [] });
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it('returns non-empty buffer when base64 data is available', async () => {
    const result = await renderToPNG({ objects: [] });
    expect(result.length).toBeGreaterThan(0);
  });

  it('calls dispose after rendering', async () => {
    await renderToPNG({});
    expect(mockCanvasInstance.dispose).toHaveBeenCalled();
  });

  it('P076 – accepts an explicit multiplier parameter', async () => {
    mockCanvasInstance.toDataURL.mockReturnValue('data:image/png;base64,iVBORw0KGgo=');
    await renderToPNG({}, 'dark', 3);
    expect(mockCanvasInstance.toDataURL).toHaveBeenCalledWith(expect.objectContaining({ multiplier: 3 }));
  });
});

describe('P076 renderToPDF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPdfDoc.save.mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])); // %PDF
    mockCanvasInstance.toDataURL.mockReturnValue('data:image/png;base64,iVBORw0KGgo=');
  });

  it('returns a Uint8Array', async () => {
    const result = await renderToPDF({});
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('PDF bytes start with %PDF magic bytes', async () => {
    const result = await renderToPDF({});
    // 0x25 = '%', 0x50 = 'P', 0x44 = 'D', 0x46 = 'F'
    expect(result[0]).toBe(0x25);
    expect(result[1]).toBe(0x50);
  });

  it('sets document title and producer metadata', async () => {
    await renderToPDF({});
    expect(mockPdfDoc.setTitle).toHaveBeenCalledWith('SketchGit Canvas Export');
    expect(mockPdfDoc.setProducer).toHaveBeenCalledWith('SketchGit');
  });

  it('embeds a PNG image into the page', async () => {
    await renderToPDF({});
    expect(mockPdfDoc.embedPng).toHaveBeenCalled();
    expect(mockPdfPage.drawImage).toHaveBeenCalled();
  });
});

