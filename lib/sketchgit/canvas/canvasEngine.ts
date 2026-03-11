/**
 * canvasEngine – encapsulates Fabric.js canvas setup and all drawing tools.
 *
 * P018 – Fabric.js is now imported as an npm package instead of being loaded
 * from a CDN at runtime. This eliminates the CDN dependency, enables TypeScript
 * type-checking of all Fabric.js API calls, and allows npm audit / Dependabot
 * to track the library for security updates.
 *
 * P022 – Canvas rendering performance improvements:
 *  1. All `canvas.renderAll()` calls replaced with `canvas.requestRenderAll()`.
 *     Fabric.js batches `requestRenderAll()` via `requestAnimationFrame`,
 *     deduplicating multiple calls within the same animation frame.
 *  2. Pen tool rewritten to use `fabric.Polyline` updated in-place during
 *     mousemove (zero new objects per event) instead of creating and discarding
 *     a full `fabric.Path` on every event (was O(N) objects per stroke).
 *     On mouseup the temporary polyline is replaced by a permanent `fabric.Path`
 *     for correct serialization and consistent canvas JSON format.
 */

import {
  Canvas, Path, Polyline, Rect, Ellipse, Line, IText, Polygon, Group, FabricObject, Point,
} from 'fabric';
import type { TPointerEventInfo, XY } from 'fabric';

import { ensureObjId } from '../git/objectIdTracker';

export class CanvasEngine {
  // ── Fabric.js canvas instance (set by init()) ──────────────────────────────
  canvas: Canvas | null = null;

  // ── Current tool and style state ──────────────────────────────────────────
  currentTool = 'select';
  strokeColor = '#e2e2ef';
  fillColor = '#1a1a2e';
  fillEnabled = false;
  strokeWidth = 1.5;

  // ── Drawing interaction state ─────────────────────────────────────────────
  private isDrawing = false;
  private startX = 0;
  private startY = 0;
  private activeObj: FabricObject | null = null;
  private currentPenPath: Array<{ x: number; y: number }> | null = null;

  // ── Dirty flag ────────────────────────────────────────────────────────────
  isDirty = false;

  // ── P020: Bound listener references for proper cleanup ───────────────────
  private boundResize: (() => void) | null = null;
  private boundKeydown: ((e: KeyboardEvent) => void) | null = null;

  // ── Callbacks provided by the orchestrator ────────────────────────────────
  private readonly onBroadcastDraw: (immediate?: boolean) => void;
  private readonly onBroadcastCursor: (e: { e: MouseEvent }) => void;

