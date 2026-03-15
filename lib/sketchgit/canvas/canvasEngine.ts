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
  Canvas, Path, Polyline, Rect, Ellipse, Line, IText, Polygon, Group, FabricImage, FabricObject, Point, Pattern, Control,
} from 'fabric';
import type { TPointerEventInfo, XY, TMat2D } from 'fabric';

import { ensureObjId } from '../git/objectIdTracker';
import { logger } from '../logger';
import { renderMermaidToDataUrl } from './mermaidRenderer';

/** Shared type for arrow Group objects carrying endpoint + style metadata. */
type ArrowGroupExt = FabricObject & {
  _isArrow?: boolean;
  _x1?: number; _y1?: number; _x2?: number; _y2?: number;
  _arrowType?: string;
  _arrowHeadStart?: string;
  _arrowHeadEnd?: string;
  /** Canvas center of the group the last time it was built/rebuilt.
   *  Used to compute how far the group has moved when object:modified fires,
   *  so that reSnapOnModified can derive the new absolute endpoint positions. */
  _gcx?: number; _gcy?: number;
};

/** Attachment fields (shape IDs + border-anchor offsets) shared by lines and arrow groups. */
type AttachmentProps = {
  _attachedFrom?: string;
  _attachedTo?: string;
  _attachedFromAnchorX?: number;
  _attachedFromAnchorY?: number;
  _attachedToAnchorX?: number;
  _attachedToAnchorY?: number;
};

/** Arrow group with full attachment metadata. */
type AnchoredArrowGroup = ArrowGroupExt & AttachmentProps;

