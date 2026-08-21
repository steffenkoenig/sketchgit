import { describe, it, expect } from 'vitest';
import { nearestPointOnBounds } from './snapEngine.js';

describe('nearestPointOnBounds', () => {
  const bLeft = 10;
  const bTop = 10;
  const bRight = 110;
  const bBottom = 110;

  describe('when point is inside the bounding box', () => {
    it('snaps to the left edge', () => {
      const result = nearestPointOnBounds(20, 50, bLeft, bTop, bRight, bBottom);
      expect(result).toEqual({ x: 10, y: 50 });
    });

    it('snaps to the right edge', () => {
      const result = nearestPointOnBounds(100, 50, bLeft, bTop, bRight, bBottom);
      expect(result).toEqual({ x: 110, y: 50 });
    });

    it('snaps to the top edge', () => {
      const result = nearestPointOnBounds(50, 20, bLeft, bTop, bRight, bBottom);
      expect(result).toEqual({ x: 50, y: 10 });
    });

    it('snaps to the bottom edge', () => {
      const result = nearestPointOnBounds(50, 100, bLeft, bTop, bRight, bBottom);
      expect(result).toEqual({ x: 50, y: 110 });
    });
  });

  describe('when point is exactly on the bounds', () => {
    it('returns the same point on the left edge', () => {
      const result = nearestPointOnBounds(10, 50, bLeft, bTop, bRight, bBottom);
      expect(result).toEqual({ x: 10, y: 50 });
    });

    it('returns the same point on the top edge', () => {
      const result = nearestPointOnBounds(50, 10, bLeft, bTop, bRight, bBottom);
      expect(result).toEqual({ x: 50, y: 10 });
    });
  });

  describe('when point is outside the bounding box', () => {
    it('snaps to the top-left corner', () => {
      const result = nearestPointOnBounds(0, 0, bLeft, bTop, bRight, bBottom);
      expect(result).toEqual({ x: 10, y: 10 });
    });

    it('snaps to the top-right corner', () => {
      const result = nearestPointOnBounds(120, 0, bLeft, bTop, bRight, bBottom);
      expect(result).toEqual({ x: 110, y: 10 });
    });

    it('snaps to the bottom-left corner', () => {
      const result = nearestPointOnBounds(0, 120, bLeft, bTop, bRight, bBottom);
      expect(result).toEqual({ x: 10, y: 110 });
    });

    it('snaps to the bottom-right corner', () => {
      const result = nearestPointOnBounds(120, 120, bLeft, bTop, bRight, bBottom);
      expect(result).toEqual({ x: 110, y: 110 });
    });

    it('snaps to the top edge when directly above', () => {
      const result = nearestPointOnBounds(50, 0, bLeft, bTop, bRight, bBottom);
      expect(result).toEqual({ x: 50, y: 10 });
    });

    it('snaps to the bottom edge when directly below', () => {
      const result = nearestPointOnBounds(50, 120, bLeft, bTop, bRight, bBottom);
      expect(result).toEqual({ x: 50, y: 110 });
    });

    it('snaps to the left edge when directly to the left', () => {
      const result = nearestPointOnBounds(0, 50, bLeft, bTop, bRight, bBottom);
      expect(result).toEqual({ x: 10, y: 50 });
    });

    it('snaps to the right edge when directly to the right', () => {
      const result = nearestPointOnBounds(120, 50, bLeft, bTop, bRight, bBottom);
      expect(result).toEqual({ x: 110, y: 50 });
    });
  });
});