  constructor(
    onBroadcastDraw: (immediate?: boolean) => void,
    onBroadcastCursor: (e: { e: MouseEvent }) => void,
  ) {
    this.onBroadcastDraw = onBroadcastDraw;
    this.onBroadcastCursor = onBroadcastCursor;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  init(): void {
    const wrap = document.getElementById('canvas-wrap');
    if (!wrap) return;

    this.canvas = new Canvas('c', {
      width: wrap.clientWidth,
      height: wrap.clientHeight,
      backgroundColor: '#0a0a0f',
      selection: true,
      renderOnAddRemove: true,
    });

    this.canvas.on('mouse:down', (e: TPointerEventInfo) => this.onMouseDown(e));
    this.canvas.on('mouse:move', (e: TPointerEventInfo) => this.onMouseMove(e));
    this.canvas.on('mouse:up', (e: TPointerEventInfo) => this.onMouseUp(e));
    this.canvas.on('object:modified', () => { this.markDirty(); this.onBroadcastDraw(true); });
    this.canvas.on('object:added', (e: { target?: FabricObject }) => { if (e.target) ensureObjId(e.target); });
    this.canvas.on('mouse:wheel', (e: TPointerEventInfo<WheelEvent>) => this.onWheel(e));

    // P020: store bound references so they can be removed in destroy()
    this.boundResize = () => {
      if (!this.canvas) return;
      // Fabric v7: setWidth/setHeight replaced by setDimensions({ width, height })
      this.canvas.setDimensions({ width: wrap.clientWidth, height: wrap.clientHeight });
      // P022: requestRenderAll() is batched via rAF; safe for resize handler.
      this.canvas.requestRenderAll();
    };
    this.boundKeydown = (e: KeyboardEvent) => this.onKey(e);

    window.addEventListener('resize', this.boundResize);
    window.addEventListener('keydown', this.boundKeydown);
  }

  // ── P020: Resource cleanup ────────────────────────────────────────────────

  destroy(): void {
    if (this.boundResize) {
      window.removeEventListener('resize', this.boundResize);
      this.boundResize = null;
    }
    if (this.boundKeydown) {
      window.removeEventListener('keydown', this.boundKeydown);
      this.boundKeydown = null;
    }
    if (this.canvas) {
      void this.canvas.dispose(); // Fabric.js built-in: removes internal listeners & clears element
      this.canvas = null;
    }
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  getCanvasData(): string {
    this.canvas?.getObjects().forEach((o: FabricObject) => ensureObjId(o));
    // Fabric v7: toJSON() takes no arguments in the type definition;
    // custom properties (_id, _isArrow) are passed via a type assertion to
    // preserve backward-compatible serialization format.
    const toJSONWithExtras = this.canvas?.toJSON as
      ((extraProps: string[]) => object) | undefined;
    return JSON.stringify(toJSONWithExtras?.(['_isArrow', '_id']));
  }

  loadCanvasData(data: string): void {
    // P022: requestRenderAll() in the loadFromJSON callback schedules a single
    // frame render rather than forcing a synchronous repaint.
    // Fabric v7: loadFromJSON is promise-based; use .then() instead of a callback.
    void this.canvas?.loadFromJSON(JSON.parse(data) as Record<string, unknown>).then(() => {
      this.canvas?.requestRenderAll();
    });
  }

  // ── Dirty state ───────────────────────────────────────────────────────────

  markDirty(): void {
    this.isDirty = true;
    document.getElementById('dirty')?.classList.remove('hide');
  }

  clearDirty(): void {
    this.isDirty = false;
    document.getElementById('dirty')?.classList.add('hide');
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  private onMouseDown(e: TPointerEventInfo): void {
    if (this.currentTool === 'select') return;
    // Fabric v7: scenePoint is supplied directly on the event info object
    const p = e.scenePoint;
    this.startX = p.x;
    this.startY = p.y;
    this.isDrawing = true;
    if (this.canvas) this.canvas.selection = false;

    if (this.currentTool === 'pen') {
      this.currentPenPath = [{ x: p.x, y: p.y }];
      // P022: Use a Polyline for the in-progress stroke so points can be
      // appended in-place during mousemove without creating a new object
      // on every event.  The polyline is converted to a Path on mouseup.
      this.activeObj = new Polyline([{ x: p.x, y: p.y }], {
        stroke: this.strokeColor, strokeWidth: this.strokeWidth, fill: 'transparent',
        selectable: false, evented: false,
        strokeLineCap: 'round', strokeLineJoin: 'round',
      });
      this.canvas?.add(this.activeObj);
      return;
    }

    if (this.currentTool === 'eraser') return;

    if (this.currentTool === 'text') {
      const t = new IText('Text', {
        left: p.x, top: p.y,
        fontSize: 18, fill: this.strokeColor,
        fontFamily: 'Fira Code',
        selectable: true, editable: true,
      });
      ensureObjId(t);
      this.canvas?.add(t);
      this.canvas?.setActiveObject(t);
      t.enterEditing();
      t.selectAll();
      this.isDrawing = false;
      this.markDirty();
      return;
    }

    const shapeOpts = {
      left: p.x, top: p.y, width: 0, height: 0,
      stroke: this.strokeColor, strokeWidth: this.strokeWidth,
      fill: this.fillEnabled ? this.fillColor : 'transparent',
      selectable: false, evented: false,
      originX: 'left' as const, originY: 'top' as const,
    };

    if (this.currentTool === 'rect') {
      this.activeObj = new Rect({ ...shapeOpts, rx: 3, ry: 3 });
    } else if (this.currentTool === 'ellipse') {
      this.activeObj = new Ellipse({ ...shapeOpts, rx: 0, ry: 0 });
    } else if (this.currentTool === 'line') {
      this.activeObj = new Line([p.x, p.y, p.x, p.y], {
        stroke: this.strokeColor, strokeWidth: this.strokeWidth,
        selectable: false, evented: false, strokeLineCap: 'round',
      });
    } else if (this.currentTool === 'arrow') {
      this.activeObj = Object.assign(
        new Line([p.x, p.y, p.x, p.y], {
          stroke: this.strokeColor, strokeWidth: this.strokeWidth,
          selectable: false, evented: false, strokeLineCap: 'round',
        }),
        { _isArrow: true },
      );
    }

    if (this.activeObj) {
      ensureObjId(this.activeObj);
      this.canvas?.add(this.activeObj);
    }
  }

  private onMouseMove(e: TPointerEventInfo): void {
    // Only broadcast cursor for mouse/pointer events (not touch events).
    if (e.e instanceof MouseEvent) {
      this.onBroadcastCursor({ e: e.e });
    }
    if (!this.isDrawing) return;
    // Fabric v7: scenePoint is supplied directly on the event info object
    const p = e.scenePoint;

    if (this.currentTool === 'eraser') {
      const objs = this.canvas?.getObjects() ?? [];
      for (let i = objs.length - 1; i >= 0; i--) {
        if (objs[i].containsPoint(p)) {
          this.canvas?.remove(objs[i]);
          this.markDirty();
          break;
        }
      }
      return;
    }

    if (this.currentTool === 'pen' && this.currentPenPath) {
      this.currentPenPath.push({ x: p.x, y: p.y });
      // P022: Update the Polyline in-place instead of removing the old object
      // and creating a new one on every mousemove event.
      const poly = this.activeObj as Polyline;
      poly.set('points', [...this.currentPenPath]);
      poly.setCoords();
      this.canvas?.requestRenderAll();
      this.onBroadcastDraw(false); // throttled mid-stroke delta (immediate=false)
      return;
    }

    const dx = p.x - this.startX, dy = p.y - this.startY;
    if (!this.activeObj) return;

    if (this.currentTool === 'rect') {
      if (dx < 0) { this.activeObj.set({ left: p.x, width: -dx }); }
      else { this.activeObj.set({ width: dx }); }
      if (dy < 0) { this.activeObj.set({ top: p.y, height: -dy }); }
      else { this.activeObj.set({ height: dy }); }
    } else if (this.currentTool === 'ellipse') {
      (this.activeObj as Ellipse).set({
        rx: Math.abs(dx) / 2, ry: Math.abs(dy) / 2,
        left: dx < 0 ? p.x : this.startX,
        top: dy < 0 ? p.y : this.startY,
      });
    } else if (this.currentTool === 'line' || this.currentTool === 'arrow') {
      (this.activeObj as Line).set({ x2: p.x, y2: p.y });
    }
    this.canvas?.requestRenderAll(); // P022: batch the render via rAF
  }

  private onMouseUp(e: TPointerEventInfo): void {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.currentTool === 'pen' && this.activeObj) {
      // P022: Convert the temporary Polyline to a permanent Path.
      const penPoints = this.currentPenPath ?? [];
      this.canvas?.remove(this.activeObj);

      if (penPoints.length > 1) {
        const d = penPoints
          .map((pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `L ${pt.x} ${pt.y}`))
          .join(' ');
        const finalPath = new Path(d, {
          stroke: this.strokeColor, strokeWidth: this.strokeWidth, fill: 'transparent',
          selectable: true, evented: true,
          strokeLineCap: 'round', strokeLineJoin: 'round',
        });
        ensureObjId(finalPath);
        this.canvas?.add(finalPath);
        this.canvas?.setActiveObject(finalPath);
      }

      this.currentPenPath = null;
      this.activeObj = null;
      this.markDirty();
      if (this.canvas) this.canvas.selection = true;
      this.onBroadcastDraw(true);
      return;
    }

    if (this.activeObj) {
      // Fabric v7: scenePoint is supplied directly on the event info object
      const p = e.scenePoint;
      const dx = Math.abs(p.x - this.startX), dy = Math.abs(p.y - this.startY);
      if (dx < 3 && dy < 3) {
        this.canvas?.remove(this.activeObj);
      } else {
        ensureObjId(this.activeObj);
        this.activeObj.set({ selectable: true, evented: true });
        if ((this.activeObj as FabricObject & { _isArrow?: boolean })._isArrow) {
          this.drawArrowhead(this.activeObj as Line);
        }
        this.canvas?.setActiveObject(this.activeObj);
        this.markDirty();
      }
      this.activeObj = null;
    }

    if (this.canvas) this.canvas.selection = true;
    this.canvas?.requestRenderAll(); // P022: batch via rAF
    if (this.currentTool !== 'select') this.onBroadcastDraw(true);
  }

  private drawArrowhead(line: Line): void {
    const { x1 = 0, y1 = 0, x2 = 0, y2 = 0 } = line;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const len = 14, spread = 0.4;
    const p1x = x2 - len * Math.cos(angle - spread);
    const p1y = y2 - len * Math.sin(angle - spread);
    const p2x = x2 - len * Math.cos(angle + spread);
    const p2y = y2 - len * Math.sin(angle + spread);

    const head = new Polygon(
      [{ x: x2, y: y2 }, { x: p1x, y: p1y }, { x: p2x, y: p2y }] as XY[],
      { fill: line.stroke, stroke: line.stroke, strokeWidth: 1, selectable: false, evented: false },
    );
    ensureObjId(head);
    this.canvas?.add(head);

    const grp = new Group([line, head], { selectable: true, evented: true });
    ensureObjId(grp);
    this.canvas?.remove(line);
    this.canvas?.remove(head);
    this.canvas?.add(grp);
    this.canvas?.setActiveObject(grp);
    this.activeObj = null;
  }

  private onWheel(e: TPointerEventInfo<WheelEvent>): void {
    const delta = e.e.deltaY;
    let zoom = this.canvas?.getZoom() ?? 1;
    zoom *= 0.999 ** delta;
    zoom = Math.min(Math.max(zoom, 0.1), 10);
    // Fabric v7: zoomToPoint requires a Point instance, not a plain XY literal.
    this.canvas?.zoomToPoint(new Point(e.e.offsetX, e.e.offsetY), zoom);
    e.e.preventDefault();
    e.e.stopPropagation();
  }

  private onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (k === 's') this.setTool('select');
    else if (k === 'p') this.setTool('pen');
    else if (k === 'l') this.setTool('line');
    else if (k === 'a') this.setTool('arrow');
    else if (k === 'r') this.setTool('rect');
    else if (k === 'e') this.setTool('ellipse');
    else if (k === 't') this.setTool('text');
    else if (k === 'x') this.setTool('eraser');
    else if (k === '+' || k === '=') this.zoomIn();
    else if (k === '-') this.zoomOut();
    else if (k === '0') this.resetZoom();
    else if ((e.ctrlKey || e.metaKey) && k === 'z') {
      this.markDirty();
    } else if (k === 'delete' || k === 'backspace') {
      const obj = this.canvas?.getActiveObject();
      if (obj) { this.canvas?.remove(obj); this.markDirty(); this.onBroadcastDraw(true); }
    }
  }

  // ── Tool & style controls ─────────────────────────────────────────────────

  setTool(t: string): void {
    this.currentTool = t;
    // Reset all tool buttons, then mark the active one.
    // aria-pressed is updated here so assistive tech always reflects the real state.
    document.querySelectorAll('.tbtn').forEach((b) => {
      b.classList.remove('on');
      (b as HTMLElement).setAttribute('aria-pressed', 'false');
    });
    const btn = document.getElementById('t' + t);
    btn?.classList.add('on');
    btn?.setAttribute('aria-pressed', 'true');
    if (this.canvas) {
      this.canvas.isDrawingMode = false;
      this.canvas.selection = t === 'select';
      this.canvas.defaultCursor = t === 'eraser' || t === 'pen' ? 'crosshair' : 'default';
    }
  }

  updateStrokeColor(v: string): void {
    this.strokeColor = v;
    const dot = document.getElementById('strokeDot');
    if (dot) dot.style.background = v;
    const o = this.canvas?.getActiveObject();
    if (o) { o.set('stroke', v); this.canvas?.requestRenderAll(); }
  }

  updateFillColor(v: string): void {
    this.fillColor = v;
    const dot = document.getElementById('fillDot');
    if (dot) dot.style.background = v;
    const o = this.canvas?.getActiveObject();
    if (o) { o.set('fill', v); this.canvas?.requestRenderAll(); }
  }

  toggleFill(): void {
    this.fillEnabled = !this.fillEnabled;
    const btn = document.getElementById('tfillToggle');
    if (btn) {
      btn.textContent = this.fillEnabled ? '⊠' : '⊡';
      btn.setAttribute('aria-pressed', this.fillEnabled ? 'true' : 'false');
    }
  }

  setStrokeWidth(w: number): void {
    this.strokeWidth = w;
    // Reset all size buttons, then mark the active one (aria-pressed stays in sync).
    ['sz1', 'sz3', 'sz5'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('on');
      el.setAttribute('aria-pressed', 'false');
    });
    const activeId = w === 1.5 ? 'sz1' : w === 3 ? 'sz3' : w === 5 ? 'sz5' : null;
    if (activeId) {
      const el = document.getElementById(activeId);
      el?.classList.add('on');
      el?.setAttribute('aria-pressed', 'true');
    }
  }

  zoomIn(): void { this.canvas?.setZoom(Math.min(this.canvas.getZoom() * 1.2, 10)); }
  zoomOut(): void { this.canvas?.setZoom(Math.max(this.canvas.getZoom() / 1.2, 0.1)); }
  resetZoom(): void {
    if (!this.canvas) return;
    this.canvas.setZoom(1);
    this.canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    this.canvas.requestRenderAll(); // P022: batch via rAF
  }
}
