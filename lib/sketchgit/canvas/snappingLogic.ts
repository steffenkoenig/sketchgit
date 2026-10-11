import { FabricObject, Line, Rect, Ellipse, Path, Pattern } from 'fabric';
import type { CanvasEngine } from './canvasEngine';
import { nearestPointOnBounds } from './snapEngine';

export type AttachmentProps = {
  _attachedFrom?: string;
  _attachedTo?: string;
  _attachedFromAnchorX?: number;
  _attachedFromAnchorY?: number;
  _attachedToAnchorX?: number;
  _attachedToAnchorY?: number;
};

// Needed types from canvasEngine
export type AnchoredLine = Line & AttachmentProps;
export type AnchoredArrowGroup = FabricObject & AttachmentProps & {
  _isArrow?: boolean;
  _x1?: number; _y1?: number; _x2?: number; _y2?: number;
  _arrowType?: string;
  _arrowHeadStart?: string;
  _arrowHeadEnd?: string;
  _gcx?: number; _gcy?: number;
};

export class SnappingManager {
  public engine: CanvasEngine;

  constructor(engine: CanvasEngine) {
    this.engine = engine;
  }

  public static sketchRand(seed: number, i: number): number {
    const x = Math.sin(Math.abs(seed) + i * 9301.7) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
  }

