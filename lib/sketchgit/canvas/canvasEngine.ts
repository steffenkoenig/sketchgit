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
  Canvas, Path, Polyline, Rect, Ellipse, Line, IText, Polygon, Group, FabricObject, Point, Pattern,
} from 'fabric';
import type { TPointerEventInfo, XY } from 'fabric';

import { ensureObjId } from '../git/objectIdTracker';
import { logger } from '../logger';

/** Shared type for arrow Group objects carrying endpoint + style metadata. */
type ArrowGroupExt = FabricObject & {
  _isArrow?: boolean;
  _x1?: number; _y1?: number; _x2?: number; _y2?: number;
  _arrowType?: string;
  _arrowHeadStart?: string;
  _arrowHeadEnd?: string;
};

export class CanvasEngine {
  // ── Fabric.js canvas instance (set by init()) ──────────────────────────────
  canvas: Canvas | null = null;

  // ── Current tool and style state ──────────────────────────────────────────
  currentTool = 'select';
  strokeColor = '#e2e2ef';
  fillColor = '#1a1a2e';
  fillEnabled = false;
  strokeWidth = 1.5;
  strokeDashType: 'solid' | 'dashed' | 'dotted' = 'solid';
  borderRadiusEnabled = false;
  opacityValue = 100;
  sloppiness: 'architect' | 'artist' | 'cartoonist' | 'doodle' = 'architect';
  fillPattern: 'filled' | 'striped' | 'crossed' = 'filled';
  arrowHeadStart: 'none' | 'open' | 'triangle' | 'triangle-outline' = 'none';
  arrowHeadEnd: 'none' | 'open' | 'triangle' | 'triangle-outline' = 'open';
  arrowType: 'sharp' | 'curved' | 'elbow' = 'sharp';

  // ── Drawing interaction state ─────────────────────────────────────────────
  private isDrawing = false;
  private startX = 0;
  private startY = 0;
  private activeObj: FabricObject | null = null;
  private currentPenPath: Array<{ x: number; y: number }> | null = null;

  // ── Dirty flag ────────────────────────────────────────────────────────────
  isDirty = false;

  // ── P037: Undo/redo history stack ─────────────────────────────────────────
  private readonly MAX_HISTORY = 50;
  private undoStack: string[] = [];
  private redoStack: string[] = [];

  // ── P020: Bound listener references for proper cleanup ───────────────────
  private boundResize: (() => void) | null = null;
  private boundKeydown: ((e: KeyboardEvent) => void) | null = null;

  // ── P067: Remote object locks (clientId → { objectIds, color, origStyles }) ─
  private remoteLocks = new Map<string, { objectIds: Set<string>; color: string; origStyles: Map<string, { stroke: string | undefined; strokeWidth: number | undefined; strokeDashArray: number[] | undefined }> }>();

  // ── P085: Pinch-to-zoom touch state ──────────────────────────────────────
  private touchStartDist: number | null = null;
  private touchStartZoom = 1;
  private touchWrapEl: HTMLElement | null = null;
  private boundTouchStart: ((e: TouchEvent) => void) | null = null;
  private boundTouchMove: ((e: TouchEvent) => void) | null = null;

  // ── Callbacks provided by the orchestrator ────────────────────────────────
  private readonly onBroadcastDraw: (immediate?: boolean) => void;
  private readonly onBroadcastCursor: (e: { e: MouseEvent }) => void;
  /** P067 – broadcast that the local user selected/deselected objects */
  private onBroadcastLock?: (objectIds: string[]) => void;
  private onBroadcastUnlock?: () => void;

  constructor(
    onBroadcastDraw: (immediate?: boolean) => void,
    onBroadcastCursor: (e: { e: MouseEvent }) => void,
    onBroadcastLock?: (objectIds: string[]) => void,
    onBroadcastUnlock?: () => void,
  ) {
    this.onBroadcastDraw = onBroadcastDraw;
    this.onBroadcastCursor = onBroadcastCursor;
    this.onBroadcastLock = onBroadcastLock;
    this.onBroadcastUnlock = onBroadcastUnlock;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  init(): void {
    // In Fabric.js v7, canvas.toJSON() calls toObject() with no arguments and
    // therefore ignores any propertiesToInclude list passed to it.  The correct
    // mechanism for custom properties in v7 is FabricObject.customProperties:
    // any key listed there is always included by every object's toObject() /
    // toJSON() call regardless of how the canvas is serialised.
    //
    // Registering _id and _isArrow here ensures that every committed canvas
    // snapshot contains these fields so the merge engine can track objects by
    // their stable identity across branches.
    if (!FabricObject.customProperties.includes('_id')) {
      FabricObject.customProperties.push('_id');
    }
    if (!FabricObject.customProperties.includes('_isArrow')) {
      FabricObject.customProperties.push('_isArrow');
    }
    for (const p of ['_link', '_arrowHeadStart', '_arrowHeadEnd', '_arrowType', '_fillPattern', '_sloppiness', '_origGeom', '_attachedFrom', '_attachedTo', '_x1', '_y1', '_x2', '_y2', '_fillColor']) {
      if (!FabricObject.customProperties.includes(p)) {
        FabricObject.customProperties.push(p);
      }
    }

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
    this.canvas.on('object:modified', () => { this.pushHistory(); this.markDirty(); this.onBroadcastDraw(true); });
    this.canvas.on('object:added', (e: { target?: FabricObject }) => { if (e.target) ensureObjId(e.target); });
    this.canvas.on('mouse:wheel', (e: TPointerEventInfo<WheelEvent>) => this.onWheel(e));

    this.canvas.on('mouse:dblclick', (e: { target?: FabricObject }) => {
      const target = e.target;
      if (!target) return;
      const link = (target as FabricObject & { _link?: string })._link;
      if (link) {
        // Only allow safe URL schemes to prevent javascript: injection.
        try {
          const url = new URL(link);
          if (url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:') {
            window.open(link, '_blank', 'noopener,noreferrer');
          }
        } catch {
          // Malformed URL — ignore silently.
        }
      }
    });

    // P067 – broadcast selection events so peers can show soft-lock indicator
    this.canvas.on('selection:created', (e: { selected?: FabricObject[] }) => {
      const ids = (e.selected ?? [])
        .map((obj) => (obj as FabricObject & { _id?: string })._id ?? '')
        .filter(Boolean);
      if (ids.length > 0) this.onBroadcastLock?.(ids);
      this.syncPropertiesPanelToSelection();
    });
    this.canvas.on('selection:updated', (e: { selected?: FabricObject[] }) => {
      const ids = (e.selected ?? [])
        .map((obj) => (obj as FabricObject & { _id?: string })._id ?? '')
        .filter(Boolean);
      if (ids.length > 0) this.onBroadcastLock?.(ids);
      this.syncPropertiesPanelToSelection();
    });
    this.canvas.on('selection:cleared', () => {
      this.onBroadcastUnlock?.();
      this.syncPropertiesPanelToSelection();
    });

    // Attachment tracking: when an object is moved, update any attached line endpoints.
    this.canvas.on('object:moving', (e: { target?: FabricObject }) => {
      if (e.target) this.updateAttachedLines(e.target);
    });

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

    // P085 – Pinch-to-zoom: attach touch listeners on the canvas wrapper so
    // that a two-finger pinch gesture zooms the Fabric.js canvas.  Fabric.js v7
    // uses pointer events internally, so these touch listeners do not conflict.
    this.touchWrapEl = wrap;
    this.boundTouchStart = (e: TouchEvent) => this.onTouchStart(e);
    this.boundTouchMove = (e: TouchEvent) => this.onTouchMove(e);
    wrap.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    wrap.addEventListener('touchmove', this.boundTouchMove, { passive: false });
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
    // P085 – remove pinch-to-zoom listeners
    if (this.touchWrapEl) {
      if (this.boundTouchStart) {
        this.touchWrapEl.removeEventListener('touchstart', this.boundTouchStart);
        this.boundTouchStart = null;
      }
      if (this.boundTouchMove) {
        this.touchWrapEl.removeEventListener('touchmove', this.boundTouchMove);
        this.boundTouchMove = null;
      }
      this.touchWrapEl = null;
    }
    if (this.canvas) {
      void this.canvas.dispose(); // Fabric.js built-in: removes internal listeners & clears element
      this.canvas = null;
    }
    // P067 – clear all remote lock records on destroy
    this.remoteLocks.clear();
  }

  // ── P067: Remote object lock indicators ───────────────────────────────────

  /**
   * Apply a coloured dashed-border lock indicator to objects selected by a
   * remote peer. Saves original stroke styles for later restoration.
   */
  applyRemoteLock(clientId: string, objectIds: string[], color: string): void {
    if (!this.canvas) return;
    this.clearRemoteLock(clientId);
    const lockedSet = new Set(objectIds);
    const origStyles = new Map<string, { stroke: string | undefined; strokeWidth: number | undefined; strokeDashArray: number[] | undefined }>();
    for (const obj of this.canvas.getObjects()) {
      const id = (obj as FabricObject & { _id?: string })._id ?? '';
      if (!lockedSet.has(id)) continue;
      origStyles.set(id, {
        stroke: obj.get('stroke') as string | undefined,
        // Store without defaulting to 1: if strokeWidth was undefined, restoring
        // to 1 would permanently add an explicit property that wasn't there before.
        strokeWidth: obj.get('strokeWidth') as number | undefined,
        strokeDashArray: obj.get('strokeDashArray') as number[] | undefined,
      });
      obj.set({ stroke: color, strokeWidth: 2, strokeDashArray: [5, 3] });
    }
    this.remoteLocks.set(clientId, { objectIds: lockedSet, color, origStyles });
    this.canvas.requestRenderAll();
  }

  /** Remove the lock indicator for a peer and restore original object styles. */
  clearRemoteLock(clientId: string): void {
    if (!this.canvas) return;
    const lock = this.remoteLocks.get(clientId);
    if (!lock) return;
    for (const obj of this.canvas.getObjects()) {
      const id = (obj as FabricObject & { _id?: string })._id ?? '';
      if (!lock.objectIds.has(id)) continue;
      const orig = lock.origStyles.get(id);
      if (orig) {
        // Restore stroke and dashArray unconditionally (undefined is valid – clears the property).
        // Only restore strokeWidth when it was originally set; otherwise leave it at
        // the lock value so Fabric.js doesn't permanently gain an explicit strokeWidth
        // property that was not in the original serialization.
        obj.set({
          stroke: orig.stroke,
          strokeDashArray: orig.strokeDashArray,
          ...(orig.strokeWidth !== undefined ? { strokeWidth: orig.strokeWidth } : {}),
        });
      }
    }
    this.remoteLocks.delete(clientId);
    this.canvas.requestRenderAll();
  }

  // ── P080: Presenter mode – viewport helpers ────────────────────────────────

  /**
   * Return the current Fabric.js viewport transform for serialisation.
   * Used by CollaborationManager to build view-sync payloads.
   */
  getViewport(): [number, number, number, number, number, number] {
    const vpt = this.canvas?.viewportTransform;
    if (!vpt || vpt.length < 6) return [1, 0, 0, 1, 0, 0];
    return [vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]] as [number, number, number, number, number, number];
  }

