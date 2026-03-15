// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { _fixSvgDimensions } from './mermaidRenderer';

// ─── _fixSvgDimensions ────────────────────────────────────────────────────────

describe('_fixSvgDimensions', () => {
  /**
   * Build a minimal mermaid-style SVG string that uses the "useMaxWidth" output
   * format: width="100%" + style="max-width: Xpx" + a viewBox attribute.
   */
  function makeMermaidSvg(
    viewBox: string,
    width = '100%',
    style = 'max-width: 300px;',
  ): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" style="${style}"><g></g></svg>`;
  }

  it('replaces width="100%" with explicit pixel width from viewBox', () => {
    const input = makeMermaidSvg('-8 -8 216 74');
    const result = _fixSvgDimensions(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, 'image/svg+xml');
    const svg = doc.documentElement;
    expect(svg.getAttribute('width')).toBe('216');
  });

  it('replaces the height with explicit pixel height from viewBox', () => {
    const input = makeMermaidSvg('0 0 500 300');
    const result = _fixSvgDimensions(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, 'image/svg+xml');
    const svg = doc.documentElement;
    expect(svg.getAttribute('height')).toBe('300');
  });

  it('removes the max-width style attribute', () => {
    const input = makeMermaidSvg('0 0 400 200', '100%', 'max-width: 400px;');
    const result = _fixSvgDimensions(input);
    expect(result).not.toContain('max-width');
    expect(result).not.toContain('style=');
  });

  it('handles fractional viewBox values by ceiling them', () => {
    const input = makeMermaidSvg('0 0 215.5 73.8');
    const result = _fixSvgDimensions(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, 'image/svg+xml');
    const svg = doc.documentElement;
    expect(parseInt(svg.getAttribute('width') ?? '0', 10)).toBe(216);
    expect(parseInt(svg.getAttribute('height') ?? '0', 10)).toBe(74);
  });

  it('returns the original string unchanged when viewBox is absent', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" style="max-width:200px"><g></g></svg>';
    const result = _fixSvgDimensions(input);
    // Without viewBox we cannot infer dimensions — string passed through unchanged
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, 'image/svg+xml');
    expect(doc.documentElement.getAttribute('width')).toBe('100%');
  });

  it('returns the original string unchanged when given invalid XML', () => {
    const input = 'not valid xml <<';
    const result = _fixSvgDimensions(input);
    expect(result).toBe(input);
  });

  it('handles viewBox with comma separators', () => {
    const input = makeMermaidSvg('0,0,350,150');
    const result = _fixSvgDimensions(input);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, 'image/svg+xml');
    const svg = doc.documentElement;
    expect(svg.getAttribute('width')).toBe('350');
    expect(svg.getAttribute('height')).toBe('150');
  });

  it('preserves SVG content (does not strip child elements)', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="100%" style="max-width:100px"><circle cx="50" cy="25" r="10"/></svg>';
    const result = _fixSvgDimensions(input);
    expect(result).toContain('circle');
  });
});