  public static seedFromId(id: string): number {
    let h = 2166136261;
    for (let c = 0; c < id.length; c++) {
      h ^= id.charCodeAt(c);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0; // unsigned 32-bit
  }

  public static sloppinessAmplitude(
    sloppiness: 'architect' | 'artist' | 'cartoonist' | 'doodle',
    strokeWidth: number,
  ): number {
    if (sloppiness === 'architect') return 0;
    const base = sloppiness === 'cartoonist' ? 7 : sloppiness === 'doodle' ? 5 : 3.5;
    return Math.max(base, strokeWidth * 1.2);
  }

  public static origGeomFromObj(obj: FabricObject): string | null {
    const t = (obj as FabricObject & { type?: string }).type ?? '';
    if (t === 'rect') {
      const g = { type: 'rect',
        left: (obj.get('left') as number) ?? 0,
        top:  (obj.get('top')  as number) ?? 0,
        width: (obj.get('width') as number) ?? 0,
        height: (obj.get('height') as number) ?? 0,
        rx: (obj.get('rx') as number) ?? 0 };
      return JSON.stringify(g);
    }
    if (t === 'ellipse') {
      const erx = (obj.get('rx') as number) ?? 0;
      const ery = (obj.get('ry') as number) ?? 0;
      const g = { type: 'ellipse',
        cx: ((obj.get('left') as number) ?? 0) + erx,
        cy: ((obj.get('top')  as number) ?? 0) + ery,
        rx: erx, ry: ery };
      return JSON.stringify(g);
    }
    if (t === 'line') {
      const lo = obj as Line & { x1?: number; y1?: number; x2?: number; y2?: number };
      const g = { type: 'line', x1: lo.x1 ?? 0, y1: lo.y1 ?? 0, x2: lo.x2 ?? 0, y2: lo.y2 ?? 0 };
      return JSON.stringify(g);
    }
    return null;
  }

  public makeSketchyPath(
    geom: Record<string, unknown>,
    amplitude: number,
    seed: number,
  ): string {
    const j = (i: number) => SnappingManager.sketchRand(seed, i) * amplitude;
    const t = geom.type as string;

    if (t === 'line') {
      const { x1, y1, x2, y2 } = geom as { x1: number; y1: number; x2: number; y2: number };
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      return `M ${x1.toFixed(1)} ${y1.toFixed(1)} `
           + `Q ${(mx + j(0)).toFixed(1)} ${(my + j(1)).toFixed(1)} `
           + `${x2.toFixed(1)} ${y2.toFixed(1)}`;
    }

    if (t === 'rect') {
      const { left: l, top: to, width: w, height: h } =
        geom as { left: number; top: number; width: number; height: number };
      const rx = (geom.rx as number | undefined) ?? 0;
      const r = Math.min(rx, w / 2, h / 2);

      if (r > 0) {
        // Rounded-corner rect: 8 approach points (2 per corner) with jitter applied.
        // Indices 0-15 for approach points, 16-23 for corner arc control points.
        const pts: [number, number][] = [
          [l + r + j(0),     to + j(1)],           // top side start (after TL arc)
          [l + w - r + j(2), to + j(3)],            // top side end   (before TR arc)
          [l + w + j(4),     to + r + j(5)],        // right side start (after TR arc)
          [l + w + j(6),     to + h - r + j(7)],   // right side end   (before BR arc)
          [l + w - r + j(8), to + h + j(9)],        // bottom side start (after BR arc)
          [l + r + j(10),    to + h + j(11)],       // bottom side end   (before BL arc)
          [l + j(12),        to + h - r + j(13)],  // left side start (after BL arc)
          [l + j(14),        to + r + j(15)],       // left side end   (before TL arc)
        ];
        // Control points at each corner (jittered toward actual corner)
        const cps: [number, number][] = [
          [l + w + j(16), to + j(17)],        // TR corner
          [l + w + j(18), to + h + j(19)],   // BR corner
          [l + j(20),     to + h + j(21)],   // BL corner
          [l + j(22),     to + j(23)],        // TL corner
        ];
        const pt = (p: [number, number]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
        const cp = (p: [number, number]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
        return `M ${pt(pts[0])} `
             + `L ${pt(pts[1])} Q ${cp(cps[0])} ${pt(pts[2])} `  // TR arc
             + `L ${pt(pts[3])} Q ${cp(cps[1])} ${pt(pts[4])} `  // BR arc
             + `L ${pt(pts[5])} Q ${cp(cps[2])} ${pt(pts[6])} `  // BL arc
             + `L ${pt(pts[7])} Q ${cp(cps[3])} ${pt(pts[0])} Z`; // TL arc
      }

      // Sharp corners: four corners, each slightly offset
      const c: [number, number][] = [
        [l + j(0),     to + j(1)],
        [l + w + j(2), to + j(3)],
        [l + w + j(4), to + h + j(5)],
        [l + j(6),     to + h + j(7)],
      ];
      const jitteredMidpoint = (a: [number, number], b: [number, number], i: number) =>
        `${((a[0] + b[0]) / 2 + j(i)).toFixed(1)} ${((a[1] + b[1]) / 2 + j(i + 1)).toFixed(1)}`;
      return `M ${c[0][0].toFixed(1)} ${c[0][1].toFixed(1)} `
           + `Q ${jitteredMidpoint(c[0], c[1], 8)} ${c[1][0].toFixed(1)} ${c[1][1].toFixed(1)} `
           + `Q ${jitteredMidpoint(c[1], c[2], 10)} ${c[2][0].toFixed(1)} ${c[2][1].toFixed(1)} `
           + `Q ${jitteredMidpoint(c[2], c[3], 12)} ${c[3][0].toFixed(1)} ${c[3][1].toFixed(1)} `
           + `Q ${jitteredMidpoint(c[3], c[0], 14)} ${c[0][0].toFixed(1)} ${c[0][1].toFixed(1)} Z`;
    }

    if (t === 'ellipse') {
      const { cx, cy, rx, ry } = geom as { cx: number; cy: number; rx: number; ry: number };
      const N = 12;
      const pts: [number, number][] = [];
      for (let i = 0; i < N; i++) {
        const angle = (i / N) * Math.PI * 2;
        const dr = j(i * 2) * 0.4;            // radial jitter
        const dx = j(i * 2 + 1) * 0.3;        // tangential jitter
        pts.push([
          cx + (rx + dr) * Math.cos(angle) + dx,
          cy + (ry + dr) * Math.sin(angle) + j(i * 2 + N + 1) * 0.3,
        ]);
      }
      const parts: string[] = [`M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`];
      for (let i = 1; i <= N; i++) {
        const cur = pts[i % N];
        const prv = pts[(i - 1 + N) % N];
        const cpx = ((prv[0] + cur[0]) / 2 + j(N * 3 + i * 2)).toFixed(1);
        const cpy = ((prv[1] + cur[1]) / 2 + j(N * 3 + i * 2 + 1)).toFixed(1);
        parts.push(`Q ${cpx} ${cpy} ${cur[0].toFixed(1)} ${cur[1].toFixed(1)}`);
      }
      parts.push('Z');
      return parts.join(' ');
    }

    return '';
  }

  public tryConvertToSketch(
    obj: FabricObject,
    sloppiness: 'architect' | 'artist' | 'cartoonist' | 'doodle',
  ): FabricObject | null {
    if (!this.engine.canvas) return null;

    type Ext = {
      _id?: string; _sloppiness?: string; _origGeom?: string;
      _fillPattern?: string; _link?: string; _isArrow?: boolean; type?: string;
    };
    const oa = obj as FabricObject & Ext;

    // Don't convert arrow groups, text, or eraser placeholders
    if (oa._isArrow) return null;
    const t = oa.type ?? '';
    if (t === 'i-text' || t === 'text' || t === 'group' || t === 'eraser') return null;

    // Fetch stored origGeom, or try to build it from the current shape
    let geomStr = oa._origGeom ?? null;
    if (!geomStr) geomStr = SnappingManager.origGeomFromObj(obj);
    if (!geomStr) return null; // pen paths etc – nothing to do

    let geom: Record<string, unknown>;
    try { geom = JSON.parse(geomStr) as Record<string, unknown>; }
    catch { return null; }

    const seed = SnappingManager.seedFromId(oa._id ?? '');
    const sw   = (obj.get('strokeWidth') as number) ?? 1;
    const stroke = obj.get('stroke') as string ?? this.engine.strokeColor;
    const opacity       = (obj.get('opacity') as number) ?? 1;
    const strokeDashArr = obj.get('strokeDashArray') as number[] | undefined;

    // Resolve fill: if the current fill is a Pattern, recreate it from stored metadata
    // to avoid casting a Pattern object to string (which would yield "[object Object]").
    // Use the object's stored _fillColor (not the engine's current fillColor) so that
    // switching sloppiness does not silently change the object's fill appearance.
    const rawFill = obj.get('fill');
    const fillIsPattern = rawFill instanceof Pattern ||
      (rawFill !== null && typeof rawFill === 'object');
    const objFillColor = (oa as FabricObject & { _fillColor?: string })._fillColor ?? this.engine.fillColor;
    const fillArg: string | Pattern = fillIsPattern
      ? this.engine.createFill(
          (oa._fillPattern as 'filled' | 'striped' | 'crossed' | undefined) ?? 'filled',
          objFillColor,
        )
      : (rawFill as string) ?? 'transparent';

    // Capture source center BEFORE any canvas mutation so we can reposition the
    // replacement at exactly the same visual location.
    const srcCenter = obj.getCenterPoint();

    const copyCustom = (dst: FabricObject) => {
      const d = dst as FabricObject & Ext & { _fillColor?: string } & AttachmentProps;
      d._id          = oa._id;
      d._sloppiness  = sloppiness;
      d._origGeom    = geomStr as string;
      d._fillPattern = oa._fillPattern;
      d._fillColor   = objFillColor;
      d._link        = oa._link;
      // Preserve connector attachment IDs and border-anchor offsets so sketch-path
      // connectors continue following their attached shapes when shapes move.
      const oaA = oa as FabricObject & Ext & AttachmentProps;
      d._attachedFrom      = oaA._attachedFrom;
      d._attachedTo        = oaA._attachedTo;
      d._attachedFromAnchorX = oaA._attachedFromAnchorX;
      d._attachedFromAnchorY = oaA._attachedFromAnchorY;
      d._attachedToAnchorX   = oaA._attachedToAnchorX;
      d._attachedToAnchorY   = oaA._attachedToAnchorY;
    };

    /** Position `newObj` so its visual center matches the source object's center. */
    const applyCenter = (newObj: FabricObject) => {
      newObj.set({ left: srcCenter.x, top: srcCenter.y, originX: 'center', originY: 'center' });
      newObj.setCoords();
    };

    if (sloppiness === 'architect') {
      // Restore the native Fabric.js shape from origGeom.
      // Use stored DIMENSIONS but position at current srcCenter for correct placement
      // even when the shape has been moved since it was first drawn.
      const archOpts = this.engine.getSloppinessOptions('architect');
      const gt = geom.type as string;
      let newObj: FabricObject;
      if (gt === 'line') {
        // For lines, restore from stored dx/dy relative to current center
        const g = geom as { x1: number; y1: number; x2: number; y2: number };
        const dx = (g.x2 - g.x1) / 2, dy = (g.y2 - g.y1) / 2;
        newObj = new Line(
          [srcCenter.x - dx, srcCenter.y - dy, srcCenter.x + dx, srcCenter.y + dy],
          { stroke, strokeWidth: sw, fill: 'transparent', ...archOpts,
            strokeDashArray: strokeDashArr, opacity, selectable: true, evented: true,
            strokeUniform: true },
        );
      } else if (gt === 'rect') {
        const g = geom as { width: number; height: number; rx: number };
        newObj = new Rect({
          width: g.width, height: g.height, rx: g.rx, ry: g.rx,
          stroke, strokeWidth: sw, fill: fillArg,
          ...archOpts, strokeDashArray: strokeDashArr,
          opacity, selectable: true, evented: true, strokeUniform: true,
        });
        applyCenter(newObj);
      } else if (gt === 'ellipse') {
        const g = geom as { rx: number; ry: number };
        newObj = new Ellipse({
          rx: g.rx, ry: g.ry,
          stroke, strokeWidth: sw, fill: fillArg,
          ...archOpts, strokeDashArray: strokeDashArr,
          opacity, selectable: true, evented: true, strokeUniform: true,
        });
        applyCenter(newObj);
      } else {
        return null;
      }
      copyCustom(newObj);
      return newObj;
    }

    // artist / cartoonist / doodle → sketch path
    const amp = SnappingManager.sloppinessAmplitude(sloppiness, sw);
    const d   = this.makeSketchyPath(geom, amp, seed);
    if (!d) return null;

    // doodle: draw a second pass with a different seed offset to create a
    // characteristic "double-drawn with a pen" appearance.
    let pathData = d;
    if (sloppiness === 'doodle') {
      const d2 = this.makeSketchyPath(geom, amp * 0.6, seed + 1000);
      if (d2) pathData = `${d} ${d2}`;
    }

    const newPath = new Path(pathData, {
      stroke, strokeWidth: sw, fill: fillArg,
      strokeLineCap: 'round', strokeLineJoin: 'round',
      strokeDashArray: strokeDashArr,
      opacity, selectable: true, evented: true,
      strokeUniform: true,
    });
    // Fabric auto-sets left/top to pathOffset (= center of path's bounding box).
    // By switching to originX='center' and overriding left/top with the source
    // center, we ensure the sketch path appears at the same position regardless of
    // whether the shape was moved after it was drawn (fixes position-shift bug).
    applyCenter(newPath);
    copyCustom(newPath);
    return newPath;
  }

  public rebuildSketchPathForMove(
    pathObj: FabricObject,
    x1: number, y1: number, x2: number, y2: number,
  ): FabricObject | null {
    const sp = pathObj as AnchoredLine & { _origGeom?: string; _sloppiness?: string };
    sp._origGeom = JSON.stringify({ type: 'line', x1, y1, x2, y2 });

    const sloppiness = (sp._sloppiness as 'architect' | 'artist' | 'cartoonist') ?? 'artist';
    const rebuilt = this.tryConvertToSketch(pathObj, sloppiness);
    if (!rebuilt) return null;

    rebuilt.set({
      left: (x1 + x2) / 2,
      top: (y1 + y2) / 2,
      originX: 'center', originY: 'center',
    });
    rebuilt.setCoords();

    const prevActive = this.engine.canvas?.getActiveObject();
    this.engine.canvas?.remove(pathObj);
    this.engine.canvas?.add(rebuilt);
    if (prevActive && prevActive !== pathObj) {
      this.engine.canvas?.setActiveObject(prevActive);
    }
    return rebuilt;
  }

  public reSnapLine(tl: AnchoredLine): void {
    tl._attachedFrom = undefined;
    tl._attachedTo = undefined;
    tl._attachedFromAnchorX = undefined;
    tl._attachedFromAnchorY = undefined;
    tl._attachedToAnchorX = undefined;
    tl._attachedToAnchorY = undefined;
    this.engine.snapLineAttachment(tl);
  }

  public reSnapArrowGroup(ag: AnchoredArrowGroup, SNAP_RADIUS: number): void {
    if (this.engine._attachmentRafId !== null) {
      cancelAnimationFrame(this.engine._attachmentRafId);
      this.engine._attachmentRafId = null;
      this.engine._attachmentRafTarget = null;
    }

    const newCenter = ag.getCenterPoint();
    const dx = newCenter.x - (ag._gcx ?? newCenter.x);
    const dy = newCenter.y - (ag._gcy ?? newCenter.y);
    const x1 = (ag._x1 ?? 0) + dx;
    const y1 = (ag._y1 ?? 0) + dy;
    const x2 = (ag._x2 ?? 0) + dx;
    const y2 = (ag._y2 ?? 0) + dy;

    ag._attachedFrom = undefined;
    ag._attachedTo = undefined;
    ag._attachedFromAnchorX = undefined;
    ag._attachedFromAnchorY = undefined;
    ag._attachedToAnchorX = undefined;
    ag._attachedToAnchorY = undefined;

    const shapes = this.engine.canvas!.getObjects().filter(
      (o) => o !== ag && !(o instanceof Line) && !(o as FabricObject & { _isArrow?: boolean })._isArrow,
    );

    let snapX1 = x1, snapY1 = y1, snapX2 = x2, snapY2 = y2;
    let didSnap = false;
    let fromDist = Infinity, toDist = Infinity;

    for (const shape of shapes) {
      const center = shape.getCenterPoint();
      const id = (shape as FabricObject & { _id?: string })._id;
      if (!id) continue;
      const w = ((shape.get('width') as number) ?? 0) * ((shape.get('scaleX') as number) ?? 1);
      const h = ((shape.get('height') as number) ?? 0) * ((shape.get('scaleY') as number) ?? 1);
      const bLeft = center.x - w / 2;
      const bRight = center.x + w / 2;
      const bTop = center.y - h / 2;
      const bBottom = center.y + h / 2;
      const distToBox = (px: number, py: number): number => {
        const clampedX = Math.max(bLeft, Math.min(bRight, px));
        const clampedY = Math.max(bTop, Math.min(bBottom, py));
        return Math.hypot(px - clampedX, py - clampedY);
      };
      const d1 = distToBox(x1, y1);
      if (d1 < SNAP_RADIUS && d1 < fromDist) {
        const anchor = nearestPointOnBounds(x1, y1, bLeft, bTop, bRight, bBottom);
        ag._attachedFrom = id;
        ag._attachedFromAnchorX = anchor.x - center.x;
        ag._attachedFromAnchorY = anchor.y - center.y;
        snapX1 = anchor.x;
        snapY1 = anchor.y;
        fromDist = d1;
        didSnap = true;
      }
      const d2 = distToBox(x2, y2);
      if (d2 < SNAP_RADIUS && d2 < toDist) {
        const anchor = nearestPointOnBounds(x2, y2, bLeft, bTop, bRight, bBottom);
        ag._attachedTo = id;
        ag._attachedToAnchorX = anchor.x - center.x;
        ag._attachedToAnchorY = anchor.y - center.y;
        snapX2 = anchor.x;
        snapY2 = anchor.y;
        toDist = d2;
        didSnap = true;
      }
    }

    ag._x1 = snapX1;
    ag._y1 = snapY1;
    ag._x2 = snapX2;
    ag._y2 = snapY2;

    if (didSnap) {
      if (this.engine._attachmentRafId !== null) {
        cancelAnimationFrame(this.engine._attachmentRafId);
        this.engine._attachmentRafId = null;
        this.engine._attachmentRafTarget = null;
      }
      this.engine.rebuildArrowGroupInPlace(ag, snapX1, snapY1, snapX2, snapY2);
    } else {
      ag._gcx = newCenter.x;
      ag._gcy = newCenter.y;
    }
  }

  public reSnapSketchPath(sp: AnchoredLine & { _origGeom?: string; _sloppiness?: string; type?: string }, SNAP_RADIUS_SP: number): void {
    let geom: { type: string; x1: number; y1: number; x2: number; y2: number };
    try { geom = JSON.parse(sp._origGeom ?? '') as typeof geom; } catch { return; }
    if (geom.type !== 'line') return;

    if (this.engine._attachmentRafId !== null) {
      cancelAnimationFrame(this.engine._attachmentRafId);
      this.engine._attachmentRafId = null;
      this.engine._attachmentRafTarget = null;
    }

    const pathCenter = sp.getCenterPoint();
    const halfDx = (geom.x2 - geom.x1) / 2;
    const halfDy = (geom.y2 - geom.y1) / 2;
    const x1sp = pathCenter.x - halfDx;
    const y1sp = pathCenter.y - halfDy;
    const x2sp = pathCenter.x + halfDx;
    const y2sp = pathCenter.y + halfDy;

    sp._attachedFrom = undefined;
    sp._attachedTo = undefined;
    sp._attachedFromAnchorX = undefined;
    sp._attachedFromAnchorY = undefined;
    sp._attachedToAnchorX = undefined;
    sp._attachedToAnchorY = undefined;

    const spShapes = this.engine.canvas!.getObjects().filter(
      (o) => o !== sp && !(o instanceof Line) && !(o as FabricObject & { _isArrow?: boolean })._isArrow,
    );

    let snapX1sp = x1sp, snapY1sp = y1sp, snapX2sp = x2sp, snapY2sp = y2sp;
    let didSnapSp = false;
    let fromDistSp = Infinity, toDistSp = Infinity;

    for (const shape of spShapes) {
      const center = shape.getCenterPoint();
      const id = (shape as FabricObject & { _id?: string })._id;
      if (!id) continue;
      const w = ((shape.get('width') as number) ?? 0) * ((shape.get('scaleX') as number) ?? 1);
      const h = ((shape.get('height') as number) ?? 0) * ((shape.get('scaleY') as number) ?? 1);
      const bLeft = center.x - w / 2;
      const bRight = center.x + w / 2;
      const bTop = center.y - h / 2;
      const bBottom = center.y + h / 2;
      const distToBox = (px: number, py: number): number => {
        const clampedX = Math.max(bLeft, Math.min(bRight, px));
        const clampedY = Math.max(bTop, Math.min(bBottom, py));
        return Math.hypot(px - clampedX, py - clampedY);
      };
      const d1 = distToBox(x1sp, y1sp);
      if (d1 < SNAP_RADIUS_SP && d1 < fromDistSp) {
        const anchor = nearestPointOnBounds(x1sp, y1sp, bLeft, bTop, bRight, bBottom);
        sp._attachedFrom = id;
        sp._attachedFromAnchorX = anchor.x - center.x;
        sp._attachedFromAnchorY = anchor.y - center.y;
        snapX1sp = anchor.x;
        snapY1sp = anchor.y;
        fromDistSp = d1;
        didSnapSp = true;
      }
      const d2 = distToBox(x2sp, y2sp);
      if (d2 < SNAP_RADIUS_SP && d2 < toDistSp) {
        const anchor = nearestPointOnBounds(x2sp, y2sp, bLeft, bTop, bRight, bBottom);
        sp._attachedTo = id;
        sp._attachedToAnchorX = anchor.x - center.x;
        sp._attachedToAnchorY = anchor.y - center.y;
        snapX2sp = anchor.x;
        snapY2sp = anchor.y;
        toDistSp = d2;
        didSnapSp = true;
      }
    }

    if (didSnapSp) {
      if (this.engine._attachmentRafId !== null) {
        cancelAnimationFrame(this.engine._attachmentRafId);
        this.engine._attachmentRafId = null;
        this.engine._attachmentRafTarget = null;
      }
      const wasActive = this.engine.canvas!.getActiveObject() === sp;
      const spId = (sp as FabricObject & { _id?: string })._id;
      const rebuilt = this.rebuildSketchPathForMove(sp, snapX1sp, snapY1sp, snapX2sp, snapY2sp);
      if (wasActive && spId && rebuilt) {
        this.engine.canvas!.setActiveObject(rebuilt);
      }
    }
  }

  public reSnapOnModified(obj: FabricObject): void {
    if (!this.engine.canvas) return;

    // Cancel any pending rAF from object:moving so it doesn't fire with a stale reference
    if (this.engine._attachmentRafId !== null) {
      cancelAnimationFrame(this.engine._attachmentRafId);
      this.engine._attachmentRafId = null;
      this.engine._attachmentRafTarget = null;
    }

    if (obj instanceof Line) {
      this.reSnapLine(obj as AnchoredLine);
      return;
    }

    const ag = obj as AnchoredArrowGroup;
    if (ag._isArrow) {
      this.reSnapArrowGroup(ag, 30);
      return;
    }

    const sp = obj as AnchoredLine & { _origGeom?: string; _sloppiness?: string; type?: string };
    if (sp.type === 'path' && sp._origGeom) {
      this.reSnapSketchPath(sp, 30);
    }
  }




  /**
   * Schedule a connector-follow update for `movedObj` on the next animation frame.
   * If a frame is already pending the new target simply overwrites the old one so
   * that the work done per frame stays constant regardless of mousemove frequency.
   */
  /** When a shape is moved, update the endpoints of any Line or arrow Group attached to it. */
  public updateAttachedLines(movedObj: FabricObject): void {
    if (!this.engine.canvas) return;
    const id = (movedObj as FabricObject & { _id?: string })._id;
    if (!id) return;
    const center = movedObj.getCenterPoint();
    let changed = false;

    // Collect arrow groups and sketch paths that need rebuilding so we don't modify
    // the objects list while iterating over it.
    const arrowsToRebuild: Array<{ grp: FabricObject; x1: number; y1: number; x2: number; y2: number }> = [];
    const sketchesToRebuild: Array<{ sp: FabricObject; x1: number; y1: number; x2: number; y2: number }> = [];

    for (const obj of this.engine.canvas.getObjects()) {
      if (obj instanceof Line) {
        const attached = obj as AnchoredLine;
        if (attached._attachedFrom === id) {
          attached.set({
            x1: center.x + (attached._attachedFromAnchorX ?? 0),
            y1: center.y + (attached._attachedFromAnchorY ?? 0),
          });
          attached.setCoords();
          changed = true;
        }
        if (attached._attachedTo === id) {
          attached.set({
            x2: center.x + (attached._attachedToAnchorX ?? 0),
            y2: center.y + (attached._attachedToAnchorY ?? 0),
          });
          attached.setCoords();
          changed = true;
        }
      } else {
        const ag = obj as AnchoredArrowGroup;
        if (ag._isArrow) {
          let x1 = ag._x1 ?? 0;
          let y1 = ag._y1 ?? 0;
          let x2 = ag._x2 ?? 0;
          let y2 = ag._y2 ?? 0;
          let needsRebuild = false;
          if (ag._attachedFrom === id) {
            x1 = center.x + (ag._attachedFromAnchorX ?? 0);
            y1 = center.y + (ag._attachedFromAnchorY ?? 0);
            needsRebuild = true;
          }
          if (ag._attachedTo === id) {
            x2 = center.x + (ag._attachedToAnchorX ?? 0);
            y2 = center.y + (ag._attachedToAnchorY ?? 0);
            needsRebuild = true;
          }
          if (needsRebuild) {
            arrowsToRebuild.push({ grp: obj, x1, y1, x2, y2 });
            changed = true;
          }
        } else {
          // Handle sketch-path connectors (artist/cartoonist lines stored as Path objects).
          const sp = obj as AnchoredLine & { _origGeom?: string; _sloppiness?: string; type?: string };
          if (sp.type !== 'path' || !sp._origGeom) continue;
          if (sp._attachedFrom !== id && sp._attachedTo !== id) continue;
          let geom: { type: string; x1: number; y1: number; x2: number; y2: number };
          try { geom = JSON.parse(sp._origGeom) as typeof geom; }
          catch { continue; }
          if (geom.type !== 'line') continue;
          let { x1, y1, x2, y2 } = geom;
          if (sp._attachedFrom === id) {
            x1 = center.x + (sp._attachedFromAnchorX ?? 0);
            y1 = center.y + (sp._attachedFromAnchorY ?? 0);
          }
          if (sp._attachedTo === id) {
            x2 = center.x + (sp._attachedToAnchorX ?? 0);
            y2 = center.y + (sp._attachedToAnchorY ?? 0);
          }
          sketchesToRebuild.push({ sp: obj, x1, y1, x2, y2 });
          changed = true;
        }
      }
    }

    for (const { grp, x1, y1, x2, y2 } of arrowsToRebuild) {
      this.engine.rebuildArrowGroupInPlace(grp, x1, y1, x2, y2);
    }
    for (const { sp, x1, y1, x2, y2 } of sketchesToRebuild) {
      this.rebuildSketchPathForMove(sp, x1, y1, x2, y2);
    }

    if (changed) {
      this.engine.canvas.requestRenderAll();
      this.engine.markDirty();
      this.engine.onBroadcastDraw(false); // throttled — endpoint moves are frequent
    }
  }

  public scheduleAttachmentUpdate(movedObj: FabricObject): void {
    this.engine._attachmentRafTarget = movedObj;
    if (this.engine._attachmentRafId !== null) return; // frame already queued
    this.engine._attachmentRafId = requestAnimationFrame(() => {
      this.engine._attachmentRafId = null;
      const target = this.engine._attachmentRafTarget;
      this.engine._attachmentRafTarget = null;
      if (target) this.updateAttachedLines(target);
    });
  }


}
