import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCanvasInstance = {
  loadFromJSON: vi.fn().mockResolvedValue(undefined),
  toSVG: vi.fn().mockReturnValue('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
  toDataURL: vi.fn().mockReturnValue('data:image/png;base64,iVBORw0KGgo='),
  dispose: vi.fn(),
};

// Use a real class-like constructor so `new StaticCanvas(...)` works correctly.
vi.mock('fabric', () => {
  function StaticCanvas() { return mockCanvasInstance; }
  return { StaticCanvas };
});

import { renderToSVG, renderToPNG } from './canvasRenderer';

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
});

