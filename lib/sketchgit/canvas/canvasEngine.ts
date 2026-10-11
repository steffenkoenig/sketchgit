
import { UISyncManager } from './uiSyncManager';
import { SnappingManager, type AnchoredArrowGroup, type AnchoredLine } from './snappingLogic';

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
  Canvas, Path, Polyline, Rect, Ellipse, Line, IText, Polygon, Group, ActiveSelection, FabricImage, FabricObject, Point, Pattern, Control, util,
} from 'fabric';
import type { TPointerEventInfo, XY, TMat2D } from 'fabric';

import { ensureObjId } from '../git/objectIdTracker';
import { CANVAS_JSON_SCHEMA_VERSION } from '../git/canvasSchemaVersion';
import { migrateCanvasJson } from '../git/canvasSchemaMigrations';
import { logger } from '../logger';
import { renderMermaidToDataUrl } from './mermaidRenderer';
import { nearestPointOnBounds } from './snapEngine';




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
  private _preTransformState: string | null = null;

  // ── P020: Bound listener references for proper cleanup ───────────────────
  private boundResize: (() => void) | null = null;
  private boundKeydown: ((e: KeyboardEvent) => void) | null = null;
  private boundContextMenu: ((e: MouseEvent) => void) | null = null;

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
  public _attachmentRafId: number | null = null;
  /** The most-recently-moved shape waiting for a connector-follow update. */
  public _attachmentRafTarget: FabricObject | null = null;

  // ── Re-entrancy guard for object:modified snap logic ──────────────────────
  /** True while reSnapOnModified is running. Prevents Fabric.js v7's
   *  setActiveObject → discardActiveObject → endCurrentTransform from
   *  re-firing object:modified for the already-removed old arrow group,
   *  which would cause unbounded arrow accumulation ("hundreds of arrows"). */
  private _reSnapping = false;

  // ── Callbacks provided by the orchestrator ────────────────────────────────
  public readonly onBroadcastDraw: (immediate?: boolean) => void;
  private readonly onBroadcastCursor: (e: { e: MouseEvent }) => void;
  /** P067 – broadcast that the local user selected/deselected objects */
  private onBroadcastLock?: (objectIds: string[]) => void;
  private onBroadcastUnlock?: () => void;

  public snappingManager: SnappingManager;

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
    this.snappingManager = new SnappingManager(this);
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
      fireRightClick: true,
      stopContextMenu: true,
    });


    this.canvas.on('mouse:down', (e: TPointerEventInfo) => this.onMouseDown(e));
    this.canvas.on('mouse:move', (e: TPointerEventInfo) => this.onMouseMove(e));
    this.canvas.on('mouse:up', (e: TPointerEventInfo) => this.onMouseUp(e));
    // Save state BEFORE the transformation; only commit to history on object:modified
    // so that merely selecting/clicking an object doesn't litter the undo stack or
    // clear the redo stack (P037 undo support).
    this.canvas.on('before:transform', () => {
      this._preTransformState = this.getCanvasData();
    });
    this.canvas.on('object:modified', (e: { target?: FabricObject }) => {
      // Guard against re-entrant calls: Fabric.js v7 can re-fire object:modified
      // for the already-removed arrow group when setActiveObject triggers
      // discardActiveObject → endCurrentTransform.  Without this guard the
      // remove() becomes a no-op while buildArrowGroup keeps adding new arrows,
      // accumulating hundreds of groups and crashing the tab.
      if (this._reSnapping) return;
      if (this._preTransformState) {
        this.undoStack.push(this._preTransformState);
        if (this.undoStack.length > this.MAX_HISTORY) {
          this.undoStack.shift();
        }
        this.redoStack = [];
        this._preTransformState = null;
      }
      this.markDirty();
      // Re-run snap so an already-placed line or arrow group can be attached
      // to a shape by moving it next to one (or detached by moving it away).
      if (e.target) {
        this._reSnapping = true;
        try {
          this.snappingManager.reSnapOnModified(e.target);
        } finally {
          this._reSnapping = false;
        }
      }
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
      if (e.target) this.snappingManager.scheduleAttachmentUpdate(e.target);
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
    if (this.boundContextMenu) {
      if (this.touchWrapEl) {
        this.touchWrapEl.removeEventListener('contextmenu', this.boundContextMenu);
      }
      this.boundContextMenu = null;
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

  // P095: also used by getSelectionData() so a saved template round-trips
  // through the same custom fields as a full canvas save/load.
  private static readonly CUSTOM_PROPERTIES = [
    '_isArrow', '_id', '_link', '_fillPattern', '_fillColor',
    '_arrowHeadStart', '_arrowHeadEnd', '_arrowType',
    '_sloppiness', '_origGeom',
    '_attachedFrom', '_attachedTo',
    '_attachedFromAnchorX', '_attachedFromAnchorY', '_attachedToAnchorX', '_attachedToAnchorY',
    '_x1', '_y1', '_x2', '_y2',
    '_isMermaid', '_mermaidCode',
  ];

  getCanvasData(): string {
    if (!this.canvas) return JSON.stringify(undefined);
    this.canvas.getObjects().forEach((o: FabricObject) => ensureObjId(o));
    // Fabric v7: canvas.toJSON() ignores any propertiesToInclude argument because its
    // signature is toJSON() (no params) – it just delegates to toObject() with no args.
    // canvas.toObject(propertiesToInclude) DOES forward the list to each object's
    // toObject(), so _id and _isArrow are included in the output.
    // NOTE: FabricObject.customProperties is also set in init() as a belt-and-suspenders
    // guard so that any call path (toJSON included) always serialises these fields.
    // P085 – schemaVersion is stamped on every write so old commits (which
    // predate this field) can be distinguished from current ones at read time.
    return JSON.stringify({
      schemaVersion: CANVAS_JSON_SCHEMA_VERSION,
      ...this.canvas.toObject(CanvasEngine.CUSTOM_PROPERTIES),
    });
  }

  /**
   * P095 – Serialise the current selection (one or more objects) for saving
   * as a reusable shape template. Returns null when nothing is selected.
   * Object positions are kept as-is (absolute canvas coordinates); the
   * server strips `_id` and validates the payload before persisting it.
   */
  getSelectionData(): { objects: object[] } | null {
    if (!this.canvas) return null;
    const active = this.canvas.getActiveObjects();
    if (active.length === 0) return null;
    active.forEach((o: FabricObject) => ensureObjId(o));
    return { objects: active.map((o) => o.toObject(CanvasEngine.CUSTOM_PROPERTIES)) };
  }

  /**
   * P095 – Instantiate a saved shape template onto the canvas. `canvasJson`
   * is the sanitized `{ objects: [...] }` payload returned by
   * GET /api/templates/[id] (server-stripped of `_id`; reassigned here via
   * the same object:added → ensureObjId() listener used everywhere else).
   * New objects are offset from their saved position so a repeated paste
   * doesn't stack exactly on top of the previous one.
   */
  async instantiateTemplate(canvasJson: { objects: unknown[] }): Promise<void> {
    if (!this.canvas) return;
    const rawObjects = (canvasJson.objects ?? []) as Array<Record<string, unknown>>;
    if (rawObjects.length === 0) return;

    this.pushHistory();

    const OFFSET = 24;
    const prepared = rawObjects.map((o) => {
      const { _id: _unused, ...rest } = o;
      const left = typeof rest.left === 'number' ? rest.left : 0;
      const top = typeof rest.top === 'number' ? rest.top : 0;
      return { ...rest, left: left + OFFSET, top: top + OFFSET };
    });

    const enlivened = (await util.enlivenObjects(prepared)) as FabricObject[];
    for (const obj of enlivened) {
      ensureObjId(obj);
      this.canvas.add(obj);
    }

    if (enlivened.length > 1) {
      const selection = new ActiveSelection(enlivened, { canvas: this.canvas });
      this.canvas.setActiveObject(selection);
    } else if (enlivened.length === 1) {
      this.canvas.setActiveObject(enlivened[0]);
    }

    this.canvas.requestRenderAll();
    this.markDirty();
    this.onBroadcastDraw(true);
  }

  loadCanvasData(data: string): void {
    // P037: Clear undo/redo stacks when an external canvas state is loaded
    // (e.g. git checkout, merge) — local history is no longer valid.
    this.undoStack = [];
    this.redoStack = [];
    // P085 – migrate legacy (pre-versioning) or older-schema payloads before
    // loading. loadCanvasData() is the single funnel for all external canvas
    // state (git checkout, merge, peer sync) — see canvasSchemaMigrations.ts.
    let migrated: Record<string, unknown>;
    try {
      migrated = migrateCanvasJson(data);
    } catch (err: unknown) {
      logger.error({ err }, 'loadCanvasData: failed to migrate canvas JSON schema version');
      return;
    }
    // P022: requestRenderAll() in the loadFromJSON callback schedules a single
    // frame render rather than forcing a synchronous repaint.
    // Fabric v7: loadFromJSON is promise-based; use .then() instead of a callback.
    void this.canvas?.loadFromJSON(migrated).then(() => {
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
      this.postLoadApplyEndpointControls();
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
      this.postLoadApplyEndpointControls();
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

  private handleMouseDownPen(p: XY): void {
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
  }

  private handleMouseDownText(p: XY): void {
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
  }

  private handleMouseDownMermaid(p: XY): void {
    // Record placement position and show the mermaid code editor in the
    // properties panel so the user can enter diagram code before rendering.
    this.pendingMermaidPos = { x: p.x, y: p.y };
    this.isDrawing = false;
    // Focus the mermaid code textarea so the user can immediately start typing
    const ta = document.getElementById('mermaidCodeInput') as HTMLTextAreaElement | null;
    if (ta) ta.focus();
  }

  private handleMouseDownShape(p: XY): void {
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

  private onMouseDown(e: TPointerEventInfo): void {
    // Handle right click context menu
    if (e.e && (e.e as MouseEvent).button === 2) {
      e.e.preventDefault();
      const active = this.canvas?.getActiveObjects() || [];
      const hasSelection = active.length > 0;
      let canGroup = false;
      let canUngroup = false;

      if (hasSelection) {
        if (active.length > 1) canGroup = true;
        if (active.length === 1 && active[0].type === 'group' && !(active[0] as FabricObject & { _isArrow?: boolean })._isArrow) canUngroup = true;
      }

      window.dispatchEvent(new CustomEvent('sketchgit-context-menu', {
        detail: {
          x: (e.e as MouseEvent).clientX,
          y: (e.e as MouseEvent).clientY,
          hasSelection,
          canGroup,
          canUngroup
        }
      }));
      return;
    }
    if (this.currentTool === 'select') return;
    if (e.target && this.currentTool !== 'eraser') return;
    this.pushHistory();
    const p = e.scenePoint;
    this.startX = p.x;
    this.startY = p.y;
    this.isDrawing = true;
    if (this.canvas) this.canvas.selection = false;

    if (this.currentTool === 'pen') { this.handleMouseDownPen(p); return; }
    if (this.currentTool === 'eraser') return;
    if (this.currentTool === 'text') { this.handleMouseDownText(p); return; }
    if (this.currentTool === 'mermaid') { this.handleMouseDownMermaid(p); return; }
    this.handleMouseDownShape(p);
  }

  private handleMouseMoveEraser(p: XY): void {
    const objs = this.canvas?.getObjects() ?? [];
    const pt = new Point(p.x, p.y);
    for (let i = objs.length - 1; i >= 0; i--) {
      if (objs[i].containsPoint(pt)) {
        this.canvas?.remove(objs[i]);
        this.markDirty();
        break;
      }
    }
  }

  private handleMouseMovePen(p: XY): void {
    if (!this.currentPenPath) return;
    this.currentPenPath.push({ x: p.x, y: p.y });
    // P022: Update the Polyline in-place instead of removing the old object
    // and creating a new one on every mousemove event.
    const poly = this.activeObj as Polyline;
    poly.set('points', [...this.currentPenPath]);
    poly.setCoords();
    this.canvas?.requestRenderAll();
    this.onBroadcastDraw(false); // throttled mid-stroke delta (immediate=false)
  }

  private handleMouseMoveShape(dx: number, dy: number, p: XY): void {
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

  private onMouseMove(e: TPointerEventInfo): void {
    if (e.e instanceof MouseEvent) {
      this.onBroadcastCursor({ e: e.e });
    }
    if (!this.isDrawing) return;
    const p = e.scenePoint;

    if (this.currentTool === 'eraser') {
      this.handleMouseMoveEraser(p);
      return;
    }

    if (this.currentTool === 'pen' && this.currentPenPath) {
      this.handleMouseMovePen(p);
      return;
    }

    const dx = p.x - this.startX, dy = p.y - this.startY;
    if (!this.activeObj) return;

    this.handleMouseMoveShape(dx, dy, p);
  }

  private handleMouseUpPen(): void {
    if (!this.activeObj) return;
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
  }

  private handleMouseUpShape(p: XY): void {
    if (!this.activeObj) return;
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
          const sketch = this.snappingManager.tryConvertToSketch(this.activeObj, this.sloppiness);
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

  private onMouseUp(e: TPointerEventInfo): void {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.currentTool === 'pen' && this.activeObj) {
      this.handleMouseUpPen();
      return;
    }

    if (this.activeObj) {
      const p = e.scenePoint;
      this.handleMouseUpShape(p);
    }

    if (this.canvas) this.canvas.selection = this.currentTool === 'select';
    this.canvas?.requestRenderAll();
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
    // called via rebuildArrow, tempLine._id was pre-set to the original group's
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
    this.canvas.setActiveObject(grp);
    // Do NOT clear this.activeObj here. Nulling it prematurely would cause
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

  private handleToolShortcuts(k: string): boolean {
    const tools: Record<string, string> = {
      's': 'select', 'p': 'pen', 'l': 'line', 'a': 'arrow',
      'r': 'rect', 'e': 'ellipse', 't': 'text', 'm': 'mermaid', 'x': 'eraser'
    };
    if (tools[k]) {
      this.setTool(tools[k]);
      return true;
    }
    return false;
  }

  private handleZoomShortcuts(k: string): boolean {
    if (k === '+' || k === '=') { this.zoomIn(); return true; }
    if (k === '-') { this.zoomOut(); return true; }
    if (k === '0') { this.resetZoom(); return true; }
    return false;
  }

  private handleActionShortcuts(e: KeyboardEvent, k: string): boolean {
    if ((e.ctrlKey || e.metaKey) && k === 'g') {
      e.preventDefault();
      if (e.shiftKey) {
        this.ungroupSelection();
      } else {
        this.groupSelection();
      }
      return true;
    }
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
      return true;
    }
    if ((e.ctrlKey || e.metaKey) && k === 'y') {
      e.preventDefault();
      this.redo();
      return true;
    }
    if (k === 'delete' || k === 'backspace') {
      this.deleteSelection();
      return true;
    }
    // P096 – toggles the minimap; dispatched as a custom event (same pattern
    // as the modal-opening shortcuts elsewhere) rather than a constructor
    // callback, since the minimap is pure UI state the engine doesn't own.
    if (k === 'n') {
      document.dispatchEvent(new CustomEvent('sketchgit:toggleMinimap'));
      return true;
    }
    return false;
  }

  private onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();

    if (this.handleToolShortcuts(k)) return;
    if (this.handleZoomShortcuts(k)) return;
    this.handleActionShortcuts(e, k);
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

  private setStrokeColorOnObject(obj: FabricObject, v: string): void {
    if ((obj as FabricObject & { _isArrow?: boolean })._isArrow) {
      const children = (obj as Group).getObjects?.() ?? [];
      const firstChild = children[0];
      if (firstChild) firstChild.set('stroke', v);
      const ag = obj as AnchoredArrowGroup;
      this.rebuildArrowGroupInPlace(obj, ag._x1 ?? 0, ag._y1 ?? 0, ag._x2 ?? 0, ag._y2 ?? 0);
    } else if (this.isGroupLike(obj)) {
      const children = (obj as Group).getObjects() ?? [];
      for (const child of children) {
        this.setStrokeColorOnObject(child, v);
      }
      obj.set('dirty', true);
    } else {
      obj.set('stroke', v);
    }
  }

  updateStrokeColor(v: string): void {
    this.strokeColor = v;
    const dot = document.getElementById('strokeDot');
    if (dot) dot.style.background = v;
    const o = this.canvas?.getActiveObject();
    if (o) {
      this.pushHistory();
      this.setStrokeColorOnObject(o, v);
      this.canvas?.requestRenderAll();
      this.markDirty();
      this.onBroadcastDraw(true);
    }
  }

  private setFillColorOnObject(obj: FabricObject, v: string): void {
    if (this.isGroupLike(obj)) {
      const children = (obj as Group).getObjects() ?? [];
      for (const child of children) {
        this.setFillColorOnObject(child, v);
      }
      obj.set('dirty', true);
    } else {
      const objFill = obj.get('fill');
      const objHasFill = objFill !== 'transparent' && objFill != null;
      if (objHasFill || this.fillEnabled) {
        const pattern = (obj as FabricObject & { _fillPattern?: string })._fillPattern as 'filled' | 'striped' | 'crossed' | undefined;
        obj.set('fill', this.createFill(pattern ?? 'filled', v));
        (obj as FabricObject & { _fillColor?: string })._fillColor = v;
      }
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
      this.pushHistory();
      this.setFillColorOnObject(o, v);
      this.canvas?.requestRenderAll();
      // same fix: mark dirty and broadcast so peers see the change.
      this.markDirty();
      this.onBroadcastDraw(true);
    }
  }

  private toggleFillOnObject(obj: FabricObject): void {
    if (this.isGroupLike(obj)) {
      const children = (obj as Group).getObjects() ?? [];
      for (const child of children) {
        this.toggleFillOnObject(child);
      }
      obj.set('dirty', true);
    } else {
      if (this.fillEnabled) {
        const fill = this.createFill(this.fillPattern, this.fillColor);
        obj.set('fill', fill);
        const ext = obj as FabricObject & { _fillPattern?: string; _fillColor?: string };
        ext._fillPattern = this.fillPattern;
        ext._fillColor = this.fillColor;
      } else {
        obj.set('fill', 'transparent');
      }
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
      this.pushHistory();
      this.toggleFillOnObject(o);
      this.canvas?.requestRenderAll();
      this.markDirty();
      this.onBroadcastDraw(true);
    }
  }

  private setStrokeWidthOnObject(obj: FabricObject, w: number): void {
    if ((obj as FabricObject & { _isArrow?: boolean })._isArrow) {
      const children = (obj as Group).getObjects?.() ?? [];
      const firstChild = children[0];
      if (firstChild) firstChild.set('strokeWidth', w);
      const ag = obj as AnchoredArrowGroup;
      this.rebuildArrowGroupInPlace(obj, ag._x1 ?? 0, ag._y1 ?? 0, ag._x2 ?? 0, ag._y2 ?? 0);
    } else if (this.isGroupLike(obj)) {
      const children = (obj as Group).getObjects() ?? [];
      for (const child of children) {
        this.setStrokeWidthOnObject(child, w);
      }
      obj.set('dirty', true);
    } else {
      obj.set('strokeWidth', w);
      if (this.strokeDashType !== 'solid') {
        obj.set('strokeDashArray', this.getDashArray(this.strokeDashType, w));
      }
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
      this.pushHistory();
      this.setStrokeWidthOnObject(o, w);
      this.canvas?.requestRenderAll();
      this.markDirty();
      this.onBroadcastDraw(true);
    }
  }

  private setStrokeDashOnObject(obj: FabricObject, type: 'solid' | 'dashed' | 'dotted'): void {
    if ((obj as FabricObject & { _isArrow?: boolean })._isArrow) {
      const children = (obj as Group).getObjects?.() ?? [];
      const firstChild = children[0];
      const actualWidth = (firstChild?.get('strokeWidth') as number) ?? this.strokeWidth;
      if (firstChild) firstChild.set('strokeDashArray', this.getDashArray(type, actualWidth));
      const ag = obj as AnchoredArrowGroup;
      this.rebuildArrowGroupInPlace(obj, ag._x1 ?? 0, ag._y1 ?? 0, ag._x2 ?? 0, ag._y2 ?? 0);
    } else if (this.isGroupLike(obj)) {
      const children = (obj as Group).getObjects() ?? [];
      for (const child of children) {
        this.setStrokeDashOnObject(child, type);
      }
      obj.set('dirty', true);
    } else {
      const actualWidth = (obj.get('strokeWidth') as number) || this.strokeWidth;
      const dashArray = this.getDashArray(type, actualWidth);
      obj.set('strokeDashArray', dashArray ?? null);
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
      this.pushHistory();
      this.setStrokeDashOnObject(o, type);
      this.canvas?.requestRenderAll();
      this.markDirty();
      this.onBroadcastDraw(true);
    }
  }

  private hasRectObject(obj: FabricObject): boolean {
    if (this.isGroupLike(obj)) {
      const children = (obj as Group).getObjects() ?? [];
      return children.some((child) => this.hasRectObject(child));
    }
    if (obj.isType('rect')) return true;
    const oe = obj as FabricObject & { _origGeom?: string };
    if (oe._origGeom) {
      try {
        const g = JSON.parse(oe._origGeom) as { type?: string };
        if (g.type === 'rect') return true;
      } catch { /* ignore */ }
    }
    return false;
  }

  private setBorderRadiusOnObject(obj: FabricObject, type: 'sharp' | 'rounded'): void {
    if (this.isGroupLike(obj)) {
      const children = (obj as Group).getObjects() ?? [];
      for (const child of children) {
        this.setBorderRadiusOnObject(child, type);
      }
      obj.set('dirty', true);
    } else {
      const r = type === 'rounded' ? 12 : 3; // 3 matches the creation default for sharp rects
      if (obj.isType('rect')) {
        (obj as Rect).set({ rx: r, ry: r });
      } else {
        // For sketch paths (artist/cartoonist/doodle) representing a rect: update
        // the stored original geometry and regenerate the sketch path.
        const oe = obj as FabricObject & { _origGeom?: string; _sloppiness?: string };
        if (!oe._origGeom) return;
        let geom: Record<string, unknown>;
        try { geom = JSON.parse(oe._origGeom) as Record<string, unknown>; }
        catch { return; }
        if (geom.type !== 'rect') return;
        geom.rx = r;
        oe._origGeom = JSON.stringify(geom);
        const sloppiness = (oe._sloppiness ?? this.sloppiness) as 'architect' | 'artist' | 'cartoonist' | 'doodle';
        const replacement = this.snappingManager.tryConvertToSketch(obj, sloppiness);
        if (replacement) this.replaceObject(obj, replacement);
      }
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
    if (o) {
      if (!this.hasRectObject(o)) return;
      this.pushHistory();
      this.setBorderRadiusOnObject(o, type);
      this.canvas?.requestRenderAll();
      this.markDirty();
      this.onBroadcastDraw(true);
    }
  }

  private setOpacityOnObject(obj: FabricObject, opacity: number): void {
    if (this.isGroupLike(obj)) {
      obj.set('opacity', 1);
      const children = (obj as Group).getObjects() ?? [];
      for (const child of children) {
        this.setOpacityOnObject(child, opacity);
      }
      obj.set('dirty', true);
    } else {
      obj.set('opacity', opacity);
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
      this.pushHistory();
      this.setOpacityOnObject(o, this.opacityValue / 100);
      this.canvas?.requestRenderAll();
      this.markDirty();
      this.onBroadcastDraw(true);
    }
  }

  private setSloppinessOnObject(obj: FabricObject, type: 'architect' | 'artist' | 'cartoonist' | 'doodle'): void {
    if (this.isGroupLike(obj)) {
      const children = (obj as Group).getObjects() ?? [];
      for (const child of children) {
        this.setSloppinessOnObject(child, type);
      }
      obj.set('dirty', true);
    } else {
      const replacement = this.snappingManager.tryConvertToSketch(obj, type);
      if (replacement) {
        this.replaceObject(obj, replacement);
      } else {
        obj.set(this.getSloppinessOptions(type));
      }
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
    if (o) {
      this.pushHistory();
      this.setSloppinessOnObject(o, type);
      this.canvas?.requestRenderAll();
      this.markDirty();
      this.onBroadcastDraw(true);
    }
  }

  private setFillPatternOnObject(obj: FabricObject, type: 'filled' | 'striped' | 'crossed'): void {
    if (this.isGroupLike(obj)) {
      const children = (obj as Group).getObjects() ?? [];
      for (const child of children) {
        this.setFillPatternOnObject(child, type);
      }
      obj.set('dirty', true);
    } else {
      const objFill = obj.get('fill');
      const objHasFill = objFill !== 'transparent' && objFill != null;
      if (objHasFill || this.fillEnabled) {
        const objFillColor = (obj as FabricObject & { _fillColor?: string })._fillColor ?? this.fillColor;
        const fill = this.createFill(type, objFillColor);
        obj.set('fill', fill);
        const ext = obj as FabricObject & { _fillPattern?: string; _fillColor?: string };
        ext._fillPattern = type;
        ext._fillColor = objFillColor;
      }
    }
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
      this.pushHistory();
      this.setFillPatternOnObject(o, type);
      this.canvas?.requestRenderAll();
      this.markDirty();
      this.onBroadcastDraw(true);
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


  // ── Grouping and Alignment ──────────────────────────────────────────────


  deleteSelection(): void {
    const objs = this.canvas?.getActiveObjects();
    if (objs && objs.length > 0) {
      this.pushHistory();
      this.canvas?.remove(...objs);
      this.canvas?.discardActiveObject();
      this.canvas?.requestRenderAll();
      this.markDirty();
      this.onBroadcastDraw(true);
    }
  }

  groupSelection(): void {
    const o = this.canvas?.getActiveObject();
    if (!o || !this.canvas) return;

    if (o.type?.toLowerCase() !== 'activeselection') return;

    this.pushHistory();

    const activeSelection = o as unknown as ActiveSelection;
    const items = activeSelection.removeAll() as FabricObject[];

    // Remove individual items from canvas before wrapping in a group to prevent duplication.
    for (const item of items) {
      this.canvas.remove(item);
    }

    const group = new Group(items);
    ensureObjId(group);

    this.canvas.add(group);
    this.canvas.setActiveObject(group);
    this.canvas.requestRenderAll();

    this.markDirty();
    this.onBroadcastDraw(true);
  }

  ungroupSelection(): void {
    const o = this.canvas?.getActiveObject();
    if (!o || !this.canvas) return;

    if (o.type !== 'group' || (o as unknown as Group & { _isArrow?: boolean })._isArrow) return;

    this.pushHistory();

    const group = o as Group;
    const items = group.getObjects() as FabricObject[];

    // Disassociate items from group which automatically updates their positioning using final transforms
    group.removeAll();

    // Remove group from canvas
    this.canvas.remove(group);

    for (const item of items) {
      this.canvas.add(item);
    }

    const activeSelection = new ActiveSelection(items, { canvas: this.canvas });
    this.canvas.setActiveObject(activeSelection);
    this.canvas.requestRenderAll();

    this.markDirty();
    this.onBroadcastDraw(true);
  }

  private getAlignableSelection(active: FabricObject | null | undefined): { items: FabricObject[], boundingRect: { left: number, top: number, width: number, height: number } } | null {
    if (!active) return null;
    let items: FabricObject[];
    if (active.type?.toLowerCase() === 'activeselection') {
      items = (active as ActiveSelection).getObjects();
    } else if (active.type === 'group' && !(active as unknown as Group & { _isArrow?: boolean })._isArrow) {
      items = (active as Group).getObjects();
    } else {
      return null;
    }
    const boundingRect = {
      left: active.width ? -active.width / 2 : 0,
      top: active.height ? -active.height / 2 : 0,
      width: active.width ?? 0,
      height: active.height ?? 0
    };
    return { items, boundingRect };
  }

  private applyAlignment(obj: FabricObject, alignment: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom', boundingRect: { left: number, top: number, width: number, height: number }): void {
    const objW = (obj.width ?? 0) * (obj.scaleX ?? 1);
    const objH = (obj.height ?? 0) * (obj.scaleY ?? 1);
    switch (alignment) {
      case 'left': obj.set({ left: boundingRect.left + objW / 2 }); break;
      case 'centerH': obj.set({ left: 0 }); break;
      case 'right': obj.set({ left: boundingRect.left + boundingRect.width - objW / 2 }); break;
      case 'top': obj.set({ top: boundingRect.top + objH / 2 }); break;
      case 'centerV': obj.set({ top: 0 }); break;
      case 'bottom': obj.set({ top: boundingRect.top + boundingRect.height - objH / 2 }); break;
    }
  }

  alignSelection(alignment: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom'): void {
    const active = this.canvas?.getActiveObject();
    if (!active || !this.canvas) return;

    const selection = this.getAlignableSelection(active);
    if (!selection || selection.items.length <= 1) return;

    this.pushHistory();

    for (const obj of selection.items) {
      this.applyAlignment(obj, alignment, selection.boundingRect);
      obj.setCoords();
    }

    (active as unknown as { _calcBounds?: (skip?: boolean) => void })._calcBounds?.(true);
    (active as unknown as { setCoords?: () => void }).setCoords?.();

    this.canvas.requestRenderAll();
    this.markDirty();
    this.onBroadcastDraw(true);
  }

  alignLeft(): void { this.alignSelection('left'); }
  alignCenterH(): void { this.alignSelection('centerH'); }
  alignRight(): void { this.alignSelection('right'); }
  alignTop(): void { this.alignSelection('top'); }
  alignCenterV(): void { this.alignSelection('centerV'); }
  alignBottom(): void { this.alignSelection('bottom'); }

  // ── End Grouping ──────────────────────────────────────────────────────────

  zoomIn(): void { this.canvas?.setZoom(Math.min(this.canvas.getZoom() * 1.2, 10)); }
  zoomOut(): void { this.canvas?.setZoom(Math.max(this.canvas.getZoom() / 1.2, 0.1)); }
  resetZoom(): void {
    if (!this.canvas) return;
    this.canvas.setZoom(1);
    this.canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    this.canvas.requestRenderAll(); // P022: batch via rAF
  }

  // ── P096: Minimap / radar view ────────────────────────────────────────────

  /**
   * Snapshot of the current world (scene-space) content bounds and visible
   * viewport rectangle, both in world coordinates. Used by the minimap to
   * draw a scaled-down overview and the viewport indicator.
   *
   * `getBoundingRect()` (no args, Fabric v7) already returns coordinates "in
   * the scene plane" — i.e. unaffected by pan/zoom, same as used by
   * renderShapeTemplateThumbnail() (P095) for template thumbnails.
   * `canvas.vptCoords` is Fabric's own cached { tl, br } of the current
   * viewport in that same scene plane, recomputed on every render.
   *
   * Returns null when the canvas isn't initialised yet.
   */
  getMinimapData(): {
    worldBounds: { left: number; top: number; width: number; height: number } | null;
    viewport: { left: number; top: number; width: number; height: number };
  } | null {
    if (!this.canvas) return null;

    const objects = this.canvas.getObjects();
    let worldBounds: { left: number; top: number; width: number; height: number } | null = null;
    if (objects.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const obj of objects) {
        const rect = obj.getBoundingRect();
        minX = Math.min(minX, rect.left);
        minY = Math.min(minY, rect.top);
        maxX = Math.max(maxX, rect.left + rect.width);
        maxY = Math.max(maxY, rect.top + rect.height);
      }
      // Guard against a single degenerate (zero-size) object producing a
      // zero-width/height bounds box, which would make every scale factor
      // downstream divide by zero.
      worldBounds = {
        left: minX, top: minY,
        width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1),
      };
    }

    const vpt = this.canvas.vptCoords;
    const viewport = vpt
      ? { left: vpt.tl.x, top: vpt.tl.y, width: vpt.br.x - vpt.tl.x, height: vpt.br.y - vpt.tl.y }
      : { left: 0, top: 0, width: this.canvas.getWidth(), height: this.canvas.getHeight() };

    return { worldBounds, viewport };
  }

  /** Re-centers the viewport on a world-space point, keeping the current zoom. */
  panToWorldPoint(worldX: number, worldY: number): void {
    if (!this.canvas) return;
    const zoom = this.canvas.getZoom();
    const vpt = this.canvas.viewportTransform;
    if (!vpt) return;
    const nextVpt = [...vpt] as [number, number, number, number, number, number];
    nextVpt[4] = this.canvas.getWidth() / 2 - worldX * zoom;
    nextVpt[5] = this.canvas.getHeight() / 2 - worldY * zoom;
    this.canvas.setViewportTransform(nextVpt);
    this.canvas.requestRenderAll();
  }

  /**
   * Pans by a screen-pixel delta at the current zoom level. Used by the
   * minimap's keyboard-accessible pan controls (arrow keys move the
   * viewport in fixed increments rather than requiring a mouse drag).
   */
  panByScreenDelta(dx: number, dy: number): void {
    if (!this.canvas) return;
    this.canvas.relativePan(new Point(dx, dy));
    this.canvas.requestRenderAll();
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  // ── Sloppiness / sketch-path helpers ────────────────────────────────────────

  /** Deterministic pseudo-random in range [-1, 1], seeded by id + index.
   * Uses a variation of the "sin hash" technique: multiply the argument by a
   * large constant (9301.7) to break integer periodicity, then use the
   * fractional part of sin(…)·43758.5453 (a common LCG-like scrambler).
   */

  /** Convert a string _id to a stable numeric seed. */

  /** Maximum jitter in CSS pixels for the given sloppiness level. */

  /**
   * Geometry descriptor used to regenerate a shape at a different sloppiness level.
   * Stored as JSON in the custom property `_origGeom`.
   */

  /**
   * Generates a hand-drawn–style SVG path for the given original geometry.
   * Wobble is deterministic (seed) so the shape looks the same every render.
   */

  /**
   * Converts a Rect/Ellipse/Line to a sketch-like Path (artist/cartoonist/doodle),
   * or restores it to its native Fabric shape (architect).
   * Returns the replacement object, or `null` if conversion is not applicable
   * (e.g. arrow groups, text, pen paths without _origGeom).
   * The returned object copies the `_id` of the original so the merge engine
   * continues to track it as the same object.
   */

  private isGroupLike(obj: FabricObject): boolean {
    if ((obj as FabricObject & { _isArrow?: boolean })._isArrow) return false;
    const t = obj.type ?? '';
    return t === 'group' || t === 'activeSelection' || t === 'activeselection';
  }

  private replaceObject(old: FabricObject, replacement: FabricObject): void {
    if (!this.canvas) return;
    const parent = old.group;
    if (parent && parent.type !== 'activeselection' && parent.type !== 'activeSelection') {
      const idx = parent.getObjects().indexOf(old);
      parent.remove(old);
      if (idx !== -1) {
        parent.insertAt(idx, replacement);
      } else {
        parent.add(replacement);
      }
      parent.set('dirty', true);
    } else {
      this.canvas.remove(old);
      this.canvas.add(replacement);
      if (this.canvas.getActiveObject() === old) {
        this.canvas.setActiveObject(replacement);
      } else if (parent && (parent.type === 'activeselection' || parent.type === 'activeSelection')) {
        const activeSel = parent as ActiveSelection;
        activeSel.remove(old);
        activeSel.add(replacement);
      }
    }
  }

  /**
   * Replace the active canvas object with `replacement`, preserving selection.
   * No-op if `canvas` is null.
   */
  private replaceActiveObject(old: FabricObject, replacement: FabricObject): void {
    this.replaceObject(old, replacement);
  }

  /**
   * Stamp `_origGeom` and `_sloppiness` onto a freshly-drawn object so the
   * shape can be regenerated later when the sloppiness setting changes.
   * Called for every shape type in onMouseUp.
   */
  private stampOrigGeomAndSloppiness(obj: FabricObject): void {
    const ext = obj as FabricObject & { _sloppiness?: string; _origGeom?: string };
    if (!ext._origGeom) {
      const g = SnappingManager.origGeomFromObj(obj);
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
  public rebuildArrowGroupInPlace(
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
    const strokeLineCap = (firstChild?.get('strokeLineCap') as CanvasLineCap | undefined) ?? 'round';
    const strokeLineJoin = (firstChild?.get('strokeLineJoin') as CanvasLineJoin | undefined) ?? 'round';
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
      const bodyPath = new Path(pathD, {
        stroke, strokeWidth, fill: 'transparent',
        selectable: false, evented: false,
        strokeLineCap, strokeLineJoin,
        strokeDashArray, opacity, strokeUniform: true,
      });
      ensureObjId(bodyPath);
      shapes.push(bodyPath);
    } else {
      const bodyLine = new Line([x1, y1, x2, y2], {
        stroke, strokeWidth, fill: 'transparent',
        selectable: false, evented: false,
        strokeLineCap, strokeLineJoin,
        strokeDashArray, opacity, strokeUniform: true,
      });
      ensureObjId(bodyLine);
      shapes.push(bodyLine);
    }

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const len = 14, spread = 0.4;
    if (headEnd !== 'none') {
      const head = this.makeArrowhead(x2, y2, angle, len, spread, stroke, strokeWidth, headEnd, opacity);
      if (head) { ensureObjId(head); shapes.push(head); }
    }
    if (headStart !== 'none') {
      const head = this.makeArrowhead(x1, y1, angle + Math.PI, len, spread, stroke, strokeWidth, headStart, opacity);
      if (head) { ensureObjId(head); shapes.push(head); }
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
   * Update a sketch-path connector's visual data in-place without removing or
   * replacing the Path object on the canvas.
   *
   * This is used by applySketchLineEndpointControls' actionHandler during
   * endpoint dragging.  Because the Path object is never removed from the canvas,
   * Fabric.js _currentTransform (drag state) is preserved across mouse-move events.
   */
  private updateSketchPathInPlace(
    pathObj: FabricObject,
    x1: number, y1: number, x2: number, y2: number,
  ): void {
    const sp = pathObj as FabricObject & { _origGeom?: string; _sloppiness?: string };

    // Update origGeom so subsequent snapping / sloppiness changes work correctly.
    sp._origGeom = JSON.stringify({ type: 'line', x1, y1, x2, y2 });

    const sloppiness = (sp._sloppiness as 'architect' | 'artist' | 'cartoonist') ?? 'artist';
    const rebuilt = this.snappingManager.tryConvertToSketch(pathObj, sloppiness);

    // tryConvertToSketch returns a Path for artist/cartoonist/doodle sloppiness.
    // For architect it would return a Line, which cannot be merged into the existing
    // Path in-place.  If tryConvertToSketch returns null or a non-Path (e.g., when
    // roughjs is unavailable or sloppiness is architect), skip the visual update for
    // this frame rather than falling back to rebuildSketchPathForMove: calling
    // canvas.remove() on the active object during a Control actionHandler would trigger
    // endCurrentTransform() in Fabric.js v7 and kill the drag.
    if (!rebuilt || !(rebuilt instanceof Path)) return;

    const existingPath = pathObj as Path;
    const rebuiltPath = rebuilt as Path;

    // Swap path data in-place.  Path.path and the bounding-box properties
    // (width, height, pathOffset) are public instance fields in Fabric.js v7.
    existingPath.path = rebuiltPath.path;
    existingPath.pathOffset = rebuiltPath.pathOffset;
    existingPath.width = rebuiltPath.width;
    existingPath.height = rebuiltPath.height;

    // Reposition to the midpoint of the new endpoints, matching
    // the behavior of tryConvertToSketch / rebuildSketchPathForMove.
    existingPath.set({
      left: (x1 + x2) / 2,
      top: (y1 + y2) / 2,
      originX: 'center',
      originY: 'center',
    });
    existingPath.setCoords();
  }

  /**
   * Apply endpoint-only selection handles to a sketch-path Line (artist /
   * cartoonist sloppiness).  The Path object carries the logical endpoint
   * coordinates in `_origGeom`.  Dragging a handle updates the sketch path so
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

          // Update the Path object's visual data in-place.  Calling canvas.remove()
          // on the active object inside a Control actionHandler triggers
          // endCurrentTransform() in Fabric.js v7 which kills the drag on the
          // first mouse-move.  updateSketchPathInPlace avoids that.
          this.updateSketchPathInPlace(transform.target, nx1, ny1, nx2, ny2);
          return true;
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
  public getDashTypeFromArray(da: number[] | null | undefined): 'solid' | 'dashed' | 'dotted' {
    if (!da || da.length === 0) return 'solid';
    // dotted: first value (dot) ≤ second value (gap), dashed: first > second
    return da[0] <= (da[1] ?? 0) ? 'dotted' : 'dashed';
  }

  public getSloppinessOptions(type: 'architect' | 'artist' | 'cartoonist' | 'doodle'): { strokeLineCap: 'butt' | 'round'; strokeLineJoin: 'miter' | 'round' } {
    if (type === 'architect') return { strokeLineCap: 'butt', strokeLineJoin: 'miter' };
    // artist, cartoonist, and doodle all use rounded joins
    return { strokeLineCap: 'round', strokeLineJoin: 'round' };
  }

  public createFill(type: 'filled' | 'striped' | 'crossed', color: string): string | Pattern {
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
  public snapLineAttachment(line: FabricObject): void {
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
        const anchor = nearestPointOnBounds(x1, y1, bLeft, bTop, bRight, bBottom);
        bestFrom = { id, anchor, anchorOffX: anchor.x - center.x, anchorOffY: anchor.y - center.y, dist: d1 };
      }

      const d2 = distToBox(x2, y2);
      if (d2 < SNAP_RADIUS && (!bestTo || d2 < bestTo.dist)) {
        const anchor = nearestPointOnBounds(x2, y2, bLeft, bTop, bRight, bBottom);
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

  /** Sync the toolbar and properties panel UI to the currently selected object. */
  public syncPropertiesPanelToSelection(): void {
    const manager = new UISyncManager(this);
    manager.syncPropertiesPanelToSelection();
  }

  /**
   * Returns a canonical shape-type string for a Fabric object.
   * This is used to determine which properties-panel sections to show.
   * Sketch paths (artist/cartoonist/doodle) preserve their original shape type
   * via `_origGeom` so that the correct controls remain visible.
   */
  public getObjectShapeType(o: FabricObject): string {
    const oa = o as FabricObject & { _isArrow?: boolean; _isMermaid?: boolean; type?: string; _origGeom?: string };
    if (oa._isMermaid) return 'mermaid';
    if (oa._isArrow) return 'arrow';
    const t = (oa.type as string | undefined) ?? '';
    if (t.toLowerCase() === 'activeselection') return 'activeSelection';
    if (t === 'group') return 'group';
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
    const _isPen     = shapeType === 'pen';
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

    // Grouping & Alignment: visible for ActiveSelection and generic groups
    const isGroupOrSelection = shapeType === 'activeSelection' || shapeType === 'group';
    isGroupOrSelection ? show('pp-group-section') : hide('pp-group-section');
  }
}
