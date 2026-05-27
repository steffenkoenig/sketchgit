import { describe, it, expect } from 'vitest';
import { MERGE_PROPS } from './types';
import { BRANCH_COLORS } from './types';

describe('types', () => {
  describe('MERGE_PROPS', () => {
    it('should be an array of strings', () => {
      expect(Array.isArray(MERGE_PROPS)).toBe(true);
      MERGE_PROPS.forEach(prop => {
        expect(typeof prop).toBe('string');
      });
    });

    it('should not contain duplicate properties', () => {
      const uniqueProps = new Set(MERGE_PROPS);
      expect(uniqueProps.size).toBe(MERGE_PROPS.length);
    });

    it('should contain expected key properties for merging', () => {
      const expectedProps = [
        'stroke', 'fill', 'strokeWidth', 'left', 'top', 'width', 'height',
        'scaleX', 'scaleY', 'angle', 'path', 'text',
        '_mermaidCode'
      ];

      expectedProps.forEach(prop => {
        expect(MERGE_PROPS).toContain(prop);
      });
    });

    it('should have a reasonable length', () => {
      // Just a sanity check that we aren't unexpectedly missing a ton of props
      expect(MERGE_PROPS.length).toBeGreaterThan(30);
      expect(MERGE_PROPS.length).toBeLessThan(100);
    });
  });
});

describe('BRANCH_COLORS', () => {
  it('is an array of 8 colors', () => {
    expect(Array.isArray(BRANCH_COLORS)).toBe(true);
    expect(BRANCH_COLORS.length).toBe(8);
  });

  it('contains valid hex color strings', () => {
    const hexColorRegex = /^#([0-9A-Fa-f]{3}){1,2}$/i;
    BRANCH_COLORS.forEach(color => {
      expect(color).toMatch(hexColorRegex);
    });
  });
});
