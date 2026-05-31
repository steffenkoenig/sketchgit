export const SNAP_DISTANCE = 30;

export interface SnappedPoint {
  x: number;
  y: number;
  attachedToId: string;
  anchorX: number;
  anchorY: number;
}

/**
 * Utility function to compute the nearest point on a bounding box.
 */
export function nearestPointOnBounds(px: number, py: number, bLeft: number, bTop: number, bRight: number, bBottom: number): { x: number; y: number } {
  // If inside box, snap to closest edge
  if (px >= bLeft && px <= bRight && py >= bTop && py <= bBottom) {
    const dLeft = px - bLeft;
    const dRight = bRight - px;
    const dTop = py - bTop;
    const dBottom = bBottom - py;
    const m = Math.min(dLeft, dRight, dTop, dBottom);
    if (m === dLeft) return { x: bLeft, y: py };
    if (m === dRight) return { x: bRight, y: py };
    if (m === dTop) return { x: px, y: bTop };
    return { x: px, y: bBottom };
  }
  // Otherwise snap to nearest point on perimeter
  const clampedX = Math.max(bLeft, Math.min(bRight, px));
  const clampedY = Math.max(bTop, Math.min(bBottom, py));
  return { x: clampedX, y: clampedY };
}