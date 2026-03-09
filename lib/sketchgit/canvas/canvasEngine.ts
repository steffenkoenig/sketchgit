/**
 * canvasEngine – encapsulates Fabric.js canvas setup and all drawing tools.
 *
 * Fabric.js is loaded via a CDN `<Script>` tag and exposed as `window.fabric`.
 * This module declares it as an ambient global so TypeScript is satisfied
 * without needing a package import.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fabric: any;

import { ensureObjId } from '../git/objectIdTracker';
import { showToast } from '../ui/toast';

export class CanvasEngine {
  // ── Fabric.js canvas instance (set by init()) ──────────────────────────────
  canvas: any = null;

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
  private activeObj: any = null;
  private currentPenPath: Array<{ x: number; y: number }> | null = null;

  // ── Dirty flag ────────────────────────────────────────────────────────────
  isDirty = false;

  // ── Callbacks provided by the orchestrator ────────────────────────────────
  private readonly onBroadcastDraw: (immediate?: boolean) => void;
  private readonly onBroadcastCursor: (e: any) => void;

  constructor(
    onBroadcastDraw: (immediate?: boolean) => void,
    onBroadcastCursor: (e: any) => void,
  ) {
    this.onBroadcastDraw = onBroadcastDraw;
    this.onBroadcastCursor = onBroadcastCursor;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  init(): void {
    const wrap = document.getElementById('canvas-wrap');
    if (!wrap) return;

    this.canvas = new fabric.Canvas('c', {
      width: wrap.clientWidth,
      height: wrap.clientHeight,
      backgroundColor: '#0a0a0f',
      selection: true,
      renderOnAddRemove: true,
    });

    this.canvas.on('mouse:down', (e: any) => this.onMouseDown(e));
    this.canvas.on('mouse:move', (e: any) => this.onMouseMove(e));
    this.canvas.on('mouse:up', (e: any) => this.onMouseUp(e));
    this.canvas.on('object:modified', () => { this.markDirty(); this.onBroadcastDraw(true); });
    this.canvas.on('object:added', (e: any) => { if (e.target) ensureObjId(e.target); });
    this.canvas.on('mouse:wheel', (opt: any) => this.onWheel(opt));

    window.addEventListener('resize', () => {
      this.canvas.setWidth(wrap.clientWidth);
      this.canvas.setHeight(wrap.clientHeight);
      this.canvas.renderAll();
    });

    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  getCanvasData(): string {
    this.canvas.getObjects().forEach((o: any) => ensureObjId(o));
    return JSON.stringify(this.canvas.toJSON(['_isArrow', '_id']));
  }

  loadCanvasData(data: string): void {
    this.canvas.loadFromJSON(JSON.parse(data), () => { this.canvas.renderAll(); });
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

  private onMouseDown(e: any): void {
    if (this.currentTool === 'select') return;
    const p = this.canvas.getPointer(e.e);
    this.startX = p.x;
    this.startY = p.y;
    this.isDrawing = true;
    this.canvas.selection = false;

    if (this.currentTool === 'pen') {
      this.currentPenPath = [{ x: p.x, y: p.y }];
      this.activeObj = new fabric.Path(`M ${p.x} ${p.y}`, {
        stroke: this.strokeColor, strokeWidth: this.strokeWidth, fill: 'transparent',
        selectable: false, evented: false,
        strokeLineCap: 'round', strokeLineJoin: 'round',
      });
      this.canvas.add(this.activeObj);
      return;
    }

    if (this.currentTool === 'eraser') return;

    if (this.currentTool === 'text') {
      const t = new fabric.IText('Text', {
        left: p.x, top: p.y,
        fontSize: 18, fill: this.strokeColor,
        fontFamily: 'Fira Code',
        selectable: true, editable: true,
      });
      ensureObjId(t);
      this.canvas.add(t);
      this.canvas.setActiveObject(t);
      t.enterEditing();
      t.selectAll();
      this.isDrawing = false;
      this.markDirty();
      return;
    }

    const opts = {
      left: p.x, top: p.y, width: 0, height: 0,
      stroke: this.strokeColor, strokeWidth: this.strokeWidth,
      fill: this.fillEnabled ? this.fillColor : 'transparent',
      selectable: false, evented: false,
      originX: 'left', originY: 'top',
    };

    if (this.currentTool === 'rect') {
      this.activeObj = new fabric.Rect({ ...opts, rx: 3, ry: 3 });
    } else if (this.currentTool === 'ellipse') {
      this.activeObj = new fabric.Ellipse({ ...opts, rx: 0, ry: 0 });
    } else if (this.currentTool === 'line') {
      this.activeObj = new fabric.Line([p.x, p.y, p.x, p.y], {
        stroke: this.strokeColor, strokeWidth: this.strokeWidth,
        selectable: false, evented: false, strokeLineCap: 'round',
      });
    } else if (this.currentTool === 'arrow') {
      this.activeObj = new fabric.Line([p.x, p.y, p.x, p.y], {
        stroke: this.strokeColor, strokeWidth: this.strokeWidth,
        selectable: false, evented: false, strokeLineCap: 'round', _isArrow: true,
      });
    }

    if (this.activeObj) {
      ensureObjId(this.activeObj);
      this.canvas.add(this.activeObj);
    }
  }

  private onMouseMove(e: any): void {
    this.onBroadcastCursor(e);
    if (!this.isDrawing) return;
    const p = this.canvas.getPointer(e.e);

    if (this.currentTool === 'eraser') {
      const objs = this.canvas.getObjects();
      for (let i = objs.length - 1; i >= 0; i--) {
        if (objs[i].containsPoint(p)) {
          this.canvas.remove(objs[i]);
          this.markDirty();
          break;
        }
      }
      return;
    }

    if (this.currentTool === 'pen' && this.currentPenPath) {
      this.currentPenPath.push({ x: p.x, y: p.y });
      this.canvas.remove(this.activeObj);
      const d = this.currentPenPath
        .map((pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `L ${pt.x} ${pt.y}`))
        .join(' ');
      this.activeObj = new fabric.Path(d, {
        stroke: this.strokeColor, strokeWidth: this.strokeWidth, fill: 'transparent',
        selectable: false, evented: false,
        strokeLineCap: 'round', strokeLineJoin: 'round',
      });
      ensureObjId(this.activeObj);
      this.canvas.add(this.activeObj);
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
      this.activeObj.set({
        rx: Math.abs(dx) / 2, ry: Math.abs(dy) / 2,
        left: dx < 0 ? p.x : this.startX,
        top: dy < 0 ? p.y : this.startY,
      });
    } else if (this.currentTool === 'line' || this.currentTool === 'arrow') {
      this.activeObj.set({ x2: p.x, y2: p.y });
    }
    this.canvas.renderAll();
  }

  private onMouseUp(e: any): void {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.currentTool === 'pen' && this.activeObj) {
      ensureObjId(this.activeObj);
      this.activeObj.set({ selectable: true, evented: true });
      this.canvas.setActiveObject(this.activeObj);
      this.currentPenPath = null;
      this.activeObj = null;
      this.markDirty();
      this.canvas.selection = true;
      return;
    }

    if (this.activeObj) {
      const p = this.canvas.getPointer(e.e);
      const dx = Math.abs(p.x - this.startX), dy = Math.abs(p.y - this.startY);
      if (dx < 3 && dy < 3) {
        this.canvas.remove(this.activeObj);
      } else {
        ensureObjId(this.activeObj);
        this.activeObj.set({ selectable: true, evented: true });
        if (this.currentTool === 'arrow') this.drawArrowhead(this.activeObj);
        this.canvas.setActiveObject(this.activeObj);
        this.markDirty();
      }
      this.activeObj = null;
    }

    this.canvas.selection = true;
    this.canvas.renderAll();
    if (this.currentTool !== 'select') this.onBroadcastDraw(true);
  }

  private drawArrowhead(line: any): void {
    const { x1, y1, x2, y2 } = line;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const len = 14, spread = 0.4;
    const p1x = x2 - len * Math.cos(angle - spread);
    const p1y = y2 - len * Math.sin(angle - spread);
    const p2x = x2 - len * Math.cos(angle + spread);
    const p2y = y2 - len * Math.sin(angle + spread);

    const head = new fabric.Polygon(
      [{ x: x2, y: y2 }, { x: p1x, y: p1y }, { x: p2x, y: p2y }],
      { fill: line.stroke, stroke: line.stroke, strokeWidth: 1, selectable: false, evented: false },
    );
    ensureObjId(head);
    this.canvas.add(head);

    const grp = new fabric.Group([line, head], { selectable: true, evented: true });
    ensureObjId(grp);
    this.canvas.remove(line);
    this.canvas.remove(head);
    this.canvas.add(grp);
    this.canvas.setActiveObject(grp);
    this.activeObj = null;
  }

  private onWheel(opt: any): void {
    const delta = opt.e.deltaY;
    let zoom = this.canvas.getZoom();
    zoom *= 0.999 ** delta;
    zoom = Math.min(Math.max(zoom, 0.1), 10);
    this.canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
    opt.e.preventDefault();
    opt.e.stopPropagation();
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
      if (this.canvas.undo) this.canvas.undo();
      this.markDirty();
    } else if (k === 'delete' || k === 'backspace') {
      const obj = this.canvas.getActiveObject();
      if (obj) { this.canvas.remove(obj); this.markDirty(); this.onBroadcastDraw(true); }
    }
  }

  // ── Tool & style controls ─────────────────────────────────────────────────

  setTool(t: string): void {
    this.currentTool = t;
    document.querySelectorAll('.tbtn').forEach((b) => b.classList.remove('on'));
    document.getElementById('t' + t)?.classList.add('on');
    this.canvas.isDrawingMode = false;
    this.canvas.selection = t === 'select';
    this.canvas.defaultCursor = t === 'eraser' || t === 'pen' ? 'crosshair' : 'default';
  }

  updateStrokeColor(v: string): void {
    this.strokeColor = v;
    const dot = document.getElementById('strokeDot');
    if (dot) dot.style.background = v;
    const o = this.canvas.getActiveObject();
    if (o) { o.set('stroke', v); this.canvas.renderAll(); }
  }

  updateFillColor(v: string): void {
    this.fillColor = v;
    const dot = document.getElementById('fillDot');
    if (dot) dot.style.background = v;
    const o = this.canvas.getActiveObject();
    if (o) { o.set('fill', v); this.canvas.renderAll(); }
  }

  toggleFill(): void {
    this.fillEnabled = !this.fillEnabled;
    const btn = document.getElementById('tfillToggle');
    if (btn) btn.textContent = this.fillEnabled ? '⊠' : '⊡';
  }

  setStrokeWidth(w: number): void {
    this.strokeWidth = w;
    ['sz1', 'sz3', 'sz5'].forEach((id) => document.getElementById(id)?.classList.remove('on'));
    if (w === 1.5) document.getElementById('sz1')?.classList.add('on');
    else if (w === 3) document.getElementById('sz3')?.classList.add('on');
    else if (w === 5) document.getElementById('sz5')?.classList.add('on');
  }

  zoomIn(): void { this.canvas.setZoom(Math.min(this.canvas.getZoom() * 1.2, 10)); }
  zoomOut(): void { this.canvas.setZoom(Math.max(this.canvas.getZoom() / 1.2, 0.1)); }
  resetZoom(): void {
    this.canvas.setZoom(1);
    this.canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    this.canvas.renderAll();
  }
}