  /**
   * Apply a remote viewport transform received from the presenter.
   * Does NOT trigger onBroadcastDraw – viewport changes are display-only.
   */
  applyViewport(vpt: [number, number, number, number, number, number]): void {
    if (!this.canvas) return;
    this.canvas.setViewportTransform(vpt);
    this.canvas.requestRenderAll();
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  getCanvasData(): string {
    if (!this.canvas) return JSON.stringify(undefined);
    this.canvas.getObjects().forEach((o: FabricObject) => ensureObjId(o));
    // Fabric v7: canvas.toJSON() ignores any propertiesToInclude argument because its
    // signature is toJSON() (no params) – it just delegates to toObject() with no args.
    // canvas.toObject(propertiesToInclude) DOES forward the list to each object's
    // toObject(), so _id and _isArrow are included in the output.
    // NOTE: FabricObject.customProperties is also set in init() as a belt-and-suspenders
    // guard so that any call path (toJSON included) always serialises these fields.
    return JSON.stringify(this.canvas.toObject([
      '_isArrow', '_id', '_link', '_fillPattern', '_fillColor',
      '_arrowHeadStart', '_arrowHeadEnd', '_arrowType',
      '_sloppiness', '_origGeom',
      '_attachedFrom', '_attachedTo',
      '_x1', '_y1', '_x2', '_y2',
    ]));
  }

  loadCanvasData(data: string): void {
    // P037: Clear undo/redo stacks when an external canvas state is loaded
    // (e.g. git checkout, merge) — local history is no longer valid.
    this.undoStack = [];
    this.redoStack = [];
    // P022: requestRenderAll() in the loadFromJSON callback schedules a single
    // frame render rather than forcing a synchronous repaint.
    // Fabric v7: loadFromJSON is promise-based; use .then() instead of a callback.
    void this.canvas?.loadFromJSON(JSON.parse(data) as Record<string, unknown>).then(() => {
      this.applyStrokeUniformToAll();
      this.canvas?.requestRenderAll();
    }).catch((err: unknown) => {
      logger.error({ err }, 'loadCanvasData: failed to load canvas JSON');
    });
  }

  // ── P037: Undo / Redo ─────────────────────────────────────────────────────

  /**
   * Capture the current canvas state onto the undo stack.
   * Called before each user-initiated drawing gesture.
   */
  private pushHistory(): void {
    const json = this.getCanvasData();
    this.undoStack.push(json);
    if (this.undoStack.length > this.MAX_HISTORY) {
      this.undoStack.shift(); // evict oldest to keep stack bounded
    }
    this.redoStack = []; // any new action clears the redo stack
  }

  /** Undo the last drawing action (Ctrl+Z). Broadcasts restored state to peers. */
  undo(): void {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return;
    const current = this.getCanvasData();
    this.redoStack.push(current);
    void this.canvas?.loadFromJSON(JSON.parse(snapshot) as Record<string, unknown>).then(() => {
      this.applyStrokeUniformToAll();
      this.canvas?.requestRenderAll();
      this.markDirty();
      this.onBroadcastDraw(true);
    }).catch((err: unknown) => {
      logger.error({ err }, 'undo: failed to load snapshot');
    });
  }

  /** Redo the last undone action (Ctrl+Shift+Z / Ctrl+Y). Broadcasts restored state to peers. */
  redo(): void {
    const snapshot = this.redoStack.pop();
    if (!snapshot) return;
    const current = this.getCanvasData();
    this.undoStack.push(current);
    void this.canvas?.loadFromJSON(JSON.parse(snapshot) as Record<string, unknown>).then(() => {
      this.applyStrokeUniformToAll();
      this.canvas?.requestRenderAll();
      this.markDirty();
      this.onBroadcastDraw(true);
    }).catch((err: unknown) => {
      logger.error({ err }, 'redo: failed to load snapshot');
    });
  }

  // ── Dirty state ───────────────────────────────────────────────────────────

  /**
   * Optional callback fired once when the canvas transitions from clean to
   * dirty (i.e. on the very first drawing gesture after a checkout or commit).
   * Used by app.ts to auto-trigger branch creation when in detached HEAD state.
   */
  onFirstDirty?: () => void;

  markDirty(): void {
    if (!this.isDirty) {
      this.onFirstDirty?.();
    }
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
    // P037: Snapshot the canvas state before this gesture so Ctrl+Z can restore it.
    this.pushHistory();
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
      const sloppyOpts = this.getSloppinessOptions(this.sloppiness);
      this.activeObj = new Polyline([{ x: p.x, y: p.y }], {
        stroke: this.strokeColor, strokeWidth: this.strokeWidth, fill: 'transparent',
        selectable: false, evented: false,
        strokeLineCap: sloppyOpts.strokeLineCap, strokeLineJoin: sloppyOpts.strokeLineJoin,
        strokeDashArray: this.getDashArray(this.strokeDashType, this.strokeWidth),
        opacity: this.opacityValue / 100,
        strokeUniform: true,
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
        opacity: this.opacityValue / 100,
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

    const sloppyOpts = this.getSloppinessOptions(this.sloppiness);
    const shapeOpts = {
      left: p.x, top: p.y, width: 0, height: 0,
      stroke: this.strokeColor, strokeWidth: this.strokeWidth,
      fill: this.fillEnabled ? this.createFill(this.fillPattern, this.fillColor) : 'transparent',
      selectable: false, evented: false,
      originX: 'left' as const, originY: 'top' as const,
      strokeDashArray: this.getDashArray(this.strokeDashType, this.strokeWidth),
      opacity: this.opacityValue / 100,
      strokeUniform: true,
      ...sloppyOpts,
    };

    if (this.currentTool === 'rect') {
      const r = this.borderRadiusEnabled ? 12 : 3;
      this.activeObj = Object.assign(
        new Rect({ ...shapeOpts, rx: r, ry: r }),
        { _fillPattern: this.fillPattern, _fillColor: this.fillColor },
      );
    } else if (this.currentTool === 'ellipse') {
      this.activeObj = Object.assign(
        new Ellipse({ ...shapeOpts, rx: 0, ry: 0 }),
        { _fillPattern: this.fillPattern, _fillColor: this.fillColor },
      );
    } else if (this.currentTool === 'line') {
      const lineOpts = {
        stroke: this.strokeColor, strokeWidth: this.strokeWidth,
        selectable: false, evented: false,
        strokeLineCap: sloppyOpts.strokeLineCap,
        strokeDashArray: this.getDashArray(this.strokeDashType, this.strokeWidth),
        opacity: this.opacityValue / 100,
        strokeUniform: true,
      };
      this.activeObj = new Line([p.x, p.y, p.x, p.y], lineOpts);
    } else if (this.currentTool === 'arrow') {
      const lineOpts = {
        stroke: this.strokeColor, strokeWidth: this.strokeWidth,
        selectable: false, evented: false,
        strokeLineCap: sloppyOpts.strokeLineCap,
        strokeDashArray: this.getDashArray(this.strokeDashType, this.strokeWidth),
        opacity: this.opacityValue / 100,
        strokeUniform: true,
      };
      this.activeObj = Object.assign(
        new Line([p.x, p.y, p.x, p.y], lineOpts),
        { _isArrow: true, _arrowHeadStart: this.arrowHeadStart, _arrowHeadEnd: this.arrowHeadEnd, _arrowType: this.arrowType },
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
          const sloppyOpts = this.getSloppinessOptions(this.sloppiness);
          const d = penPoints
            .map((pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `L ${pt.x} ${pt.y}`))
            .join(' ');
          const finalPath = new Path(d, {
            stroke: this.strokeColor, strokeWidth: this.strokeWidth, fill: 'transparent',
            selectable: true, evented: true,
            strokeLineCap: sloppyOpts.strokeLineCap, strokeLineJoin: sloppyOpts.strokeLineJoin,
            strokeDashArray: this.getDashArray(this.strokeDashType, this.strokeWidth),
            opacity: this.opacityValue / 100,
            strokeUniform: true,
          });
          ensureObjId(finalPath);
          Object.assign(finalPath, { _sloppiness: this.sloppiness });
          this.canvas?.add(finalPath);
          this.canvas?.setActiveObject(finalPath);
        }

        this.currentPenPath = null;
        this.activeObj = null;
        this.markDirty();
        if (this.canvas) this.canvas.selection = false; // pen tool stays in drawing mode
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
            const arrowObj = this.activeObj as Line & { _arrowHeadStart?: string; _arrowHeadEnd?: string; _arrowType?: string };
            const headStart = (arrowObj._arrowHeadStart ?? this.arrowHeadStart) as 'none' | 'open' | 'triangle' | 'triangle-outline';
            const headEnd = (arrowObj._arrowHeadEnd ?? this.arrowHeadEnd) as 'none' | 'open' | 'triangle' | 'triangle-outline';
            const arrowType = (arrowObj._arrowType ?? this.arrowType) as 'sharp' | 'curved' | 'elbow';
            // Store sloppiness/origGeom on arrow line before building group
            this.stampOrigGeomAndSloppiness(this.activeObj);
            this.buildArrowGroup(this.activeObj as Line, headStart, headEnd, arrowType);
          } else {
            // For rect / ellipse / line: store origGeom, then convert to sketch path if needed.
            this.stampOrigGeomAndSloppiness(this.activeObj);

            if (this.sloppiness !== 'architect') {
              const sketch = this.tryConvertToSketch(this.activeObj, this.sloppiness);
              if (sketch) {
                this.canvas?.remove(this.activeObj);
                this.activeObj = sketch;
                this.canvas?.add(this.activeObj);
              }
            }
            // Snap line endpoints to nearby shape centers when near a shape.
            this.snapLineAttachment(this.activeObj as Line);
            this.canvas?.setActiveObject(this.activeObj);
          }
          this.markDirty();
        }
        this.activeObj = null;
      }

    if (this.canvas) this.canvas.selection = this.currentTool === 'select';
    this.canvas?.requestRenderAll(); // P022: batch via rAF
    if (this.currentTool !== 'select') this.onBroadcastDraw(true);
  }

  private buildArrowGroup(
    line: Line,
    headStart: 'none' | 'open' | 'triangle' | 'triangle-outline',
    headEnd: 'none' | 'open' | 'triangle' | 'triangle-outline',
    arrowType: 'sharp' | 'curved' | 'elbow',
  ): void {
    if (!this.canvas) return;
    const { x1 = 0, y1 = 0, x2 = 0, y2 = 0 } = line as Line & { x1?: number; y1?: number; x2?: number; y2?: number };
    const stroke = line.stroke as string ?? this.strokeColor;
    const strokeWidth = (line.get('strokeWidth') as number) ?? this.strokeWidth;

    const shapes: FabricObject[] = [];

    // For curved and elbow types, replace the line with a path
    if (arrowType === 'curved' || arrowType === 'elbow') {
      let pathD: string;
      if (arrowType === 'curved') {
        // Quadratic Bezier with midpoint perpendicular offset
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        const curvature = Math.min(len * 0.3, 60);
        const cx = mx - (dy / len) * curvature;
        const cy = my + (dx / len) * curvature;
        pathD = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
      } else {
        // Elbow: right-angle connector (goes horizontal then vertical)
        const midX = (x1 + x2) / 2;
        pathD = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
      }
      const pathLine = new Path(pathD, {
        stroke, strokeWidth, fill: 'transparent',
        selectable: false, evented: false,
        strokeLineCap: 'round', strokeLineJoin: 'round',
        strokeDashArray: line.get('strokeDashArray') as number[] | undefined,
        opacity: line.get('opacity') as number | undefined,
        strokeUniform: true,
      });
      ensureObjId(pathLine);
      shapes.push(pathLine);
      this.canvas.remove(line);
    } else {
      shapes.push(line);
    }

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const len = 14, spread = 0.4;
    const lineOpacity = (line.get('opacity') as number | undefined) ?? 1;

    // End arrowhead
    if (headEnd !== 'none') {
      const head = this.makeArrowhead(x2, y2, angle, len, spread, stroke, strokeWidth, headEnd, lineOpacity);
      if (head) { ensureObjId(head); shapes.push(head); }
    }

    // Start arrowhead (reversed angle)
    if (headStart !== 'none') {
      const head = this.makeArrowhead(x1, y1, angle + Math.PI, len, spread, stroke, strokeWidth, headStart, lineOpacity);
      if (head) { ensureObjId(head); shapes.push(head); }
    }

    // Remove individual shapes from canvas before grouping
    for (const s of shapes) {
      if (s !== line) this.canvas.add(s);
      this.canvas.remove(s);
    }

    const grp = Object.assign(
      new Group(shapes, { selectable: true, evented: true }),
      { _isArrow: true, _arrowHeadStart: headStart, _arrowHeadEnd: headEnd, _arrowType: arrowType,
        _x1: x1, _y1: y1, _x2: x2, _y2: y2 },
    );
    ensureObjId(grp);
    this.canvas.add(grp);
    this.canvas.setActiveObject(grp);
    this.activeObj = null;
  }

  private makeArrowhead(
    tipX: number, tipY: number,
    angle: number, len: number, spread: number,
    stroke: string, strokeWidth: number,
    type: 'open' | 'triangle' | 'triangle-outline',
    opacity = 1,
  ): FabricObject | null {
    const p1x = tipX - len * Math.cos(angle - spread);
    const p1y = tipY - len * Math.sin(angle - spread);
    const p2x = tipX - len * Math.cos(angle + spread);
    const p2y = tipY - len * Math.sin(angle + spread);

    if (type === 'open') {
      // Open arrow: two-line chevron using a Polyline (no fill)
      const pts = [{ x: p1x, y: p1y }, { x: tipX, y: tipY }, { x: p2x, y: p2y }] as XY[];
      return new Polyline(pts, {
        stroke, strokeWidth, fill: 'transparent',
        selectable: false, evented: false,
        strokeLineCap: 'round', strokeLineJoin: 'round',
        opacity,
        strokeUniform: true,
      });
    }
    if (type === 'triangle') {
      // Filled triangle
      return new Polygon(
        [{ x: tipX, y: tipY }, { x: p1x, y: p1y }, { x: p2x, y: p2y }] as XY[],
        { fill: stroke, stroke, strokeWidth: 1, selectable: false, evented: false, opacity, strokeUniform: true },
      );
    }
    if (type === 'triangle-outline') {
      // Outlined triangle (unfilled)
      return new Polygon(
        [{ x: tipX, y: tipY }, { x: p1x, y: p1y }, { x: p2x, y: p2y }] as XY[],
        { fill: 'transparent', stroke, strokeWidth, selectable: false, evented: false, opacity, strokeUniform: true },
      );
    }
    return null;
  }

  // ── P085: Pinch-to-zoom touch handlers ────────────────────────────────────
  private onTouchStart(e: TouchEvent): void {
    if (e.touches.length === 2) {
      // Prevent the browser from initiating its own pinch-to-zoom gesture on the
      // canvas element; our onTouchMove handler applies the zoom instead.
      e.preventDefault();
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      // Ignore a two-finger touch where fingers are essentially on the same spot
      // to prevent division by zero / explosive scale in onTouchMove.
      if (dist < 10) {
        this.touchStartDist = null;
        return;
      }
      this.touchStartDist = dist;
      this.touchStartZoom = this.canvas?.getZoom() ?? 1;
    } else {
      this.touchStartDist = null;
    }
  }

  /**
   * Compute the new zoom level from the change in finger separation and apply it
   * centred on the midpoint between the two touch points.
   */
  private onTouchMove(e: TouchEvent): void {
    if (e.touches.length !== 2 || this.touchStartDist === null) return;
    // Prevent the browser's native page-zoom and scroll during a pinch.
    e.preventDefault();
    const t0 = e.touches[0];
    const t1 = e.touches[1];
    const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    if (dist === 0) return;
    const scale = dist / this.touchStartDist;
    const zoom = Math.min(Math.max(this.touchStartZoom * scale, 0.1), 10);
    // Zoom centred on the midpoint between the two fingers.
    const midX = (t0.clientX + t1.clientX) / 2;
    const midY = (t0.clientY + t1.clientY) / 2;
    const rect = this.touchWrapEl?.getBoundingClientRect();
    const offsetX = midX - (rect?.left ?? 0);
    const offsetY = midY - (rect?.top ?? 0);
    this.canvas?.zoomToPoint(new Point(offsetX, offsetY), zoom);
    this.canvas?.requestRenderAll();
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
      e.preventDefault();
      if (e.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
    } else if ((e.ctrlKey || e.metaKey) && k === 'y') {
      e.preventDefault();
      this.redo();
    } else if (k === 'delete' || k === 'backspace') {
      const obj = this.canvas?.getActiveObject();
      if (obj) {
        this.pushHistory();
        this.canvas?.remove(obj);
        this.markDirty();
        this.onBroadcastDraw(true);
      }
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
    // Show/hide the properties panel based on the selected tool.
    if (t === 'eraser') {
      document.getElementById('props-panel')?.classList.add('hide');
    } else if (t === 'select') {
      // Keep current panel state; selection events will update it.
      if (!this.canvas?.getActiveObject()) {
        document.getElementById('props-panel')?.classList.add('hide');
      }
    } else {
      // Drawing tool selected – show panel with relevant sections for that tool.
      this.showPropertiesPanelForShape(t, false);
    }
  }

  updateStrokeColor(v: string): void {
    this.strokeColor = v;
    const dot = document.getElementById('strokeDot');
    if (dot) dot.style.background = v;
    const o = this.canvas?.getActiveObject();
    if (o) {
      o.set('stroke', v);
      this.canvas?.requestRenderAll();
      // BUG-010 – programmatic obj.set() doesn't fire object:modified, so we
      // must explicitly mark the canvas dirty and broadcast the change to peers.
      this.markDirty();
      this.onBroadcastDraw(true);
    }
  }

  updateFillColor(v: string): void {
    this.fillColor = v;
    const dot = document.getElementById('fillDot');
    if (dot) dot.style.background = v;
    const fillColorInput = document.getElementById('fillColorInput') as HTMLInputElement | null;
    if (fillColorInput) fillColorInput.value = v;
    const o = this.canvas?.getActiveObject();
    if (o) {
      const objFill = o.get('fill');
      const objHasFill = objFill !== 'transparent' && objFill != null;
      // Only apply when the object already has a fill or fill is explicitly enabled,
      // to avoid unintentionally adding fill to a transparent object.
      if (!objHasFill && !this.fillEnabled) return;
      // Re-apply pattern fill with the new color, or use plain fill
      const pattern = (o as FabricObject & { _fillPattern?: string })._fillPattern as 'filled' | 'striped' | 'crossed' | undefined;
      o.set('fill', this.createFill(pattern ?? 'filled', v));
      (o as FabricObject & { _fillColor?: string })._fillColor = v;
      this.canvas?.requestRenderAll();
      // BUG-010 – same fix: mark dirty and broadcast so peers see the change.
      this.markDirty();
      this.onBroadcastDraw(true);
    }
  }

  toggleFill(): void {
    this.fillEnabled = !this.fillEnabled;
    const btn = document.getElementById('tfillToggle');
    if (btn) {
      btn.textContent = this.fillEnabled ? '⊠' : '⊡';
      btn.setAttribute('aria-pressed', this.fillEnabled ? 'true' : 'false');
    }
    const o = this.canvas?.getActiveObject();
    if (o) {
      if (this.fillEnabled) {
        const fill = this.createFill(this.fillPattern, this.fillColor);
        o.set('fill', fill);
        const ext = o as FabricObject & { _fillPattern?: string; _fillColor?: string };
        ext._fillPattern = this.fillPattern;
        ext._fillColor = this.fillColor;
      } else {
        o.set('fill', 'transparent');
      }
      this.canvas?.requestRenderAll();
      this.markDirty();
      this.onBroadcastDraw(true);
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
    // Also apply to the currently selected object
    const o = this.canvas?.getActiveObject();
    if (o) {
      o.set('strokeWidth', w);
      // Re-apply dash array so the dash scale matches the new width
      if (this.strokeDashType !== 'solid') {
        o.set('strokeDashArray', this.getDashArray(this.strokeDashType, w));
      }
      this.canvas?.requestRenderAll();
      this.markDirty();
      this.onBroadcastDraw(true);
    }
  }

  setStrokeDash(type: 'solid' | 'dashed' | 'dotted'): void {
    this.strokeDashType = type;
    ['dash-solid', 'dash-dashed', 'dash-dotted'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('on');
      el.setAttribute('aria-pressed', 'false');
    });
    const el = document.getElementById(`dash-${type}`);
    el?.classList.add('on');
    el?.setAttribute('aria-pressed', 'true');
    const o = this.canvas?.getActiveObject();
    if (o) {
      const w = (o.get('strokeWidth') as number) || this.strokeWidth;
      const dashArray = this.getDashArray(type, w);
      o.set('strokeDashArray', dashArray ?? null);
      this.canvas?.requestRenderAll();
      this.markDirty();
      this.onBroadcastDraw(true);
    }
  }

  setBorderRadius(type: 'sharp' | 'rounded'): void {
    this.borderRadiusEnabled = type === 'rounded';
    ['br-sharp', 'br-rounded'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('on');
      el.setAttribute('aria-pressed', 'false');
    });
    const el = document.getElementById(`br-${type}`);
    el?.classList.add('on');
    el?.setAttribute('aria-pressed', 'true');
    const o = this.canvas?.getActiveObject();
    if (o && o.isType('rect')) {
      const r = type === 'rounded' ? 12 : 3; // 3 matches the creation default for sharp rects
      (o as Rect).set({ rx: r, ry: r });
      this.canvas?.requestRenderAll();
      this.markDirty();
      this.onBroadcastDraw(true);
    }
  }

  setOpacity(value: number): void {
    this.opacityValue = Math.min(100, Math.max(0, Math.round(value)));
    const slider = document.getElementById('opacitySlider') as HTMLInputElement | null;
    if (slider) slider.value = String(this.opacityValue);
    const label = document.getElementById('opacityValue');
    if (label) label.textContent = `${this.opacityValue}%`;
    const o = this.canvas?.getActiveObject();
    if (o) {
      o.set('opacity', this.opacityValue / 100);
      this.canvas?.requestRenderAll();
      this.markDirty();
      this.onBroadcastDraw(true);
    }
  }

  setSloppiness(type: 'architect' | 'artist' | 'cartoonist' | 'doodle'): void {
    this.sloppiness = type;
    ['sloppy-architect', 'sloppy-artist', 'sloppy-cartoonist', 'sloppy-doodle'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('on');
      el.setAttribute('aria-pressed', 'false');
    });
    const el = document.getElementById(`sloppy-${type}`);
    el?.classList.add('on');
    el?.setAttribute('aria-pressed', 'true');

    const o = this.canvas?.getActiveObject();
    if (!o) return;

    // Attempt to regenerate the shape from its stored original geometry.
    const replacement = this.tryConvertToSketch(o, type);
    if (replacement) {
      this.replaceActiveObject(o, replacement);
    } else {
      // Fallback for objects without stored geometry (e.g. pen paths, text)
      o.set(this.getSloppinessOptions(type));
    }
    this.canvas?.requestRenderAll();
    this.markDirty();
    this.onBroadcastDraw(true);
  }