/** Fabric Line with full attachment metadata. */
type AnchoredLine = Line & AttachmentProps;

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
  /** Current canvas theme – used for mermaid diagram rendering. */
  canvasTheme: 'dark' | 'default' = 'dark';

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

  // ── Mermaid: pending placement position when creating a new mermaid object ─
  private pendingMermaidPos: { x: number; y: number } | null = null;

  // ── P085: Pinch-to-zoom touch state ──────────────────────────────────────
  private touchStartDist: number | null = null;
  private touchStartZoom = 1;
  private touchWrapEl: HTMLElement | null = null;
  private boundTouchStart: ((e: TouchEvent) => void) | null = null;
  private boundTouchMove: ((e: TouchEvent) => void) | null = null;

  // ── Connector-follow throttle (rAF-based) ─────────────────────────────────
  /** rAF id for the pending attachment update, or null if none scheduled. */
  private _attachmentRafId: number | null = null;
  /** The most-recently-moved shape waiting for a connector-follow update. */
  private _attachmentRafTarget: FabricObject | null = null;

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
    for (const p of ['_link', '_arrowHeadStart', '_arrowHeadEnd', '_arrowType', '_fillPattern', '_sloppiness', '_origGeom', '_attachedFrom', '_attachedTo', '_attachedFromAnchorX', '_attachedFromAnchorY', '_attachedToAnchorX', '_attachedToAnchorY', '_x1', '_y1', '_x2', '_y2', '_fillColor', '_gcx', '_gcy', '_isMermaid', '_mermaidCode']) {
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
    this.canvas.on('object:modified', (e: { target?: FabricObject }) => {
      this.pushHistory();
      this.markDirty();
      // Re-run snap so an already-placed line or arrow group can be attached
      // to a shape by moving it next to one (or detached by moving it away).
      if (e.target) this.reSnapOnModified(e.target);
      this.onBroadcastDraw(true);
    });
    this.canvas.on('object:added', (e: { target?: FabricObject }) => { if (e.target) ensureObjId(e.target); });
    this.canvas.on('mouse:wheel', (e: TPointerEventInfo<WheelEvent>) => this.onWheel(e));

    this.canvas.on('mouse:dblclick', (e: { target?: FabricObject }) => {
      const target = e.target;
      if (!target) return;
      // Mermaid: double-click focuses the code editor in the properties panel.
      const mermaidTarget = target as FabricObject & { _isMermaid?: boolean; _mermaidCode?: string };
      if (mermaidTarget._isMermaid) {
        const ta = document.getElementById('mermaidCodeInput') as HTMLTextAreaElement | null;
        if (ta) {
          ta.value = mermaidTarget._mermaidCode ?? '';
          ta.focus();
          ta.select();
        }
        return;
      }
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
    // Calls are throttled to one per animation frame to avoid rebuilding arrow groups
    // and sketch-path connectors on every mousemove event.
    this.canvas.on('object:moving', (e: { target?: FabricObject }) => {
      if (e.target) this.scheduleAttachmentUpdate(e.target);
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
    // Cancel any pending connector-follow rAF to avoid stale callbacks after destroy.
    if (this._attachmentRafId !== null) {
      cancelAnimationFrame(this._attachmentRafId);
      this._attachmentRafId = null;
      this._attachmentRafTarget = null;
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
      '_attachedFromAnchorX', '_attachedFromAnchorY', '_attachedToAnchorX', '_attachedToAnchorY',
      '_x1', '_y1', '_x2', '_y2',
      '_isMermaid', '_mermaidCode',
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
      this.postLoadApplyEndpointControls();
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
    // If the user clicked on an existing object, let Fabric handle it (move/resize/select)
    // instead of starting a new shape draw.  The eraser is excluded because its
    // whole purpose is to act on existing objects.
    if (e.target && this.currentTool !== 'eraser') return;
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

    if (this.currentTool === 'mermaid') {
      // Record placement position and show the mermaid code editor in the
      // properties panel so the user can enter diagram code before rendering.
      this.pendingMermaidPos = { x: p.x, y: p.y };
      this.isDrawing = false;
      // Focus the mermaid code textarea so the user can immediately start typing
      const ta = document.getElementById('mermaidCodeInput') as HTMLTextAreaElement | null;
      if (ta) ta.focus();
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
            // Snap arrow endpoints to nearby shapes before building the group so
            // that the resulting group carries _attachedFrom/_attachedTo IDs.
            this.snapLineAttachment(this.activeObj);
            this.buildArrowGroup(this.activeObj as Line, headStart, headEnd, arrowType);
          } else {
            // For rect / ellipse / line: snap endpoints first (on the Line object, before
            // conversion) so snapped coordinates are baked into the sketch path geometry.
            this.snapLineAttachment(this.activeObj);
            // Then stamp origGeom (captures the snapped endpoints for re-conversion).
            this.stampOrigGeomAndSloppiness(this.activeObj);

            if (this.sloppiness !== 'architect') {
              const sketch = this.tryConvertToSketch(this.activeObj, this.sloppiness);
              if (sketch) {
                this.canvas?.remove(this.activeObj);
                this.activeObj = sketch;
                this.canvas?.add(this.activeObj);
              }
            }
            // Apply endpoint controls for the line tool (architect = Line object,
            // artist/cartoonist = sketch Path with _origGeom).
            if (this.currentTool === 'line') {
              if (this.activeObj instanceof Line) {
                this.applyLineEndpointControls(this.activeObj as Line);
              } else {
                this.applySketchLineEndpointControls(this.activeObj);
              }
            }
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
    /** When false the new group is NOT set as the active canvas selection.
     *  Pass false from rebuildArrowForMove to avoid calling setActiveObject
     *  mid-drag, which would disrupt Fabric.js's drag-tracking state and
     *  prevent further mouse-move events from reaching the object that the
     *  user is actually dragging. */
    selectAfter = true,
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
        _x1: x1, _y1: y1, _x2: x2, _y2: y2,
        // Transfer attachment IDs and anchor offsets from the source line so the group
        // follows connected shapes when they move (set by snapLineAttachment).
        _attachedFrom: (line as Line & { _attachedFrom?: string })._attachedFrom,
        _attachedTo: (line as Line & { _attachedTo?: string })._attachedTo,
        _attachedFromAnchorX: (line as Line & { _attachedFromAnchorX?: number })._attachedFromAnchorX,
        _attachedFromAnchorY: (line as Line & { _attachedFromAnchorY?: number })._attachedFromAnchorY,
        _attachedToAnchorX: (line as Line & { _attachedToAnchorX?: number })._attachedToAnchorX,
        _attachedToAnchorY: (line as Line & { _attachedToAnchorY?: number })._attachedToAnchorY,
      },
    );
    // Carry the source line's _id (if any) to the group.  When buildArrowGroup is
    // called via rebuildArrowForMove, tempLine._id was pre-set to the original group's
    // _id, so the rebuilt group keeps a stable identity across rebuilds — important for
    // diff/merge tracking and the reSnapOnModified re-selection logic.
    const srcLineId = (line as Line & { _id?: string })._id;
    if (srcLineId) (grp as FabricObject & { _id?: string })._id = srcLineId;
    ensureObjId(grp);
    this.canvas.add(grp);
    // Record the group center so reSnapOnModified can compute the movement delta
    // if the user later drags the arrow to a new position.
    const grpCenter = grp.getCenterPoint();
    (grp as AnchoredArrowGroup)._gcx = grpCenter.x;
    (grp as AnchoredArrowGroup)._gcy = grpCenter.y;
    this.applyArrowEndpointControls(grp);
    if (selectAfter) this.canvas.setActiveObject(grp);
    // Do NOT clear this.activeObj here — when buildArrowGroup is called mid-drag
    // (via rebuildArrowForMove → object:moving) this.activeObj may be a Line that
    // the user is currently drawing.  Nulling it prematurely would cause
    // subsequent onMouseMove/onMouseUp calls to skip their early-exit checks,
    // silently discarding the in-progress arrow.  onMouseUp already sets
    // this.activeObj = null after buildArrowGroup returns (line in onMouseUp).
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
    else if (k === 'm') this.setTool('mermaid');
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

  // ── Mermaid diagram tool ───────────────────────────────────────────────────

  /**
   * Create a new mermaid diagram object on the canvas at the given position.
   * Renders the provided mermaid code to an SVG, creates a FabricImage from it,
   * and adds it to the canvas with the stored `_mermaidCode` for later editing.
   */
  async addMermaidObject(left: number, top: number, code: string): Promise<void> {
    const dataUrl = await renderMermaidToDataUrl(code, this.canvasTheme);
    if (!dataUrl) {
      logger.warn({}, 'addMermaidObject: mermaid render failed');
      return;
    }
    const img = await FabricImage.fromURL(dataUrl);
    ensureObjId(img);
    Object.assign(img, { _isMermaid: true, _mermaidCode: code });
    img.set({
      left,
      top,
      stroke: this.strokeColor,
      strokeWidth: this.strokeWidth,
      strokeDashArray: this.getDashArray(this.strokeDashType, this.strokeWidth),
      opacity: this.opacityValue / 100,
      selectable: true,
      evented: true,
      strokeUniform: true,
    });
    this.pendingMermaidPos = null;
    this.canvas?.add(img);
    this.canvas?.setActiveObject(img);
    this.canvas?.requestRenderAll();
    this.markDirty();
    this.onBroadcastDraw(true);
  }

  /**
   * Re-render the mermaid code for the selected mermaid object (or create a
   * new one at the pending placement position set by the last canvas click).
   * Called when the user submits code via the properties panel textarea.
   */
  updateMermaidCode(code: string): void {
    const o = this.canvas?.getActiveObject();
    const mermaidObj = o as FabricObject & { _isMermaid?: boolean; _mermaidCode?: string };

    const trimmedCode = code.trim();
    if (!trimmedCode) return;

    if (o && mermaidObj._isMermaid) {
      // Re-render for an already-placed mermaid image.
      // Update _mermaidCode only after setSrc succeeds so the stored code stays
      // in sync with what is visually displayed on the canvas.
      void renderMermaidToDataUrl(trimmedCode, this.canvasTheme).then((dataUrl) => {
        if (!dataUrl) return;
        void (o as FabricImage).setSrc(dataUrl).then(() => {
          mermaidObj._mermaidCode = trimmedCode;
          this.canvas?.requestRenderAll();
          this.markDirty();
          this.onBroadcastDraw(true);
        }).catch((err: unknown) => {
          logger.warn({ err }, 'updateMermaidCode: setSrc failed');
        });
      });
    } else if (this.pendingMermaidPos) {
      // Create a new mermaid object at the stored click position
      void this.addMermaidObject(this.pendingMermaidPos.x, this.pendingMermaidPos.y, trimmedCode);
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
    if (!o) return;
    const r = type === 'rounded' ? 12 : 3; // 3 matches the creation default for sharp rects
    if (o.isType('rect')) {
      (o as Rect).set({ rx: r, ry: r });
      this.canvas?.requestRenderAll();
      this.markDirty();
      this.onBroadcastDraw(true);
    } else {
      // For sketch paths (artist/cartoonist/doodle) representing a rect: update
      // the stored original geometry and regenerate the sketch path.
      const oe = o as FabricObject & { _origGeom?: string; _sloppiness?: string };
      if (!oe._origGeom) return;
      let geom: Record<string, unknown>;
      try { geom = JSON.parse(oe._origGeom) as Record<string, unknown>; }
      catch { return; }
      if (geom.type !== 'rect') return;
      geom.rx = r;
      oe._origGeom = JSON.stringify(geom);
      const sloppiness = (oe._sloppiness ?? this.sloppiness) as 'architect' | 'artist' | 'cartoonist' | 'doodle';
      const replacement = this.tryConvertToSketch(o, sloppiness);
      if (replacement) this.replaceActiveObject(o, replacement);
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
    const ag = o as AnchoredArrowGroup;
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
    const strokeDashArray = (firstChild?.get('strokeDashArray') as number[] | undefined);
    const opacity = (o.get('opacity') as number | undefined) ?? 1;

    const tempLine = new Line([x1, y1, x2, y2], {
      stroke, strokeWidth, strokeDashArray,
      opacity, selectable: false, evented: false,
    });
    // Copy the original group's ID so the merge engine keeps tracking the same object
    (tempLine as FabricObject & { _id?: string })._id =
      (o as FabricObject & { _id?: string })._id;
    // Preserve attachment IDs and anchor offsets so the rebuilt arrow continues following
    // its connected shapes at the same border anchor positions.
    const dst = tempLine as AnchoredLine;
    dst._attachedFrom = ag._attachedFrom;
    dst._attachedTo = ag._attachedTo;
    dst._attachedFromAnchorX = ag._attachedFromAnchorX;
    dst._attachedFromAnchorY = ag._attachedFromAnchorY;
    dst._attachedToAnchorX = ag._attachedToAnchorX;
    dst._attachedToAnchorY = ag._attachedToAnchorY;

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

  /**
   * Apply endpoint-only selection handles to a Fabric.js Line.
   * Replaces the default 8-handle rectangular bounding box with two circular
   * handles – one at each endpoint – so users can precisely drag individual
   * endpoints instead of moving the whole bounding box.
   */
  private applyLineEndpointControls(line: Line): void {
    line.hasBorders = false;
    line.cornerStyle = 'circle';
    line.cornerColor = '#6c63ff';
    line.cornerStrokeColor = '#ffffff';
    line.cornerSize = 10;

    const makeEndpointControl = (endpoint: 1 | 2): Control => new Control({
      cursorStyle: 'crosshair',
      positionHandler: (
        _dim: Point,
        finalMatrix: TMat2D,
        fabricObject: FabricObject,
      ): Point => {
        const l = fabricObject as Line;
        const pts = l.calcLinePoints();
        return new Point(
          endpoint === 1 ? pts.x1 : pts.x2,
          endpoint === 1 ? pts.y1 : pts.y2,
        ).transform(finalMatrix);
      },
      actionHandler: (
        (_e: unknown, transform: { target: FabricObject }, x: number, y: number): boolean => {
          const l = transform.target as Line;
          if (endpoint === 1) {
            l.set({ x1: x, y1: y });
          } else {
            l.set({ x2: x, y2: y });
          }
          l.setCoords();
          return true;
        }
      ) as Control['actionHandler'],
    });

    line.controls = { ep1: makeEndpointControl(1), ep2: makeEndpointControl(2) };
  }

  /**
   * Apply endpoint-only selection handles to an arrow Group object.
   * Shows circular handles at the arrow's stored _x1/_y1 and _x2/_y2 positions,
   * hiding the rectangular group bounding box.  Dragging a handle rebuilds the
   * arrow group's children in-place (without removing the Group from the canvas)
   * so Fabric.js drag-tracking is never interrupted.
   */
  private applyArrowEndpointControls(grp: FabricObject): void {
    grp.hasBorders = false;
    grp.cornerStyle = 'circle';
    grp.cornerColor = '#6c63ff';
    grp.cornerStrokeColor = '#ffffff';
    grp.cornerSize = 10;

    const makeArrowEndpointControl = (endpoint: 1 | 2): Control => new Control({
      cursorStyle: 'crosshair',
      positionHandler: (
        _dim: Point,
        finalMatrix: TMat2D,
        fabricObject: FabricObject,
      ): Point => {
        const a = fabricObject as AnchoredArrowGroup;
        const ax = endpoint === 1 ? (a._x1 ?? 0) : (a._x2 ?? 0);
        const ay = endpoint === 1 ? (a._y1 ?? 0) : (a._y2 ?? 0);
        const center = fabricObject.getCenterPoint();
        return new Point(ax - center.x, ay - center.y).transform(finalMatrix);
      },
      actionHandler: (
        (_e: unknown, transform: { target: FabricObject }, x: number, y: number): boolean => {
          const a = transform.target as AnchoredArrowGroup;
          if (!this.canvas) return false;

          const nx1 = endpoint === 1 ? x : (a._x1 ?? 0);
          const ny1 = endpoint === 1 ? y : (a._y1 ?? 0);
          const nx2 = endpoint === 2 ? x : (a._x2 ?? 0);
          const ny2 = endpoint === 2 ? y : (a._y2 ?? 0);

          // Rebuild the Group's children in-place.  The Group object itself
          // stays on the canvas so Fabric.js drag-tracking (_currentTransform)
          // is never interrupted.  Calling canvas.remove(activeObject) during
          // an actionHandler causes Fabric to call endCurrentTransform() and
          // kill the drag immediately — this avoids that problem entirely.
          this.rebuildArrowGroupInPlace(a, nx1, ny1, nx2, ny2);
          return true;
        }
      ) as Control['actionHandler'],
    });

    grp.controls = { ep1: makeArrowEndpointControl(1), ep2: makeArrowEndpointControl(2) };
  }

  /**
   * Rebuild an arrow Group's visual children in-place without removing or
   * replacing the Group object itself.
   *
   * This is used by applyArrowEndpointControls' actionHandler to update the
   * arrow's appearance on every mouse-move during endpoint dragging.  Because
   * the Group object stays in canvas._objects throughout the drag, Fabric.js
   * never fires _discardActiveObject() and the _currentTransform (drag state)
   * is preserved.
   */
  private rebuildArrowGroupInPlace(
    grp: FabricObject,
    x1: number, y1: number, x2: number, y2: number,
  ): void {
    const ag = grp as AnchoredArrowGroup;
    const headStart = (ag._arrowHeadStart ?? 'none') as 'none' | 'open' | 'triangle' | 'triangle-outline';
    const headEnd   = (ag._arrowHeadEnd   ?? 'open') as 'none' | 'open' | 'triangle' | 'triangle-outline';
    const arrowType = (ag._arrowType      ?? 'sharp') as 'sharp' | 'curved' | 'elbow';
    const group = grp as Group;

    // Read style from existing children so we don't lose per-arrow styling.
    const children = group.getObjects?.() ?? [];
    const firstChild = children[0] as FabricObject | undefined;
    const stroke = (firstChild?.get('stroke') as string | undefined) ?? this.strokeColor;
    const strokeWidth = (firstChild?.get('strokeWidth') as number | undefined) ?? this.strokeWidth;
    const strokeDashArray = (firstChild?.get('strokeDashArray') as number[] | undefined);
    const opacity = (grp.get('opacity') as number | undefined) ?? 1;

    // Build new child shapes with the updated coordinates.
    const shapes: FabricObject[] = [];

    if (arrowType === 'curved' || arrowType === 'elbow') {
      let pathD: string;
      if (arrowType === 'curved') {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const dx = x2 - x1, dy = y2 - y1;
        const segLen = Math.hypot(dx, dy);
        if (segLen > 0) {
          const curvature = Math.min(segLen * 0.3, 60);
          const cx = mx - (dy / segLen) * curvature;
          const cy = my + (dx / segLen) * curvature;
          pathD = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
        } else {
          pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
        }
      } else {
        const midX = (x1 + x2) / 2;
        pathD = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
      }
      shapes.push(new Path(pathD, {
        stroke, strokeWidth, fill: 'transparent',
        selectable: false, evented: false,
        strokeLineCap: 'round', strokeLineJoin: 'round',
        strokeDashArray, opacity, strokeUniform: true,
      }));
    } else {
      shapes.push(new Line([x1, y1, x2, y2], {
        stroke, strokeWidth, fill: 'transparent',
        selectable: false, evented: false,
        strokeDashArray, opacity, strokeUniform: true,
      }));
    }

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const len = 14, spread = 0.4;
    if (headEnd !== 'none') {
      const head = this.makeArrowhead(x2, y2, angle, len, spread, stroke, strokeWidth, headEnd, opacity);
      if (head) shapes.push(head);
    }
    if (headStart !== 'none') {
      const head = this.makeArrowhead(x1, y1, angle + Math.PI, len, spread, stroke, strokeWidth, headStart, opacity);
      if (head) shapes.push(head);
    }

    // Replace the Group's children in-place.
    // group.add() calls enterGroup(obj, true) for each shape, converting the
    // shape's absolute canvas coordinates into group-local coordinates, exactly
    // as the original Group constructor does when buildArrowGroup first creates
    // the group.  The Group object itself is never removed from the canvas.
    group.removeAll();
    group.add(...shapes);

    // Update stored endpoint metadata and group center.
    ag._x1 = x1; ag._y1 = y1;
    ag._x2 = x2; ag._y2 = y2;
    const newCenter = grp.getCenterPoint();
    ag._gcx = newCenter.x;
    ag._gcy = newCenter.y;
  }

  /**
   * Apply endpoint-only selection handles to a sketch-path Line (artist /
   * cartoonist sloppiness).  The Path object carries the logical endpoint
   * coordinates in `_origGeom`.  Dragging a handle rebuilds the sketch path so
   * its endpoint follows the cursor.
   */
  private applySketchLineEndpointControls(path: FabricObject): void {
    type GeomExt = { _origGeom?: string };
    const sp = path as FabricObject & GeomExt;
    if (!sp._origGeom) return;
    let geom: { type?: string; x1?: number; y1?: number; x2?: number; y2?: number };
    try { geom = JSON.parse(sp._origGeom) as typeof geom; } catch { return; /* malformed _origGeom */ }
    if (geom.type !== 'line') return;

    path.hasBorders = false;
    path.cornerStyle = 'circle';
    path.cornerColor = '#6c63ff';
    path.cornerStrokeColor = '#ffffff';
    path.cornerSize = 10;

    const makeSketchEndpointControl = (endpoint: 1 | 2): Control => new Control({
      cursorStyle: 'crosshair',
      positionHandler: (
        _dim: Point,
        finalMatrix: TMat2D,
        fabricObject: FabricObject,
      ): Point => {
        const s = fabricObject as FabricObject & GeomExt;
        let g = { x1: 0, y1: 0, x2: 0, y2: 0 };
        try { g = JSON.parse(s._origGeom ?? '{}') as typeof g; } catch { /* malformed _origGeom, fall back to origin */ }
        const ax = endpoint === 1 ? (g.x1 ?? 0) : (g.x2 ?? 0);
        const ay = endpoint === 1 ? (g.y1 ?? 0) : (g.y2 ?? 0);
        const center = fabricObject.getCenterPoint();
        return new Point(ax - center.x, ay - center.y).transform(finalMatrix);
      },
      actionHandler: (
        (_e: unknown, transform: { target: FabricObject }, x: number, y: number): boolean => {
          const s = transform.target as FabricObject & GeomExt & { _id?: string };
          if (!this.canvas) return false;
          let g = { type: 'line', x1: 0, y1: 0, x2: 0, y2: 0 };
          try { g = JSON.parse(s._origGeom ?? '{}') as typeof g; } catch { return false; }
          if (g.type !== 'line') return false;

          const nx1 = endpoint === 1 ? x : (g.x1 ?? 0);
          const ny1 = endpoint === 1 ? y : (g.y1 ?? 0);
          const nx2 = endpoint === 2 ? x : (g.x2 ?? 0);
          const ny2 = endpoint === 2 ? y : (g.y2 ?? 0);

          const id = s._id;
          this.rebuildSketchPathForMove(transform.target, nx1, ny1, nx2, ny2);

          const newPath = id
            ? this.canvas.getObjects().find(
                (o) => (o as FabricObject & { _id?: string })._id === id,
              )
            : undefined;
          if (newPath) {
            (transform as Record<string, unknown>).target = newPath;
            this.applySketchLineEndpointControls(newPath);
          }
          return !!newPath;
        }
      ) as Control['actionHandler'],
    });

    path.controls = {
      ep1: makeSketchEndpointControl(1),
      ep2: makeSketchEndpointControl(2),
    };
  }

  /**
   * After loading canvas JSON, re-apply endpoint controls to all lines, arrows,
   * and sketch-path line connectors.  These controls are not serialised so must
   * be restored each time the canvas state is loaded.
   */
  private postLoadApplyEndpointControls(): void {
    if (!this.canvas) return;
    for (const obj of this.canvas.getObjects()) {
      if (obj instanceof Line) {
        this.applyLineEndpointControls(obj);
      } else if ((obj as FabricObject & { _isArrow?: boolean })._isArrow) {
        this.applyArrowEndpointControls(obj);
      } else {
        const sp = obj as FabricObject & { _origGeom?: string };
        if (sp._origGeom) {
          try {
            const g = JSON.parse(sp._origGeom) as { type?: string };
            if (g.type === 'line') this.applySketchLineEndpointControls(obj);
          } catch { /* ignore malformed _origGeom */ }
        }
      }
    }
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

  /**
   * Snap a line's endpoints to nearby shapes and store attachment IDs + anchor offsets.
   *
   * Detection: an endpoint snaps if it is within SNAP_RADIUS of any point on a
   * shape's axis-aligned bounding box (including the interior — distance is 0 when
   * the endpoint is inside the shape, ensuring any drop on or near the shape triggers
   * a snap).
   *
   * Snap target: the nearest point on the shape's bounding box perimeter. The
   * resulting offset from the shape's center is stored in _attachedFrom/ToAnchorX/Y
   * so that, when the shape is later moved, the connector endpoint tracks the same
   * relative border position rather than always jumping to the center.
   */
  private snapLineAttachment(line: FabricObject): void {
    if (!this.canvas) return;
    if (!(line instanceof Line)) return;
    const SNAP_RADIUS = 30;
    // Exclude the line itself, other plain lines, and arrow groups — connectors
    // should only link to real shapes (rect, ellipse, text, path, etc.).
    const objs = this.canvas.getObjects().filter(
      (o) => o !== line && !(o instanceof Line) && !(o as FabricObject & { _isArrow?: boolean })._isArrow,
    );
    const typedLine = line as AnchoredLine;
    const { x1 = 0, y1 = 0, x2 = 0, y2 = 0 } = typedLine as AnchoredLine & { x1?: number; y1?: number; x2?: number; y2?: number };

    // For each endpoint, find the single closest shape within SNAP_RADIUS.
    // Tracking the best candidate prevents the last-wins ambiguity when multiple
    // shapes overlap the same endpoint.
    type SnapCandidate = {
      id: string;
      anchor: { x: number; y: number };
      anchorOffX: number;
      anchorOffY: number;
      dist: number;
    };
    let bestFrom: SnapCandidate | null = null;
    let bestTo: SnapCandidate | null = null;

    for (const obj of objs) {
      const center = obj.getCenterPoint();
      const id = (obj as FabricObject & { _id?: string })._id;
      if (!id) continue;

      // Build axis-aligned bounding box in scene coords from the shape's center and
      // scaled dimensions. scaleX/scaleY default to 1 when not explicitly set.
      const w = ((obj.get('width') as number) ?? 0) * ((obj.get('scaleX') as number) ?? 1);
      const h = ((obj.get('height') as number) ?? 0) * ((obj.get('scaleY') as number) ?? 1);
      const bLeft = center.x - w / 2;
      const bRight = center.x + w / 2;
      const bTop = center.y - h / 2;
      const bBottom = center.y + h / 2;

      // Distance from a point to the AABB (0 when the point is inside the box).
      const distToBox = (px: number, py: number): number => {
        const cx = Math.max(bLeft, Math.min(bRight, px));
        const cy = Math.max(bTop, Math.min(bBottom, py));
        return Math.hypot(px - cx, py - cy);
      };

      const d1 = distToBox(x1, y1);
      if (d1 < SNAP_RADIUS && (!bestFrom || d1 < bestFrom.dist)) {
        const anchor = CanvasEngine.nearestPointOnBounds(x1, y1, bLeft, bTop, bRight, bBottom);
        bestFrom = { id, anchor, anchorOffX: anchor.x - center.x, anchorOffY: anchor.y - center.y, dist: d1 };
      }

      const d2 = distToBox(x2, y2);
      if (d2 < SNAP_RADIUS && (!bestTo || d2 < bestTo.dist)) {
        const anchor = CanvasEngine.nearestPointOnBounds(x2, y2, bLeft, bTop, bRight, bBottom);
        bestTo = { id, anchor, anchorOffX: anchor.x - center.x, anchorOffY: anchor.y - center.y, dist: d2 };
      }
    }

    if (bestFrom) {
      typedLine._attachedFrom = bestFrom.id;
      typedLine._attachedFromAnchorX = bestFrom.anchorOffX;
      typedLine._attachedFromAnchorY = bestFrom.anchorOffY;
      typedLine.set({ x1: bestFrom.anchor.x, y1: bestFrom.anchor.y });
    }
    if (bestTo) {
      typedLine._attachedTo = bestTo.id;
      typedLine._attachedToAnchorX = bestTo.anchorOffX;
      typedLine._attachedToAnchorY = bestTo.anchorOffY;
      typedLine.set({ x2: bestTo.anchor.x, y2: bestTo.anchor.y });
    }
  }

  /**
   * Re-run snap/attachment logic after an existing Line, arrow Group, or sketch-path
   * connector has been repositioned by the user (triggered by `object:modified`).
   *
   * For Lines: clears any stale attachment IDs and re-runs `snapLineAttachment`
   * using the line's current `x1/y1/x2/y2`.
   *
   * For arrow Groups: computes the movement delta from the stored group center
   * (`_gcx/_gcy`), updates `_x1/_y1/_x2/_y2` to the new absolute endpoint
   * positions, then checks each endpoint for proximity to a shape.  If any
   * endpoint is within SNAP_RADIUS it is attached and the arrow is rebuilt at the
   * snapped coordinates; otherwise `_gcx/_gcy` are updated for future deltas.
   * Selection is restored to the rebuilt group when the original was active.
   *
   * For sketch-path connectors (Path with `_origGeom` type `line`): derives the
   * current logical endpoint positions from the object's new center plus the
   * half-delta stored in `_origGeom`, then runs the same snap logic and rebuilds
   * via `rebuildSketchPathForMove` if any endpoint snaps.
   */
  private reSnapOnModified(obj: FabricObject): void {
    if (!this.canvas) return;

    if (obj instanceof Line) {
      // Clear all existing attachments — the line was just repositioned by the user
      // so old attachment IDs are stale.  snapLineAttachment will re-add them if
      // the endpoints are still near (or newly near) a shape.
      const tl = obj as AnchoredLine;
      tl._attachedFrom = undefined;
      tl._attachedTo = undefined;
      tl._attachedFromAnchorX = undefined;
      tl._attachedFromAnchorY = undefined;
      tl._attachedToAnchorX = undefined;
      tl._attachedToAnchorY = undefined;
      this.snapLineAttachment(obj);
      return;
    }

    const ag = obj as AnchoredArrowGroup;
    if (ag._isArrow) {
      // Determine where the arrow endpoints are after the group was moved.
      // _gcx/_gcy is the group center when _x1/_y1/_x2/_y2 were last set;
      // the difference gives the movement delta.
      const newCenter = ag.getCenterPoint();
      const dx = newCenter.x - (ag._gcx ?? newCenter.x);
      const dy = newCenter.y - (ag._gcy ?? newCenter.y);
      const x1 = (ag._x1 ?? 0) + dx;
      const y1 = (ag._y1 ?? 0) + dy;
      const x2 = (ag._x2 ?? 0) + dx;
      const y2 = (ag._y2 ?? 0) + dy;

      // Clear stale attachment IDs before re-evaluating.
      ag._attachedFrom = undefined;
      ag._attachedTo = undefined;
      ag._attachedFromAnchorX = undefined;
      ag._attachedFromAnchorY = undefined;
      ag._attachedToAnchorX = undefined;
      ag._attachedToAnchorY = undefined;

      const SNAP_RADIUS = 30;
      const shapes = this.canvas.getObjects().filter(
        (o) => o !== obj && !(o instanceof Line) && !(o as FabricObject & { _isArrow?: boolean })._isArrow,
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
          const anchor = CanvasEngine.nearestPointOnBounds(x1, y1, bLeft, bTop, bRight, bBottom);
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
          const anchor = CanvasEngine.nearestPointOnBounds(x2, y2, bLeft, bTop, bRight, bBottom);
          ag._attachedTo = id;
          ag._attachedToAnchorX = anchor.x - center.x;
          ag._attachedToAnchorY = anchor.y - center.y;
          snapX2 = anchor.x;
          snapY2 = anchor.y;
          toDist = d2;
          didSnap = true;
        }
      }

      // Always commit the updated endpoint positions (snapped or free) so that
      // _x1/_y1/_x2/_y2 reflect the arrow's actual current location.
      ag._x1 = snapX1;
      ag._y1 = snapY1;
      ag._x2 = snapX2;
      ag._y2 = snapY2;

      if (didSnap) {
        // Rebuild the arrow at the snapped coordinates.  Track whether the group was
        // active so we can re-select the rebuilt group, preserving selection after snap.
        const wasActive = this.canvas.getActiveObject() === obj;
        const agId = (ag as FabricObject & { _id?: string })._id;
        this.rebuildArrowForMove(obj, snapX1, snapY1, snapX2, snapY2);
        if (wasActive && agId) {
          const newGrp = this.canvas.getObjects().find(
            (o) => (o as FabricObject & { _id?: string })._id === agId,
          );
          if (newGrp) this.canvas.setActiveObject(newGrp);
        }
      } else {
        // No snap: just persist the new group center so the next delta is correct.
        ag._gcx = newCenter.x;
        ag._gcy = newCenter.y;
      }
      return;
    }

    // Handle sketch-path connectors: Path objects with `_origGeom` type `line`.
    const sp = obj as AnchoredLine & { _origGeom?: string; _sloppiness?: string; type?: string };
    if (sp.type !== 'path' || !sp._origGeom) return;
    let geom: { type: string; x1: number; y1: number; x2: number; y2: number };
    try { geom = JSON.parse(sp._origGeom) as typeof geom; } catch { return; }
    if (geom.type !== 'line') return;

    // Derive current logical endpoint positions from the path's new center and the
    // half-deltas stored in _origGeom.  This mirrors how tryConvertToSketch positions
    // lines (srcCenter ± dx/dy), giving the logical endpoints after the drag.
    const pathCenter = obj.getCenterPoint();
    const halfDx = (geom.x2 - geom.x1) / 2;
    const halfDy = (geom.y2 - geom.y1) / 2;
    const x1sp = pathCenter.x - halfDx;
    const y1sp = pathCenter.y - halfDy;
    const x2sp = pathCenter.x + halfDx;
    const y2sp = pathCenter.y + halfDy;

    // Clear stale attachment IDs.
    sp._attachedFrom = undefined;
    sp._attachedTo = undefined;
    sp._attachedFromAnchorX = undefined;
    sp._attachedFromAnchorY = undefined;
    sp._attachedToAnchorX = undefined;
    sp._attachedToAnchorY = undefined;

    const SNAP_RADIUS_SP = 30;
    const spShapes = this.canvas.getObjects().filter(
      (o) => o !== obj && !(o instanceof Line) && !(o as FabricObject & { _isArrow?: boolean })._isArrow,
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
        const anchor = CanvasEngine.nearestPointOnBounds(x1sp, y1sp, bLeft, bTop, bRight, bBottom);
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
        const anchor = CanvasEngine.nearestPointOnBounds(x2sp, y2sp, bLeft, bTop, bRight, bBottom);
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
      // Rebuild the sketch path at the snapped coordinates and restore selection.
      const wasActive = this.canvas.getActiveObject() === obj;
      const spId = (sp as FabricObject & { _id?: string })._id;
      this.rebuildSketchPathForMove(obj, snapX1sp, snapY1sp, snapX2sp, snapY2sp);
      if (wasActive && spId) {
        const newPath = this.canvas.getObjects().find(
          (o) => (o as FabricObject & { _id?: string })._id === spId,
        );
        if (newPath) this.canvas.setActiveObject(newPath);
      }
    }
  }

  /**
   * Return the nearest point on the perimeter of an axis-aligned bounding box.
   * If the query point is inside the box it is projected to the nearest edge;
   * if it is outside, it is clamped to the nearest border point.
   */
  private static nearestPointOnBounds(
    px: number, py: number,
    left: number, top: number, right: number, bottom: number,
  ): { x: number; y: number } {
    const inside = px >= left && px <= right && py >= top && py <= bottom;
    if (inside) {
      // Project to the nearest edge.
      const dLeft = px - left;
      const dRight = right - px;
      const dTop = py - top;
      const dBottom = bottom - py;
      const minD = Math.min(dLeft, dRight, dTop, dBottom);
      if (minD === dLeft) return { x: left, y: py };
      if (minD === dRight) return { x: right, y: py };
      if (minD === dTop) return { x: px, y: top };
      return { x: px, y: bottom };
    }
    // Clamp to the nearest point on the perimeter.
    return {
      x: Math.max(left, Math.min(right, px)),
      y: Math.max(top, Math.min(bottom, py)),
    };
  }

  /**
   * Schedule a connector-follow update for `movedObj` on the next animation frame.
   * If a frame is already pending the new target simply overwrites the old one so
   * that the work done per frame stays constant regardless of mousemove frequency.
   */
  private scheduleAttachmentUpdate(movedObj: FabricObject): void {
    this._attachmentRafTarget = movedObj;
    if (this._attachmentRafId !== null) return; // frame already queued
    this._attachmentRafId = requestAnimationFrame(() => {
      this._attachmentRafId = null;
      const target = this._attachmentRafTarget;
      this._attachmentRafTarget = null;
      if (target) this.updateAttachedLines(target);
    });
  }

  /** When a shape is moved, update the endpoints of any Line or arrow Group attached to it. */
  private updateAttachedLines(movedObj: FabricObject): void {    if (!this.canvas) return;
    const id = (movedObj as FabricObject & { _id?: string })._id;
    if (!id) return;
    const center = movedObj.getCenterPoint();
    let changed = false;

    // Collect arrow groups and sketch paths that need rebuilding so we don't modify
    // the objects list while iterating over it.
    const arrowsToRebuild: Array<{ grp: FabricObject; x1: number; y1: number; x2: number; y2: number }> = [];
    const sketchesToRebuild: Array<{ sp: FabricObject; x1: number; y1: number; x2: number; y2: number }> = [];

    for (const obj of this.canvas.getObjects()) {
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
      this.rebuildArrowForMove(grp, x1, y1, x2, y2);
    }
    for (const { sp, x1, y1, x2, y2 } of sketchesToRebuild) {
      this.rebuildSketchPathForMove(sp, x1, y1, x2, y2);
    }

    if (changed) {
      this.canvas.requestRenderAll();
      this.markDirty();
      this.onBroadcastDraw(false); // throttled — endpoint moves are frequent
    }
  }

  /**
   * Rebuild an arrow Group with updated endpoint coordinates without changing
   * the canvas selection (used when a connected shape is being moved).
   * Preserves the group's _id, _attachedFrom, _attachedTo, and anchor offsets.
   */
  private rebuildArrowForMove(
    grp: FabricObject,
    x1: number, y1: number, x2: number, y2: number,
  ): void {
    if (!this.canvas) return;
    const ag = grp as AnchoredArrowGroup;

    const headStart = (ag._arrowHeadStart ?? 'none') as 'none' | 'open' | 'triangle' | 'triangle-outline';
    const headEnd   = (ag._arrowHeadEnd   ?? 'open') as 'none' | 'open' | 'triangle' | 'triangle-outline';
    const arrowType = (ag._arrowType      ?? 'sharp') as 'sharp' | 'curved' | 'elbow';

    const children = (grp as Group).getObjects?.() ?? [];
    const firstChild = children[0] as FabricObject | undefined;
    const stroke = (firstChild?.get('stroke') as string | undefined) ?? this.strokeColor;
    const strokeWidth = (firstChild?.get('strokeWidth') as number | undefined) ?? this.strokeWidth;
    const strokeDashArray = (firstChild?.get('strokeDashArray') as number[] | undefined);
    const opacity = (grp.get('opacity') as number | undefined) ?? 1;

    const tempLine = new Line([x1, y1, x2, y2], {
      stroke, strokeWidth, strokeDashArray,
      opacity, selectable: false, evented: false,
    });
    // Preserve the group's ID, attachment IDs, and anchor offsets.
    (tempLine as FabricObject & { _id?: string })._id = (grp as FabricObject & { _id?: string })._id;
    const tl = tempLine as AnchoredLine;
    tl._attachedFrom = ag._attachedFrom;
    tl._attachedTo = ag._attachedTo;
    tl._attachedFromAnchorX = ag._attachedFromAnchorX;
    tl._attachedFromAnchorY = ag._attachedFromAnchorY;
    tl._attachedToAnchorX = ag._attachedToAnchorX;
    tl._attachedToAnchorY = ag._attachedToAnchorY;

    // Rebuild without switching the canvas selection (selectAfter=false), then restore
    // the previously-active object so Fabric.js drag-tracking is not interrupted.
    const prevActive = this.canvas.getActiveObject();
    this.canvas.remove(grp);
    this.buildArrowGroup(tempLine, headStart, headEnd, arrowType, false);
    if (prevActive && prevActive !== grp) {
      this.canvas.setActiveObject(prevActive);
    }
  }

  /**
   * Rebuild a sketch-path connector (artist/cartoonist Line stored as a Path) with
   * updated endpoint coordinates when an attached shape is moved.
   * Updates `_origGeom` on the existing Path, regenerates it via `tryConvertToSketch`,
   * and replaces it on the canvas without disturbing the active selection.
   */
  private rebuildSketchPathForMove(
    pathObj: FabricObject,
    x1: number, y1: number, x2: number, y2: number,
  ): void {
    if (!this.canvas) return;
    const sp = pathObj as AnchoredLine & { _origGeom?: string; _sloppiness?: string };

    // Update origGeom with the new snapped endpoint coordinates.
    sp._origGeom = JSON.stringify({ type: 'line', x1, y1, x2, y2 });

    const sloppiness = (sp._sloppiness as 'architect' | 'artist' | 'cartoonist') ?? 'artist';
    const rebuilt = this.tryConvertToSketch(pathObj, sloppiness);
    if (!rebuilt) return;

    // tryConvertToSketch positions the result at the source object's getCenterPoint()
    // (the old center). For a moved connector the correct center is the midpoint of
    // the new endpoints — override it here.
    rebuilt.set({
      left: (x1 + x2) / 2,
      top: (y1 + y2) / 2,
      originX: 'center', originY: 'center',
    });
    rebuilt.setCoords();

    const prevActive = this.canvas.getActiveObject();
    this.canvas.remove(pathObj);
    this.canvas.add(rebuilt);
    if (prevActive && prevActive !== pathObj) {
      this.canvas.setActiveObject(prevActive);
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

    // Sync mermaid code textarea when a mermaid image is selected
    const mermaidCode = (o as FabricObject & { _mermaidCode?: string })._mermaidCode ?? '';
    const mermaidInput = document.getElementById('mermaidCodeInput') as HTMLTextAreaElement | null;
    if (mermaidInput) mermaidInput.value = mermaidCode;

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

    // Sync border-radius buttons from the selected rect (native or sketch)
    const shapeTypeForBr = this.getObjectShapeType(o);
    if (shapeTypeForBr === 'rect') {
      let objRx: number;
      if (o.isType('rect')) {
        objRx = (o.get('rx') as number) ?? 0;
      } else {
        // Sketch path: read rx from stored _origGeom
        const origGeomStr = (o as FabricObject & { _origGeom?: string })._origGeom;
        try {
          const g = JSON.parse(origGeomStr ?? '') as { rx?: number };
          objRx = g.rx ?? 0;
        } catch { objRx = 0; }
      }
      const brType = objRx > 3 ? 'rounded' : 'sharp';
      ['br-sharp', 'br-rounded'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('on');
        el.setAttribute('aria-pressed', 'false');
      });
      document.getElementById(`br-${brType}`)?.classList.add('on');
      document.getElementById(`br-${brType}`)?.setAttribute('aria-pressed', 'true');
      this.borderRadiusEnabled = brType === 'rounded';
    }

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
   * Sketch paths (artist/cartoonist/doodle) preserve their original shape type
   * via `_origGeom` so that the correct controls remain visible.
   */
  private getObjectShapeType(o: FabricObject): string {
    const oa = o as FabricObject & { _isArrow?: boolean; _isMermaid?: boolean; type?: string; _origGeom?: string };
    if (oa._isMermaid) return 'mermaid';
    if (oa._isArrow) return 'arrow';
    const t = (oa.type as string | undefined) ?? '';
    if (t === 'rect') return 'rect';
    if (t === 'ellipse') return 'ellipse';
    if (t === 'line') return 'line';
    if (t === 'path' || t === 'polyline') {
      // A sketch path generated from a rect/ellipse/line stores the original geometry
      // in _origGeom so we can show the correct properties-panel sections.
      if (oa._origGeom) {
        try {
          const g = JSON.parse(oa._origGeom) as { type?: string };
          if (g.type === 'rect') return 'rect';
          if (g.type === 'ellipse') return 'ellipse';
          if (g.type === 'line') return 'line';
        } catch { /* fall through */ }
      }
      return 'pen';
    }
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

    const isRect     = shapeType === 'rect';
    const isEllipse  = shapeType === 'ellipse';
    const isArrow    = shapeType === 'arrow';
    const isPen      = shapeType === 'pen';
    const isText     = shapeType === 'text';
    const isMermaid  = shapeType === 'mermaid';
    const hasFill    = isRect || isEllipse;
    // Mermaid objects support stroke (border) but not text-style (no stroke width/dash exclusion)
    const hasStroke  = !isText;

    // Colors: always visible
    show('pp-color-section');

    // Stroke width / dash: all shapes with a stroke (not text)
    hasStroke ? show('pp-stroke-width-section') : hide('pp-stroke-width-section');
    hasStroke ? show('pp-stroke-dash-section')  : hide('pp-stroke-dash-section');

    // Fill: rect and ellipse only (mermaid has its own SVG background)
    hasFill ? show('pp-fill-pattern-section') : hide('pp-fill-pattern-section');

    // Border radius: rect only
    isRect ? show('pp-border-radius-section') : hide('pp-border-radius-section');

    // Sloppiness: all shapes except text, mermaid, eraser, and select
    const hasSloppiness = !isText && !isMermaid && shapeType !== 'select' && shapeType !== 'eraser';
    hasSloppiness ? show('pp-sloppiness-section') : hide('pp-sloppiness-section');

    // Arrow controls: arrow only
    isArrow ? show('pp-arrow-type-section')  : hide('pp-arrow-type-section');
    isArrow ? show('pp-arrow-heads-section') : hide('pp-arrow-heads-section');

    // Opacity: always visible
    show('pp-opacity-section');

    // Mermaid code editor: mermaid objects and the mermaid tool only
    isMermaid ? show('pp-mermaid-section') : hide('pp-mermaid-section');

    // Layer + link: only when an existing object is selected
    isObjectSelected ? show('pp-layer-section') : hide('pp-layer-section');
    isObjectSelected ? show('pp-link-section')  : hide('pp-link-section');
  }
}