  setFillPattern(type: 'filled' | 'striped' | 'crossed'): void {
    this.fillPattern = type;
    ['fp-filled', 'fp-striped', 'fp-crossed'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('on');
      el.setAttribute('aria-pressed', 'false');
    });
    const el = document.getElementById(`fp-${type}`);
    el?.classList.add('on');
    el?.setAttribute('aria-pressed', 'true');
    const o = this.canvas?.getActiveObject();
    if (o) {
      // Apply to the selected object if it currently has a fill (non-transparent),
      // or if the fill-enabled toggle is on for new shapes.
      const objFill = o.get('fill');
      const objHasFill = objFill !== 'transparent' && objFill != null;
      if (objHasFill || this.fillEnabled) {
        const fill = this.createFill(type, this.fillColor);
        o.set('fill', fill);
        const ext = o as FabricObject & { _fillPattern?: string; _fillColor?: string };
        ext._fillPattern = type;
        ext._fillColor = this.fillColor;
        this.canvas?.requestRenderAll();
        this.markDirty();
        this.onBroadcastDraw(true);
      }
    }
  }

  bringToFront(): void {
    const o = this.canvas?.getActiveObject();
    if (!o || !this.canvas) return;
    this.pushHistory();
    this.canvas.bringObjectToFront(o);
    this.canvas.requestRenderAll();
    this.markDirty();
    this.onBroadcastDraw(true);
  }

  bringForward(): void {
    const o = this.canvas?.getActiveObject();
    if (!o || !this.canvas) return;
    this.pushHistory();
    this.canvas.bringObjectForward(o);
    this.canvas.requestRenderAll();
    this.markDirty();
    this.onBroadcastDraw(true);
  }

  sendBackward(): void {
    const o = this.canvas?.getActiveObject();
    if (!o || !this.canvas) return;
    this.pushHistory();
    this.canvas.sendObjectBackwards(o);
    this.canvas.requestRenderAll();
    this.markDirty();
    this.onBroadcastDraw(true);
  }

  sendToBack(): void {
    const o = this.canvas?.getActiveObject();
    if (!o || !this.canvas) return;
    this.pushHistory();
    this.canvas.sendObjectToBack(o);
    this.canvas.requestRenderAll();
    this.markDirty();
    this.onBroadcastDraw(true);
  }

  setObjectLink(url: string): void {
    const o = this.canvas?.getActiveObject();
    if (!o) return;
    (o as FabricObject & { _link?: string })._link = url.trim() || undefined;
    this.markDirty();
    this.onBroadcastDraw(true);
    // Visual feedback: update the link input in the properties panel
    const input = document.getElementById('linkInput') as HTMLInputElement | null;
    if (input) input.value = url.trim();
  }

  setArrowHeads(
    start: 'none' | 'open' | 'triangle' | 'triangle-outline',
    end: 'none' | 'open' | 'triangle' | 'triangle-outline',
  ): void {
    this.arrowHeadStart = start;
    this.arrowHeadEnd = end;
    // Update UI button states for head-start and head-end
    (['none', 'open', 'triangle', 'triangle-outline'] as const).forEach((t) => {
      const idSuffix = t.replace(/-/g, '');
      const sEl = document.getElementById(`ahs-${idSuffix}`);
      const eEl = document.getElementById(`ahe-${idSuffix}`);
      sEl?.classList.toggle('on', t === start);
      sEl?.setAttribute('aria-pressed', t === start ? 'true' : 'false');
      eEl?.classList.toggle('on', t === end);
      eEl?.setAttribute('aria-pressed', t === end ? 'true' : 'false');
    });
    // Rebuild the currently selected arrow group with the new heads
    this.rebuildSelectedArrow({ headStart: start, headEnd: end });
  }

  /** Convenience: change only the start arrowhead while keeping the current end. */
  setArrowHeadStart(start: 'none' | 'open' | 'triangle' | 'triangle-outline'): void {
    this.setArrowHeads(start, this.arrowHeadEnd);
  }

  /** Convenience: change only the end arrowhead while keeping the current start. */
  setArrowHeadEnd(end: 'none' | 'open' | 'triangle' | 'triangle-outline'): void {
    this.setArrowHeads(this.arrowHeadStart, end);
  }

  setArrowType(type: 'sharp' | 'curved' | 'elbow'): void {
    this.arrowType = type;
    (['sharp', 'curved', 'elbow'] as const).forEach((t) => {
      const el = document.getElementById(`at-${t}`);
      el?.classList.toggle('on', t === type);
      el?.setAttribute('aria-pressed', t === type ? 'true' : 'false');
    });
    // Rebuild the currently selected arrow group with the new type
    this.rebuildSelectedArrow({ arrowType: type });
  }

  /**
   * If an arrow Group is currently selected, rebuild it with the given overrides.
   * Uses endpoint coordinates stored in `_x1/_y1/_x2/_y2` on the group.
   * No-op when no object is selected or the selected object is not an arrow group.
   */
  private rebuildSelectedArrow(overrides: {
    headStart?: 'none' | 'open' | 'triangle' | 'triangle-outline';
    headEnd?: 'none' | 'open' | 'triangle' | 'triangle-outline';
    arrowType?: 'sharp' | 'curved' | 'elbow';
  }): void {
    const o = this.canvas?.getActiveObject();
    if (!o || !this.canvas) return;
    const ag = o as ArrowGroupExt;
    if (!ag._isArrow) return; // no-op: not an arrow group

    const x1 = ag._x1 ?? 0, y1 = ag._y1 ?? 0, x2 = ag._x2 ?? 0, y2 = ag._y2 ?? 0;
    const headStart = (overrides.headStart ?? ag._arrowHeadStart ?? this.arrowHeadStart) as 'none' | 'open' | 'triangle' | 'triangle-outline';
    const headEnd   = (overrides.headEnd   ?? ag._arrowHeadEnd   ?? this.arrowHeadEnd) as 'none' | 'open' | 'triangle' | 'triangle-outline';
    const arrowType = (overrides.arrowType ?? ag._arrowType ?? this.arrowType) as 'sharp' | 'curved' | 'elbow';

    // Read stroke/width/dash/opacity from the group's first child
    const children = (o as Group).getObjects?.() ?? [];
    const firstChild = children[0] as FabricObject | undefined;
    const stroke = (firstChild?.get('stroke') as string | undefined) ?? this.strokeColor;
    const strokeWidth = (firstChild?.get('strokeWidth') as number | undefined) ?? this.strokeWidth;
    const strokeDashArray = (firstChild?.get('strokeDashArray') as number[] | undefined) ?? undefined;
    const opacity = (o.get('opacity') as number | undefined) ?? 1;

    const tempLine = new Line([x1, y1, x2, y2], {
      stroke, strokeWidth, strokeDashArray: strokeDashArray ?? undefined,
      opacity, selectable: false, evented: false,
    });
    // Copy the original group's ID so the merge engine keeps tracking the same object
    (tempLine as FabricObject & { _id?: string })._id =
      (o as FabricObject & { _id?: string })._id;

    this.canvas.remove(o);
    this.buildArrowGroup(tempLine, headStart, headEnd, arrowType);
    this.markDirty();
    this.onBroadcastDraw(true);
  }

  zoomIn(): void { this.canvas?.setZoom(Math.min(this.canvas.getZoom() * 1.2, 10)); }
  zoomOut(): void { this.canvas?.setZoom(Math.max(this.canvas.getZoom() / 1.2, 0.1)); }
  resetZoom(): void {
    if (!this.canvas) return;
    this.canvas.setZoom(1);
    this.canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    this.canvas.requestRenderAll(); // P022: batch via rAF
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  // ── Sloppiness / sketch-path helpers ────────────────────────────────────────

  /** Deterministic pseudo-random in range [-1, 1], seeded by id + index.
   * Uses a variation of the "sin hash" technique: multiply the argument by a
   * large constant (9301.7) to break integer periodicity, then use the
   * fractional part of sin(…)·43758.5453 (a common LCG-like scrambler).
   */
  private static sketchRand(seed: number, i: number): number {
    const x = Math.sin(Math.abs(seed) + i * 9301.7) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
  }

  /** Convert a string _id to a stable numeric seed. */
  private static seedFromId(id: string): number {
    let h = 2166136261;
    for (let c = 0; c < id.length; c++) {
      h ^= id.charCodeAt(c);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0; // unsigned 32-bit
  }

  /** Maximum jitter in CSS pixels for the given sloppiness level. */
  private static sloppinessAmplitude(
    sloppiness: 'architect' | 'artist' | 'cartoonist' | 'doodle',
    strokeWidth: number,
  ): number {
    if (sloppiness === 'architect') return 0;
    const base = sloppiness === 'cartoonist' ? 7 : sloppiness === 'doodle' ? 5 : 3.5;
    return Math.max(base, strokeWidth * 1.2);
  }

  /**
   * Geometry descriptor used to regenerate a shape at a different sloppiness level.
   * Stored as JSON in the custom property `_origGeom`.
   */
  private static origGeomFromObj(obj: FabricObject): string | null {
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

  /**
   * Generates a hand-drawn–style SVG path for the given original geometry.
   * Wobble is deterministic (seed) so the shape looks the same every render.
   */
  private makeSketchyPath(
    geom: Record<string, unknown>,
    amplitude: number,
    seed: number,
  ): string {
    const j = (i: number) => CanvasEngine.sketchRand(seed, i) * amplitude;
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
      // Four corners, each slightly offset
      const c: [number, number][] = [
        [l + j(0),     to + j(1)],
        [l + w + j(2), to + j(3)],
        [l + w + j(4), to + h + j(5)],
        [l + j(6),     to + h + j(7)],
      ];
      const cp = (a: [number, number], b: [number, number], i: number) =>
        `${((a[0] + b[0]) / 2 + j(i)).toFixed(1)} ${((a[1] + b[1]) / 2 + j(i + 1)).toFixed(1)}`;
      return `M ${c[0][0].toFixed(1)} ${c[0][1].toFixed(1)} `
           + `Q ${cp(c[0], c[1], 8)} ${c[1][0].toFixed(1)} ${c[1][1].toFixed(1)} `
           + `Q ${cp(c[1], c[2], 10)} ${c[2][0].toFixed(1)} ${c[2][1].toFixed(1)} `
           + `Q ${cp(c[2], c[3], 12)} ${c[3][0].toFixed(1)} ${c[3][1].toFixed(1)} `
           + `Q ${cp(c[3], c[0], 14)} ${c[0][0].toFixed(1)} ${c[0][1].toFixed(1)} Z`;
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

  /**
   * Converts a Rect/Ellipse/Line to a sketch-like Path (artist/cartoonist/doodle),
   * or restores it to its native Fabric shape (architect).
   * Returns the replacement object, or `null` if conversion is not applicable
   * (e.g. arrow groups, text, pen paths without _origGeom).
   * The returned object copies the `_id` of the original so the merge engine
   * continues to track it as the same object.
   */
  private tryConvertToSketch(
    obj: FabricObject,
    sloppiness: 'architect' | 'artist' | 'cartoonist' | 'doodle',
  ): FabricObject | null {
    if (!this.canvas) return null;

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
    if (!geomStr) geomStr = CanvasEngine.origGeomFromObj(obj);
    if (!geomStr) return null; // pen paths etc – nothing to do

    let geom: Record<string, unknown>;
    try { geom = JSON.parse(geomStr) as Record<string, unknown>; }
    catch { return null; }

    const seed = CanvasEngine.seedFromId(oa._id ?? '');
    const sw   = (obj.get('strokeWidth') as number) ?? 1;
    const stroke = obj.get('stroke') as string ?? this.strokeColor;
    const opacity       = (obj.get('opacity') as number) ?? 1;
    const strokeDashArr = obj.get('strokeDashArray') as number[] | undefined;

    // Resolve fill: if the current fill is a Pattern, recreate it from stored metadata
    // to avoid casting a Pattern object to string (which would yield "[object Object]").
    // Use the object's stored _fillColor (not the engine's current fillColor) so that
    // switching sloppiness does not silently change the object's fill appearance.
    const rawFill = obj.get('fill');
    const fillIsPattern = rawFill instanceof Pattern ||
      (rawFill !== null && typeof rawFill === 'object');
    const objFillColor = (oa as FabricObject & { _fillColor?: string })._fillColor ?? this.fillColor;
    const fillArg: string | Pattern = fillIsPattern
      ? this.createFill(
          (oa._fillPattern as 'filled' | 'striped' | 'crossed' | undefined) ?? 'filled',
          objFillColor,
        )
      : (rawFill as string) ?? 'transparent';

    // Capture source center BEFORE any canvas mutation so we can reposition the
    // replacement at exactly the same visual location.
    const srcCenter = obj.getCenterPoint();

    const copyCustom = (dst: FabricObject) => {
      const d = dst as FabricObject & Ext & { _fillColor?: string };
      d._id          = oa._id;
      d._sloppiness  = sloppiness;
      d._origGeom    = geomStr as string;
      d._fillPattern = oa._fillPattern;
      d._fillColor   = objFillColor;
      d._link        = oa._link;
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
      const archOpts = this.getSloppinessOptions('architect');
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
    const amp = CanvasEngine.sloppinessAmplitude(sloppiness, sw);
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

  /**
   * Replace the active canvas object with `replacement`, preserving selection.
   * No-op if `canvas` is null.
   */
  private replaceActiveObject(old: FabricObject, replacement: FabricObject): void {
    if (!this.canvas) return;
    this.canvas.remove(old);
    this.canvas.add(replacement);
    this.canvas.setActiveObject(replacement);
  }

  /**
   * Stamp `_origGeom` and `_sloppiness` onto a freshly-drawn object so the
   * shape can be regenerated later when the sloppiness setting changes.
   * Called for every shape type in onMouseUp.
   */
  private stampOrigGeomAndSloppiness(obj: FabricObject): void {
    const ext = obj as FabricObject & { _sloppiness?: string; _origGeom?: string };
    if (!ext._origGeom) {
      const g = CanvasEngine.origGeomFromObj(obj);
      if (g) ext._origGeom = g;
    }
    ext._sloppiness = this.sloppiness;
  }

  private getDashArray(type: 'solid' | 'dashed' | 'dotted', width: number): number[] | undefined {
    if (type === 'dashed') return [Math.max(6, width * 3), Math.max(3, width * 1.5)];
    if (type === 'dotted') return [Math.max(1, width), Math.max(3, width * 2)];
    return undefined;
  }

  /** Set strokeUniform=true on every canvas object so stroke width stays constant on resize. */
  private applyStrokeUniformToAll(): void {
    this.canvas?.getObjects().forEach((obj) => {
      if (!obj.strokeUniform) obj.set('strokeUniform', true);
    });
  }

  /** Reverse of getDashArray: infer the dash type from a stored strokeDashArray. */
  private getDashTypeFromArray(da: number[] | null | undefined): 'solid' | 'dashed' | 'dotted' {
    if (!da || da.length === 0) return 'solid';
    // dotted: first value (dot) ≤ second value (gap), dashed: first > second
    return da[0] <= (da[1] ?? 0) ? 'dotted' : 'dashed';
  }

  private getSloppinessOptions(type: 'architect' | 'artist' | 'cartoonist' | 'doodle'): { strokeLineCap: 'butt' | 'round'; strokeLineJoin: 'miter' | 'round' } {
    if (type === 'architect') return { strokeLineCap: 'butt', strokeLineJoin: 'miter' };
    // artist, cartoonist, and doodle all use rounded joins
    return { strokeLineCap: 'round', strokeLineJoin: 'round' };
  }

  private createFill(type: 'filled' | 'striped' | 'crossed', color: string): string | Pattern {
    if (type === 'filled') return color;
    // Create a small canvas as the pattern tile
    if (typeof document === 'undefined') return color; // SSR guard
    const size = 10;
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = size;
    patternCanvas.height = size;
    const ctx = patternCanvas.getContext('2d');
    if (!ctx) return color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    if (type === 'striped') {
      ctx.beginPath(); ctx.moveTo(0, size); ctx.lineTo(size, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-size, size); ctx.lineTo(0, 2 * size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(size, 2 * size); ctx.lineTo(2 * size, size); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(0, size); ctx.lineTo(size, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(size, size); ctx.stroke();
    }
    return new Pattern({ source: patternCanvas, repeat: 'repeat' });
  }

  /** Snap a line's endpoints to nearby shape centers and store attachment IDs. */
  private snapLineAttachment(line: FabricObject): void {
    if (!this.canvas) return;
    if (!(line instanceof Line)) return;
    const SNAP_RADIUS = 30;
    const objs = this.canvas.getObjects().filter((o) => o !== line && !(o instanceof Line));
    const typedLine = line as Line & { _attachedFrom?: string; _attachedTo?: string };
    const { x1 = 0, y1 = 0, x2 = 0, y2 = 0 } = typedLine as Line & { x1?: number; y1?: number; x2?: number; y2?: number };

    for (const obj of objs) {
      const center = obj.getCenterPoint();
      const id = (obj as FabricObject & { _id?: string })._id;
      if (!id) continue;
      if (Math.hypot(center.x - x1, center.y - y1) < SNAP_RADIUS) {
        typedLine._attachedFrom = id;
        typedLine.set({ x1: center.x, y1: center.y });
      }
      if (Math.hypot(center.x - x2, center.y - y2) < SNAP_RADIUS) {
        typedLine._attachedTo = id;
        typedLine.set({ x2: center.x, y2: center.y });
      }
    }
  }

  /** When a shape is moved, update the endpoints of any Line attached to it. */
  private updateAttachedLines(movedObj: FabricObject): void {
    if (!this.canvas) return;
    const id = (movedObj as FabricObject & { _id?: string })._id;
    if (!id) return;
    const center = movedObj.getCenterPoint();
    let changed = false;

    for (const obj of this.canvas.getObjects()) {
      if (!(obj instanceof Line)) continue;
      const attached = obj as Line & { _attachedFrom?: string; _attachedTo?: string };
      if (attached._attachedFrom === id) {
        attached.set({ x1: center.x, y1: center.y });
        attached.setCoords();
        changed = true;
      }
      if (attached._attachedTo === id) {
        attached.set({ x2: center.x, y2: center.y });
        attached.setCoords();
        changed = true;
      }
    }
    if (changed) {
      this.canvas.requestRenderAll();
      this.markDirty();
      this.onBroadcastDraw(false); // throttled — endpoint moves are frequent
    }
  }

  /** Sync the toolbar and properties panel UI to the currently selected object. */
  private syncPropertiesPanelToSelection(): void {
    const o = this.canvas?.getActiveObject();
    const panel = document.getElementById('props-panel');
    if (!panel) return;

    if (!o) {
      // Nothing selected: if on the select tool, hide panel; drawing tools keep their own view.
      if (this.currentTool === 'select') panel.classList.add('hide');
      return;
    }

    // Determine shape type from the selected object and show matching sections.
    const shapeType = this.getObjectShapeType(o);
    this.showPropertiesPanelForShape(shapeType, true);

    // Sync opacity slider
    const opacity = ((o.get('opacity') as number) ?? 1) * 100;
    const slider = document.getElementById('opacitySlider') as HTMLInputElement | null;
    if (slider) slider.value = String(Math.round(opacity));
    const opLabel = document.getElementById('opacityValue');
    if (opLabel) opLabel.textContent = `${Math.round(opacity)}%`;

    // Sync stroke color dot AND the underlying color input value
    const stroke = (o.get('stroke') as string) ?? this.strokeColor;
    this.strokeColor = stroke; // keep engine state in sync
    const strokeDot = document.getElementById('strokeDot');
    if (strokeDot) strokeDot.style.background = stroke;
    const strokeColorInput = document.getElementById('strokeColorInput') as HTMLInputElement | null;
    if (strokeColorInput) strokeColorInput.value = stroke;

    // Sync stroke width engine state + buttons
    const sw = (o.get('strokeWidth') as number) ?? 1.5;
    this.strokeWidth = sw; // keep engine state in sync
    ['sz1', 'sz3', 'sz5'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('on');
      el.setAttribute('aria-pressed', 'false');
    });
    const swId = sw <= 2 ? 'sz1' : sw <= 4 ? 'sz3' : 'sz5';
    const swEl = document.getElementById(swId);
    swEl?.classList.add('on');
    swEl?.setAttribute('aria-pressed', 'true');

    // Sync dash type buttons AND engine state so setStrokeWidth() rescales dashes correctly
    const da = o.get('strokeDashArray') as number[] | null;
    const dashType = this.getDashTypeFromArray(da);
    this.strokeDashType = dashType; // keep engine state in sync
    ['dash-solid', 'dash-dashed', 'dash-dotted'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('on');
      el.setAttribute('aria-pressed', 'false');
    });
    document.getElementById(`dash-${dashType}`)?.classList.add('on');
    document.getElementById(`dash-${dashType}`)?.setAttribute('aria-pressed', 'true');

    // Sync link input
    const link = (o as FabricObject & { _link?: string })._link ?? '';
    const linkInput = document.getElementById('linkInput') as HTMLInputElement | null;
    if (linkInput) linkInput.value = link;

    // Sync fill-enabled toggle from the object's actual fill state
    const fillVal2 = o.get('fill');
    const objHasFill = fillVal2 !== 'transparent' && fillVal2 != null;
    this.fillEnabled = !!objHasFill;
    const fillToggle = document.getElementById('tfillToggle');
    if (fillToggle) {
      fillToggle.textContent = this.fillEnabled ? '⊠' : '⊡';
      fillToggle.setAttribute('aria-pressed', this.fillEnabled ? 'true' : 'false');
    }

    // Sync fill dot and fill color input — use the object's stored _fillColor for correct
    // representation even when the fill is a Pattern.
    const objFillColorStored = (o as FabricObject & { _fillColor?: string })._fillColor ?? this.fillColor;
    const fillDot = document.getElementById('fillDot');
    if (fillDot) {
      if (typeof fillVal2 === 'string' && fillVal2 !== 'transparent') {
        fillDot.style.background = fillVal2;
      } else if (fillVal2 instanceof Pattern || (fillVal2 !== null && typeof fillVal2 === 'object')) {
        fillDot.style.background = objFillColorStored;
      } else {
        // transparent or null fill
        fillDot.style.background = 'transparent';
      }
    }
    const fillColorInput = document.getElementById('fillColorInput') as HTMLInputElement | null;
    if (fillColorInput) fillColorInput.value = objFillColorStored;
    this.fillColor = objFillColorStored; // keep engine state in sync

    // Sync fill-pattern buttons from the object's stored _fillPattern
    const objFillPattern = ((o as FabricObject & { _fillPattern?: string })._fillPattern
      ?? 'filled') as 'filled' | 'striped' | 'crossed';
    ['fp-filled', 'fp-striped', 'fp-crossed'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('on');
      el.setAttribute('aria-pressed', 'false');
    });
    const fpActive = `fp-${objFillPattern}`;
    document.getElementById(fpActive)?.classList.add('on');
    document.getElementById(fpActive)?.setAttribute('aria-pressed', 'true');

    // Sync sloppiness buttons from the object's stored sloppiness
    const objSloppiness = ((o as FabricObject & { _sloppiness?: string })._sloppiness
      ?? 'architect') as 'architect' | 'artist' | 'cartoonist' | 'doodle';
    ['sloppy-architect', 'sloppy-artist', 'sloppy-cartoonist', 'sloppy-doodle'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('on');
      el.setAttribute('aria-pressed', 'false');
    });
    document.getElementById(`sloppy-${objSloppiness}`)?.classList.add('on');
    document.getElementById(`sloppy-${objSloppiness}`)?.setAttribute('aria-pressed', 'true');

    // Sync arrow type and arrowhead buttons from the selected arrow group
    const oa = o as ArrowGroupExt;
    if (oa._isArrow) {
      const at = (oa._arrowType ?? 'sharp') as string;
      (['sharp', 'curved', 'elbow'] as const).forEach((t) => {
        document.getElementById(`at-${t}`)?.classList.toggle('on', t === at);
        document.getElementById(`at-${t}`)?.setAttribute('aria-pressed', t === at ? 'true' : 'false');
      });
      const ahs = (oa._arrowHeadStart ?? 'none') as string;
      const ahe = (oa._arrowHeadEnd ?? 'open') as string;
      (['none', 'open', 'triangle', 'triangle-outline'] as const).forEach((t) => {
        const suffix = t.replace(/-/g, '');
        document.getElementById(`ahs-${suffix}`)?.classList.toggle('on', t === ahs);
        document.getElementById(`ahs-${suffix}`)?.setAttribute('aria-pressed', t === ahs ? 'true' : 'false');
        document.getElementById(`ahe-${suffix}`)?.classList.toggle('on', t === ahe);
        document.getElementById(`ahe-${suffix}`)?.setAttribute('aria-pressed', t === ahe ? 'true' : 'false');
      });
    }
  }

  /**
   * Returns a canonical shape-type string for a Fabric object.
   * This is used to determine which properties-panel sections to show.
   */
  private getObjectShapeType(o: FabricObject): string {
    const oa = o as FabricObject & { _isArrow?: boolean; type?: string };
    if (oa._isArrow) return 'arrow';
    const t = (oa.type as string | undefined) ?? '';
    if (t === 'rect') return 'rect';
    if (t === 'ellipse') return 'ellipse';
    if (t === 'line') return 'line';
    if (t === 'path' || t === 'polyline') return 'pen';
    if (t === 'i-text' || t === 'text') return 'text';
    return 'unknown';
  }

  /**
   * Show the properties panel and toggle the visibility of each section
   * based on the shape type.  Called both when a drawing tool is activated
   * (isObjectSelected=false) and when a canvas object is selected (=true).
   */
  showPropertiesPanelForShape(shapeType: string, isObjectSelected: boolean): void {
    const panel = document.getElementById('props-panel');
    if (!panel) return;
    panel.classList.remove('hide');

    const show = (id: string) => document.getElementById(id)?.classList.remove('hide');
    const hide = (id: string) => document.getElementById(id)?.classList.add('hide');

    const isRect    = shapeType === 'rect';
    const isEllipse = shapeType === 'ellipse';
    const isArrow   = shapeType === 'arrow';
    const isPen     = shapeType === 'pen';
    const isText    = shapeType === 'text';
    const hasFill   = isRect || isEllipse;
    const hasStroke = !isText;

    // Colors: always visible
    show('pp-color-section');

    // Stroke width / dash: all shapes with a stroke (not text)
    hasStroke ? show('pp-stroke-width-section') : hide('pp-stroke-width-section');
    hasStroke ? show('pp-stroke-dash-section')  : hide('pp-stroke-dash-section');

    // Fill: rect and ellipse only
    hasFill ? show('pp-fill-pattern-section') : hide('pp-fill-pattern-section');

    // Border radius: rect only
    isRect ? show('pp-border-radius-section') : hide('pp-border-radius-section');

    // Sloppiness: all shapes except text (and eraser, select)
    const hasSloppiness = !isText && shapeType !== 'select' && shapeType !== 'eraser';
    hasSloppiness ? show('pp-sloppiness-section') : hide('pp-sloppiness-section');

    // Arrow controls: arrow only
    isArrow ? show('pp-arrow-type-section')  : hide('pp-arrow-type-section');
    isArrow ? show('pp-arrow-heads-section') : hide('pp-arrow-heads-section');

    // Opacity: always visible
    show('pp-opacity-section');

    // Layer + link: only when an existing object is selected
    isObjectSelected ? show('pp-layer-section') : hide('pp-layer-section');
    isObjectSelected ? show('pp-link-section')  : hide('pp-link-section');
  }
}
