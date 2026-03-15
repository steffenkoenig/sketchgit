// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Fabric.js mock ───────────────────────────────────────────────────────────
// vi.mock() is hoisted before variable declarations, so shared mock state must
// be created with vi.hoisted() to avoid "cannot access before initialization".

const { mockCanvasInstance, canvasEventHandlers, makeFabricObject } = vi.hoisted(() => {
  const canvasEventHandlers: Record<string, (e: unknown) => void> = {};

  function makeFabricObject(opts: Record<string, unknown> = {}) {
    const obj: Record<string, unknown> = {
      selectable: false, evented: false, _id: undefined,
      stroke: '', fill: '', strokeWidth: 1,
      left: 0, top: 0, width: 0, height: 0,
      x1: 0, y1: 0, x2: 10, y2: 10,
      // P022: methods used by the in-place polyline update
      _setPositionDimensions: vi.fn(),
      setCoords: vi.fn(),
      ...opts,
      set: vi.fn(function (this: Record<string, unknown>, key: string | Record<string, unknown>, val?: unknown) {
        if (typeof key === 'object') { Object.assign(this, key); } else { this[key] = val; }
        return this;
      }),
      get: vi.fn(function (this: Record<string, unknown>, key: string) {
        return this[key];
      }),
      getCenterPoint: vi.fn(function (this: Record<string, unknown>) {
        return { x: ((this.left as number) ?? 0) + ((this.width as number) ?? 0) / 2, y: ((this.top as number) ?? 0) + ((this.height as number) ?? 0) / 2 };
      }),
      containsPoint: vi.fn().mockReturnValue(false),
      enterEditing: vi.fn(),
      selectAll: vi.fn(),
      isType: vi.fn().mockReturnValue(false),
    };
    return obj;
  }

  const mockCanvasInstance = {
    on: vi.fn((event: string, handler: (e: unknown) => void) => {
      canvasEventHandlers[event] = handler;
    }),
    add: vi.fn(),
    remove: vi.fn(),
    getObjects: vi.fn().mockReturnValue([]),
    getActiveObject: vi.fn().mockReturnValue(null),
    setActiveObject: vi.fn(),
    renderAll: vi.fn(),
    requestRenderAll: vi.fn(), // P022
    dispose: vi.fn(),
    getZoom: vi.fn().mockReturnValue(1),
    setZoom: vi.fn(),
    zoomToPoint: vi.fn(),
    setDimensions: vi.fn(), // Fabric v7: replaces setWidth/setHeight
    // Fabric v7: loadFromJSON is promise-based (no callback).
    loadFromJSON: vi.fn().mockResolvedValue(undefined),
    toJSON: vi.fn().mockReturnValue({ version: '5', objects: [] }),
    toObject: vi.fn().mockReturnValue({ version: '5', objects: [] }),
    isDrawingMode: false,
    selection: true,
    defaultCursor: 'default',
    viewportTransform: [1, 0, 0, 1, 0, 0] as number[],
    // Layer order methods
    bringObjectToFront: vi.fn(),
    bringObjectForward: vi.fn(),
    sendObjectBackwards: vi.fn(),
    sendObjectToBack: vi.fn(),
  };

  return { mockCanvasInstance, canvasEventHandlers, makeFabricObject };
});

vi.mock('fabric', () => ({
  // Use regular functions (not arrow functions) so they can be called with `new`.
  // In fabric v7 all classes are named exports; there is no `fabric` namespace.
  Canvas: vi.fn(function FabricCanvas() { return mockCanvasInstance; }),
  Rect: vi.fn(function FabricRect(opts: Record<string, unknown>) { return makeFabricObject(opts); }),
  Ellipse: vi.fn(function FabricEllipse(opts: Record<string, unknown>) { return makeFabricObject(opts); }),
  Line: vi.fn(function FabricLine(coords: number[] | Record<string, unknown>, opts: Record<string, unknown> = {}) {
    // The real Fabric.js Line constructor takes ([x1,y1,x2,y2], opts). Extract
    // x1/y1/x2/y2 from the array so that buildArrowGroup reads the correct values.
    const extra = Array.isArray(coords)
      ? { x1: (coords as number[])[0] ?? 0, y1: (coords as number[])[1] ?? 0,
          x2: (coords as number[])[2] ?? 0, y2: (coords as number[])[3] ?? 0 }
      : coords;
    return makeFabricObject({ ...extra, ...(Array.isArray(coords) ? opts : {}) });
  }),
  Path: vi.fn(function FabricPath(_d: string, opts: Record<string, unknown>) { return makeFabricObject(opts); }),
  Polyline: vi.fn(function FabricPolyline(_pts: unknown[], opts: Record<string, unknown>) { return makeFabricObject(opts); }),
  IText: vi.fn(function FabricIText(_t: string, opts: Record<string, unknown>) { return makeFabricObject(opts); }),
  Polygon: vi.fn(function FabricPolygon(_pts: unknown[], opts: Record<string, unknown>) { return makeFabricObject(opts); }),
  Group: vi.fn(function FabricGroup(_items: unknown[], opts: Record<string, unknown>) { return makeFabricObject(opts); }),
  FabricObject: class FabricObject { static customProperties: string[] = []; },
  FabricImage: {
    fromURL: vi.fn(async (_url: string) => ({
      ...makeFabricObject(),
      setSrc: vi.fn().mockResolvedValue(undefined),
    })),
  },
  // Fabric v7: Point is used by zoomToPoint; provide a minimal implementation.
  Point: vi.fn(function MockPoint(this: { x: number; y: number }, x: number, y: number) {
    this.x = x; this.y = y;
  }),
  Pattern: vi.fn(function MockPattern() { return {}; }),
}));

import { Canvas, Rect, Ellipse, Line, Path, Polyline, IText, Polygon, Group, FabricObject } from 'fabric';
import { CanvasEngine } from './canvasEngine';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupDom() {
  document.body.innerHTML = `
    <div id="canvas-wrap" style="width:800px;height:600px"></div>
    <canvas id="c"></canvas>
    <div id="dirty" class="hide"></div>
    <div id="strokeDot"></div>
    <div id="fillDot"></div>
    <button id="tfillToggle">⊡</button>
    <button id="sz1" class="on"></button>
    <button id="sz3"></button>
    <button id="sz5"></button>
    <button id="tselect" class="tbtn"></button>
    <button id="tpen" class="tbtn"></button>
    <button id="trect" class="tbtn on"></button>
    <button id="tellipse" class="tbtn"></button>
    <button id="tline" class="tbtn"></button>
    <button id="tarrow" class="tbtn"></button>
    <button id="ttext" class="tbtn"></button>
    <button id="teraser" class="tbtn"></button>
    <button id="dash-solid" class="on"></button>
    <button id="dash-dashed"></button>
    <button id="dash-dotted"></button>
    <button id="br-sharp" class="on"></button>
    <button id="br-rounded"></button>
    <input id="opacitySlider" type="range" value="100" />
    <span id="opacityValue">100%</span>
    <button id="sloppy-architect" class="on"></button>
    <button id="sloppy-artist"></button>
    <button id="sloppy-cartoonist"></button>
    <button id="sloppy-doodle"></button>
    <button id="fp-filled" class="on"></button>
    <button id="fp-striped"></button>
    <button id="fp-crossed"></button>
    <button id="at-sharp" class="on"></button>
    <button id="at-curved"></button>
    <button id="at-elbow"></button>
    <button id="ahs-none"></button>
    <button id="ahs-open" class="on"></button>
    <button id="ahs-triangle"></button>
    <button id="ahs-triangleoutline"></button>
    <button id="ahe-none"></button>
    <button id="ahe-open" class="on"></button>
    <button id="ahe-triangle"></button>
    <button id="ahe-triangleoutline"></button>
    <input id="linkInput" type="url" />
    <div id="props-panel" class="hide">
      <div id="pp-color-section" class="pp-section"></div>
      <div id="pp-stroke-width-section" class="pp-section"></div>
      <div id="pp-stroke-dash-section" class="pp-section"></div>
      <div id="pp-fill-pattern-section" class="pp-section hide"></div>
      <div id="pp-border-radius-section" class="pp-section hide"></div>
      <div id="pp-sloppiness-section" class="pp-section hide"></div>
      <div id="pp-arrow-type-section" class="pp-section hide"></div>
      <div id="pp-arrow-heads-section" class="pp-section hide"></div>
      <div id="pp-opacity-section" class="pp-section"></div>
      <div id="pp-layer-section" class="pp-section hide"></div>
      <div id="pp-link-section" class="pp-section hide"></div>
    </div>
  `;
}

function makeEngine() {
  const onBroadcastDraw = vi.fn();
  const onBroadcastCursor = vi.fn();
  const engine = new CanvasEngine(onBroadcastDraw, onBroadcastCursor);
  return { engine, onBroadcastDraw, onBroadcastCursor };
}

/** Helper available to all describe blocks. */
function makeMouseEvent(type: string, init?: MouseEventInit) {
  return new MouseEvent(type, init);
}

function resetMocks() {
  // Clear call histories (NOT implementations) on fabric constructors
  [Canvas, Rect, Ellipse, Line, Path, Polyline, IText, Polygon, Group,
  ].forEach((f) => (f as unknown as ReturnType<typeof vi.fn>).mockClear());

  // Make requestAnimationFrame synchronous so tests that fire object:moving
  // can assert on connector-follow results without needing async flushing.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());

  // Clear and restore mockCanvasInstance method state
  mockCanvasInstance.add.mockClear();
  mockCanvasInstance.remove.mockClear();
  mockCanvasInstance.setActiveObject.mockClear();
  mockCanvasInstance.renderAll.mockClear();
  mockCanvasInstance.requestRenderAll.mockClear(); // P022
  mockCanvasInstance.dispose.mockClear();
  mockCanvasInstance.setZoom.mockClear();
  mockCanvasInstance.zoomToPoint.mockClear();
  mockCanvasInstance.setDimensions.mockClear();
  mockCanvasInstance.bringObjectToFront.mockClear();
  mockCanvasInstance.bringObjectForward.mockClear();
  mockCanvasInstance.sendObjectBackwards.mockClear();
  mockCanvasInstance.sendObjectToBack.mockClear();

  mockCanvasInstance.on.mockClear();
  mockCanvasInstance.on.mockImplementation((event: string, handler: (e: unknown) => void) => {
    canvasEventHandlers[event] = handler;
  });
  mockCanvasInstance.getObjects.mockReset();
  mockCanvasInstance.getObjects.mockReturnValue([]);
  mockCanvasInstance.getActiveObject.mockReset();
  mockCanvasInstance.getActiveObject.mockReturnValue(null);
  mockCanvasInstance.getZoom.mockReset();
  mockCanvasInstance.getZoom.mockReturnValue(1);
  mockCanvasInstance.toJSON.mockReset();
  mockCanvasInstance.toJSON.mockReturnValue({ version: '5', objects: [] });
  mockCanvasInstance.toObject.mockReset();
  mockCanvasInstance.toObject.mockReturnValue({ version: '5', objects: [] });
  mockCanvasInstance.loadFromJSON.mockReset();
  // Fabric v7: loadFromJSON is promise-based.
  mockCanvasInstance.loadFromJSON.mockResolvedValue(undefined);

  mockCanvasInstance.isDrawingMode = false;
  mockCanvasInstance.selection = true;
  mockCanvasInstance.defaultCursor = 'default';
  mockCanvasInstance.viewportTransform = [1, 0, 0, 1, 0, 0];

  Object.keys(canvasEventHandlers).forEach((k) => delete canvasEventHandlers[k]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CanvasEngine – lifecycle', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('init() creates a Fabric Canvas and registers event handlers', async () => {
    const { engine } = makeEngine();
    engine.init();
    expect(Canvas).toHaveBeenCalled();
    expect(mockCanvasInstance.on).toHaveBeenCalledWith('mouse:down', expect.any(Function));
    expect(mockCanvasInstance.on).toHaveBeenCalledWith('mouse:move', expect.any(Function));
    expect(mockCanvasInstance.on).toHaveBeenCalledWith('mouse:up', expect.any(Function));
  });

  it('init() does nothing when canvas-wrap is absent', async () => {
    document.body.innerHTML = '';
    const { engine } = makeEngine();
    (Canvas as unknown as ReturnType<typeof vi.fn>).mockClear();
    engine.init();
    expect(Canvas).not.toHaveBeenCalled();
  });

  it('destroy() calls canvas.dispose() and removes window listeners', () => {
    const { engine } = makeEngine();
    engine.init();
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    engine.destroy();
    expect(mockCanvasInstance.dispose).toHaveBeenCalled();
    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(engine.canvas).toBeNull();
  });

  it('destroy() is safe to call multiple times', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.destroy();
    expect(() => engine.destroy()).not.toThrow();
  });
});

describe('CanvasEngine – dirty state', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('markDirty() sets isDirty and removes "hide" class from #dirty', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.markDirty();
    expect(engine.isDirty).toBe(true);
    expect(document.getElementById('dirty')!.classList.contains('hide')).toBe(false);
  });

  it('clearDirty() resets isDirty and adds "hide" class back', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.markDirty();
    engine.clearDirty();
    expect(engine.isDirty).toBe(false);
    expect(document.getElementById('dirty')!.classList.contains('hide')).toBe(true);
  });

  it('onFirstDirty is called once when canvas first becomes dirty', () => {
    const { engine } = makeEngine();
    engine.init();
    const onFirstDirty = vi.fn();
    engine.onFirstDirty = onFirstDirty;
    engine.markDirty();
    expect(onFirstDirty).toHaveBeenCalledOnce();
    // Calling markDirty again should NOT fire the callback a second time
    engine.markDirty();
    expect(onFirstDirty).toHaveBeenCalledOnce();
  });

  it('onFirstDirty fires again after clearDirty() resets the dirty flag', () => {
    const { engine } = makeEngine();
    engine.init();
    const onFirstDirty = vi.fn();
    engine.onFirstDirty = onFirstDirty;
    engine.markDirty();
    engine.clearDirty();
    engine.markDirty();
    expect(onFirstDirty).toHaveBeenCalledTimes(2);
  });

  it('onFirstDirty is not called when the callback is not set', () => {
    const { engine } = makeEngine();
    engine.init();
    // No onFirstDirty set – should not throw
    expect(() => engine.markDirty()).not.toThrow();
  });
});

describe('CanvasEngine – serialisation', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('getCanvasData() returns a JSON string', () => {
    const { engine } = makeEngine();
    engine.init();
    const data = engine.getCanvasData();
    expect(() => JSON.parse(data)).not.toThrow();
  });

  it('getCanvasData() calls canvas.toObject (not toJSON) to include custom properties', () => {
    // Regression: canvas.toJSON() in Fabric.js v7 ignores propertiesToInclude,
    // so _id was never written to committed JSON → merge engine saw empty maps
    // → every merge produced an empty canvas.
    const { engine } = makeEngine();
    engine.init();
    engine.getCanvasData();
    expect(mockCanvasInstance.toObject).toHaveBeenCalledWith([
      '_isArrow', '_id', '_link', '_fillPattern', '_fillColor',
      '_arrowHeadStart', '_arrowHeadEnd', '_arrowType',
      '_sloppiness', '_origGeom',
      '_attachedFrom', '_attachedTo',
      '_attachedFromAnchorX', '_attachedFromAnchorY', '_attachedToAnchorX', '_attachedToAnchorY',
      '_x1', '_y1', '_x2', '_y2',
      '_isMermaid', '_mermaidCode',
    ]);
    expect(mockCanvasInstance.toJSON).not.toHaveBeenCalled();
  });

  it('init() registers _id and _isArrow in FabricObject.customProperties', () => {
    // Regression: FabricObject.customProperties is the Fabric v7 mechanism that
    // causes toJSON() to include custom fields even when called without args.
    const { engine } = makeEngine();
    (FabricObject as unknown as { customProperties: string[] }).customProperties = [];
    engine.init();
    expect((FabricObject as unknown as { customProperties: string[] }).customProperties).toContain('_id');
    expect((FabricObject as unknown as { customProperties: string[] }).customProperties).toContain('_isArrow');
  });

  it('loadCanvasData() calls canvas.loadFromJSON', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.loadCanvasData(JSON.stringify({ version: '5', objects: [] }));
    expect(mockCanvasInstance.loadFromJSON).toHaveBeenCalled();
  });
});

describe('CanvasEngine – tool selection', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('setTool("select") enables canvas.selection', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setTool('select');
    expect(engine.currentTool).toBe('select');
    expect(mockCanvasInstance.selection).toBe(true);
  });

  it('setTool("pen") disables canvas.selection', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setTool('pen');
    expect(engine.currentTool).toBe('pen');
    expect(mockCanvasInstance.selection).toBe(false);
  });

  it('setTool("eraser") sets crosshair cursor', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setTool('eraser');
    expect(mockCanvasInstance.defaultCursor).toBe('crosshair');
  });

  it('setTool marks the correct toolbar button as active', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setTool('pen');
    expect(document.getElementById('tpen')!.classList.contains('on')).toBe(true);
    expect(document.getElementById('trect')!.classList.contains('on')).toBe(false);
  });
});

describe('CanvasEngine – style controls', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('updateStrokeColor() updates strokeColor and #strokeDot background', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.updateStrokeColor('#ff0000');
    expect(engine.strokeColor).toBe('#ff0000');
    // jsdom normalises hex colours to rgb() in element.style
    expect(document.getElementById('strokeDot')!.style.background).toMatch(/255.*0.*0/);
  });

  it('updateStrokeColor() applies color to the active canvas object', () => {
    const activeObj = makeFabricObject();
    mockCanvasInstance.getActiveObject.mockReturnValue(activeObj);
    const { engine } = makeEngine();
    engine.init();
    engine.updateStrokeColor('#00ff00');
    expect(activeObj.set).toHaveBeenCalledWith('stroke', '#00ff00');
  });

  it('updateFillColor() updates fillColor and #fillDot background', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.updateFillColor('#0000ff');
    expect(engine.fillColor).toBe('#0000ff');
    // jsdom normalises hex colours to rgb() in element.style
    expect(document.getElementById('fillDot')!.style.background).toMatch(/0.*0.*255/);
  });

  it('updateFillColor() applies fill to the active canvas object', () => {
    const activeObj = makeFabricObject();
    mockCanvasInstance.getActiveObject.mockReturnValue(activeObj);
    const { engine } = makeEngine();
    engine.init();
    engine.updateFillColor('#purple');
    expect(activeObj.set).toHaveBeenCalledWith('fill', '#purple');
  });

  it('toggleFill() toggles fillEnabled and updates button text', () => {
    const { engine } = makeEngine();
    engine.init();
    expect(engine.fillEnabled).toBe(false);
    engine.toggleFill();
    expect(engine.fillEnabled).toBe(true);
    expect(document.getElementById('tfillToggle')!.textContent).toBe('⊠');
    engine.toggleFill();
    expect(engine.fillEnabled).toBe(false);
    expect(document.getElementById('tfillToggle')!.textContent).toBe('⊡');
  });

  it('setStrokeWidth(1.5) activates #sz1', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setStrokeWidth(1.5);
    expect(document.getElementById('sz1')!.classList.contains('on')).toBe(true);
  });

  it('setStrokeWidth(3) activates #sz3', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setStrokeWidth(3);
    expect(engine.strokeWidth).toBe(3);
    expect(document.getElementById('sz3')!.classList.contains('on')).toBe(true);
  });

  it('setStrokeWidth(5) activates #sz5', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setStrokeWidth(5);
    expect(document.getElementById('sz5')!.classList.contains('on')).toBe(true);
  });
});

describe('CanvasEngine – zoom controls', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('zoomIn() multiplies current zoom by 1.2', () => {
    mockCanvasInstance.getZoom.mockReturnValue(1);
    const { engine } = makeEngine();
    engine.init();
    engine.zoomIn();
    expect(mockCanvasInstance.setZoom).toHaveBeenCalledWith(1.2);
  });

  it('zoomOut() divides current zoom by 1.2', () => {
    mockCanvasInstance.getZoom.mockReturnValue(1);
    const { engine } = makeEngine();
    engine.init();
    engine.zoomOut();
    expect(mockCanvasInstance.setZoom).toHaveBeenCalledWith(1 / 1.2);
  });

  it('resetZoom() sets zoom=1 and resets viewportTransform', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.resetZoom();
    expect(mockCanvasInstance.setZoom).toHaveBeenCalledWith(1);
    expect(mockCanvasInstance.viewportTransform).toEqual([1, 0, 0, 1, 0, 0]);
    // P022: resetZoom uses requestRenderAll (batched) instead of renderAll
    expect(mockCanvasInstance.requestRenderAll).toHaveBeenCalled();
  });
});

describe('CanvasEngine – keyboard shortcuts', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  function pressKey(engine: CanvasEngine, key: string, extra: Record<string, unknown> = {}) {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, ...extra });
    // onKey reads e.target.tagName — provide document.body so it doesn't crash
    Object.defineProperty(e, 'target', { value: document.body, configurable: true });
    (engine as unknown as { onKey: (e: KeyboardEvent) => void }).onKey(e);
  }

  it('s → select', () => { const { engine } = makeEngine(); engine.init(); pressKey(engine, 's'); expect(engine.currentTool).toBe('select'); });
  it('p → pen',    () => { const { engine } = makeEngine(); engine.init(); pressKey(engine, 'p'); expect(engine.currentTool).toBe('pen'); });
  it('r → rect',   () => { const { engine } = makeEngine(); engine.init(); pressKey(engine, 'r'); expect(engine.currentTool).toBe('rect'); });
  it('e → ellipse',() => { const { engine } = makeEngine(); engine.init(); pressKey(engine, 'e'); expect(engine.currentTool).toBe('ellipse'); });
  it('l → line',   () => { const { engine } = makeEngine(); engine.init(); pressKey(engine, 'l'); expect(engine.currentTool).toBe('line'); });
  it('a → arrow',  () => { const { engine } = makeEngine(); engine.init(); pressKey(engine, 'a'); expect(engine.currentTool).toBe('arrow'); });
  it('t → text',   () => { const { engine } = makeEngine(); engine.init(); pressKey(engine, 't'); expect(engine.currentTool).toBe('text'); });
  it('x → eraser', () => { const { engine } = makeEngine(); engine.init(); pressKey(engine, 'x'); expect(engine.currentTool).toBe('eraser'); });

  it('+ → zoomIn', () => {
    const { engine } = makeEngine();
    engine.init();
    pressKey(engine, '+');
    expect(mockCanvasInstance.setZoom).toHaveBeenCalled();
  });

  it('= → zoomIn (numpad)', () => {
    const { engine } = makeEngine();
    engine.init();
    pressKey(engine, '=');
    expect(mockCanvasInstance.setZoom).toHaveBeenCalled();
  });

  it('- → zoomOut', () => {
    const { engine } = makeEngine();
    engine.init();
    pressKey(engine, '-');
    expect(mockCanvasInstance.setZoom).toHaveBeenCalled();
  });

  it('0 → resetZoom', () => {
    const { engine } = makeEngine();
    engine.init();
    pressKey(engine, '0');
    expect(mockCanvasInstance.setZoom).toHaveBeenCalledWith(1);
  });

  it('Delete removes active object and broadcasts', () => {
    const activeObj = makeFabricObject();
    mockCanvasInstance.getActiveObject.mockReturnValue(activeObj);
    const { engine, onBroadcastDraw } = makeEngine();
    engine.init();
    pressKey(engine, 'Delete');
    expect(mockCanvasInstance.remove).toHaveBeenCalledWith(activeObj);
    expect(onBroadcastDraw).toHaveBeenCalled();
  });

  it('Backspace removes active object', () => {
    const activeObj = makeFabricObject();
    mockCanvasInstance.getActiveObject.mockReturnValue(activeObj);
    const { engine } = makeEngine();
    engine.init();
    pressKey(engine, 'Backspace');
    expect(mockCanvasInstance.remove).toHaveBeenCalledWith(activeObj);
  });

  it('ignores keystrokes in INPUT elements', () => {
    const { engine } = makeEngine();
    engine.init();
    const input = document.createElement('input');
    document.body.appendChild(input);
    const e = new KeyboardEvent('keydown', { key: 'p', bubbles: true });
    Object.defineProperty(e, 'target', { value: input });
    (engine as unknown as { onKey: (e: KeyboardEvent) => void }).onKey(e);
    expect(engine.currentTool).not.toBe('pen');
  });

  it('ignores keystrokes in TEXTAREA elements', () => {
    const { engine } = makeEngine();
    engine.init();
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    const e = new KeyboardEvent('keydown', { key: 'p', bubbles: true });
    Object.defineProperty(e, 'target', { value: ta });
    (engine as unknown as { onKey: (e: KeyboardEvent) => void }).onKey(e);
    expect(engine.currentTool).not.toBe('pen');
  });
});

describe('CanvasEngine – mouse events', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  // Fabric v7: events include scenePoint (replaces canvas.getPointer(e.e))
  const defaultScenePoint = { x: 10, y: 20 };

  function fireMouseDown(tool: string, engine: CanvasEngine, scenePoint = defaultScenePoint) {
    engine.setTool(tool);
    canvasEventHandlers['mouse:down']?.({ e: makeMouseEvent('mousedown'), scenePoint });
  }

  it('mouse:down with "select" does not add any object', () => {
    const { engine } = makeEngine();
    engine.init();
    fireMouseDown('select', engine);
    expect(mockCanvasInstance.add).not.toHaveBeenCalled();
  });

  it('mouse:down with "rect" creates a Rect', async () => {
    const { engine } = makeEngine();
    engine.init();
    fireMouseDown('rect', engine);
    expect(Rect).toHaveBeenCalled();
    expect(mockCanvasInstance.add).toHaveBeenCalled();
  });

  it('mouse:down with "ellipse" creates an Ellipse', async () => {
    const { engine } = makeEngine();
    engine.init();
    fireMouseDown('ellipse', engine);
    expect(Ellipse).toHaveBeenCalled();
  });

  it('mouse:down with "line" creates a Line', async () => {
    const { engine } = makeEngine();
    engine.init();
    fireMouseDown('line', engine);
    expect(Line).toHaveBeenCalled();
  });

  it('mouse:down with "arrow" creates a Line (arrow variant)', async () => {
    const { engine } = makeEngine();
    engine.init();
    fireMouseDown('arrow', engine);
    expect(Line).toHaveBeenCalled();
  });

  it('mouse:down with "text" creates IText and enters editing', async () => {
    (IText as unknown as ReturnType<typeof vi.fn>).mockClear();
    const { engine } = makeEngine();
    engine.init();
    fireMouseDown('text', engine);
    expect(IText).toHaveBeenCalled();
    const iTextInst = (IText as unknown as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value;
    expect(iTextInst?.enterEditing).toHaveBeenCalled();
  });

  it('mouse:down with "pen" starts path drawing (uses Polyline for in-progress stroke)', async () => {
    (Polyline as unknown as ReturnType<typeof vi.fn>).mockClear();
    const { engine } = makeEngine();
    engine.init();
    fireMouseDown('pen', engine);
    // P022: pen mousedown now creates a Polyline (updated in-place) instead of a Path
    expect(Polyline).toHaveBeenCalled();
  });

  it('mouse:move broadcasts cursor position', () => {
    const { engine, onBroadcastCursor } = makeEngine();
    engine.init();
    canvasEventHandlers['mouse:move']?.({ e: makeMouseEvent('mousemove'), scenePoint: defaultScenePoint });
    expect(onBroadcastCursor).toHaveBeenCalled();
  });

  it('mouse:move with "eraser" removes objects at pointer', () => {
    const obj = makeFabricObject();
    (obj.containsPoint as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
    mockCanvasInstance.getObjects.mockReturnValue([obj]);
    const { engine } = makeEngine();
    engine.init();
    engine.setTool('eraser');
    canvasEventHandlers['mouse:down']?.({ e: makeMouseEvent('mousedown'), scenePoint: defaultScenePoint });
    canvasEventHandlers['mouse:move']?.({ e: makeMouseEvent('mousemove'), scenePoint: defaultScenePoint });
    expect(mockCanvasInstance.remove).toHaveBeenCalledWith(obj);
  });

  it('mouse:move with "pen" updates the polyline in-place (no new Path created)', async () => {
    (Path as unknown as ReturnType<typeof vi.fn>).mockClear();
    (Polyline as unknown as ReturnType<typeof vi.fn>).mockClear();
    const { engine } = makeEngine();
    engine.init();
    fireMouseDown('pen', engine);
    expect(Polyline).toHaveBeenCalledTimes(1); // one polyline created on mousedown
    canvasEventHandlers['mouse:move']?.({ e: makeMouseEvent('mousemove'), scenePoint: defaultScenePoint });
    // P022: no new Path or Polyline created on mousemove – update is in-place
    expect(Path).not.toHaveBeenCalled();
    expect(Polyline).toHaveBeenCalledTimes(1); // still only 1
    // The canvas should request a re-render
    expect(mockCanvasInstance.requestRenderAll).toHaveBeenCalled();
  });

  it('mouse:up finalises a shape that was dragged far enough', () => {
    const { engine, onBroadcastDraw } = makeEngine();
    engine.init();
    fireMouseDown('rect', engine, { x: 10, y: 20 });
    // mouseup at a different position (far enough to create a non-zero shape)
    canvasEventHandlers['mouse:up']?.({ e: makeMouseEvent('mouseup'), scenePoint: { x: 100, y: 120 } });
    expect(onBroadcastDraw).toHaveBeenCalled();
  });

  it('mouse:up removes a zero-size shape (accidental click)', () => {
    const { engine } = makeEngine();
    engine.init();
    // mousedown and mouseup at same position
    fireMouseDown('rect', engine, defaultScenePoint);
    canvasEventHandlers['mouse:up']?.({ e: makeMouseEvent('mouseup'), scenePoint: defaultScenePoint });
    expect(mockCanvasInstance.remove).toHaveBeenCalled();
  });

  it('mouse:up keeps canvas.selection=false for non-select drawing tools', () => {
    // After completing a drawing gesture canvas.selection must stay false so that
    // subsequent strokes with the same drawing tool do not trigger Fabric's
    // rubber-band selection, which would conflict with shape creation.
    const { engine } = makeEngine();
    engine.init();
    fireMouseDown('rect', engine, { x: 10, y: 20 });
    canvasEventHandlers['mouse:up']?.({ e: makeMouseEvent('mouseup'), scenePoint: { x: 100, y: 120 } });
    expect(mockCanvasInstance.selection).toBe(false);
  });

  it('mouse:up restores canvas.selection=true when tool is "select"', () => {
    // If somehow a mousedown/up cycle runs while the select tool is active
    // (e.g. after switching tools mid-gesture), selection mode should stay on.
    const { engine } = makeEngine();
    engine.init();
    engine.setTool('select');
    // Manually force isDrawing so mouse:up is not a no-op
    (engine as unknown as { isDrawing: boolean }).isDrawing = true;
    canvasEventHandlers['mouse:up']?.({ e: makeMouseEvent('mouseup'), scenePoint: defaultScenePoint });
    expect(mockCanvasInstance.selection).toBe(true);
  });

  it('mouse:up finalises a pen stroke (converts polyline to permanent Path)', () => {
    (Path as unknown as ReturnType<typeof vi.fn>).mockClear();
    const { engine, onBroadcastDraw } = makeEngine();
    engine.init();
    fireMouseDown('pen', engine);
    canvasEventHandlers['mouse:move']?.({ e: makeMouseEvent('mousemove'), scenePoint: { x: 50, y: 60 } });
    canvasEventHandlers['mouse:up']?.({ e: makeMouseEvent('mouseup'), scenePoint: { x: 50, y: 60 } });
    // P022: mouseup creates one permanent Path from accumulated points
    expect(Path).toHaveBeenCalledTimes(1);
    expect(onBroadcastDraw).toHaveBeenCalled();
  });

  it('mouse:up keeps canvas.selection=false after pen stroke (non-select tool)', () => {
    const { engine } = makeEngine();
    engine.init();
    fireMouseDown('pen', engine);
    canvasEventHandlers['mouse:move']?.({ e: makeMouseEvent('mousemove'), scenePoint: { x: 50, y: 60 } });
    canvasEventHandlers['mouse:up']?.({ e: makeMouseEvent('mouseup'), scenePoint: { x: 50, y: 60 } });
    expect(mockCanvasInstance.selection).toBe(false);
  });

  it('mouse:down on an existing object with a drawing tool does NOT create a new shape', () => {
    // Regression: when a drawing tool was active and the user clicked on an
    // existing object (to move/resize it), a new shape was incorrectly created.
    // The fix: if e.target is set (and tool !== eraser), onMouseDown returns early.
    const existingObj = makeFabricObject();
    const { engine } = makeEngine();
    engine.init();
    engine.setTool('rect');
    (Rect as unknown as ReturnType<typeof vi.fn>).mockClear();
    mockCanvasInstance.add.mockClear();
    const e = engine as unknown as { undoStack: string[]; redoStack: string[] };
    const stackLengthBefore = e.undoStack.length;
    // Fire mouse:down with a target (clicking on existing object)
    canvasEventHandlers['mouse:down']?.({
      e: makeMouseEvent('mousedown'),
      scenePoint: defaultScenePoint,
      target: existingObj,
    });
    expect(Rect).not.toHaveBeenCalled();
    expect(mockCanvasInstance.add).not.toHaveBeenCalled();
    // pushHistory() must also be skipped so the undo stack is not polluted
    expect(e.undoStack.length).toBe(stackLengthBefore);
  });

  it('mouse:down on an existing object with "eraser" tool STILL sets isDrawing (eraser acts on objects)', () => {
    // The eraser must NOT be affected by the e.target guard — its whole purpose
    // is to act on existing objects.
    const existingObj = makeFabricObject();
    (existingObj.containsPoint as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
    mockCanvasInstance.getObjects.mockReturnValue([existingObj]);
    const { engine } = makeEngine();
    engine.init();
    engine.setTool('eraser');
    // mousedown over an existing object
    canvasEventHandlers['mouse:down']?.({
      e: makeMouseEvent('mousedown'),
      scenePoint: defaultScenePoint,
      target: existingObj,
    });
    // mousemove should erase the object because isDrawing was set
    canvasEventHandlers['mouse:move']?.({ e: makeMouseEvent('mousemove'), scenePoint: defaultScenePoint });
    expect(mockCanvasInstance.remove).toHaveBeenCalledWith(existingObj);
  });

  it('mouse:wheel zooms the canvas', () => {
    const { engine } = makeEngine();
    engine.init();
    const wheelEvent = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    canvasEventHandlers['mouse:wheel']?.({ e: wheelEvent, scenePoint: defaultScenePoint });
    expect(mockCanvasInstance.zoomToPoint).toHaveBeenCalled();
  });

  it('object:modified marks dirty and broadcasts immediately', () => {
    const { engine, onBroadcastDraw } = makeEngine();
    engine.init();
    canvasEventHandlers['object:modified']?.({});
    expect(engine.isDirty).toBe(true);
    expect(onBroadcastDraw).toHaveBeenCalledWith(true);
  });
});

describe('CanvasEngine – undo/redo (P037)', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('undo() with empty stack is a no-op (no crash)', () => {
    const { engine } = makeEngine();
    engine.init();
    expect(() => engine.undo()).not.toThrow();
  });

  it('redo() with empty stack is a no-op (no crash)', () => {
    const { engine } = makeEngine();
    engine.init();
    expect(() => engine.redo()).not.toThrow();
  });

  it('pushHistory via mousedown pushes to undoStack and clears redoStack', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setTool('rect');
    // mousedown calls pushHistory internally
    canvasEventHandlers['mouse:down']?.({ e: makeMouseEvent('mousedown'), scenePoint: { x: 10, y: 10 } });
    // Access undoStack via type assertion to test private state
    const e = engine as unknown as { undoStack: string[]; redoStack: string[] };
    expect(e.undoStack.length).toBe(1);
    expect(e.redoStack.length).toBe(0);
  });

  it('undo() pops from undoStack and pushes current state to redoStack', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setTool('rect');
    // Push a history entry
    canvasEventHandlers['mouse:down']?.({ e: makeMouseEvent('mousedown'), scenePoint: { x: 10, y: 10 } });
    const e = engine as unknown as { undoStack: string[]; redoStack: string[] };
    expect(e.undoStack.length).toBe(1);
    engine.undo();
    expect(e.undoStack.length).toBe(0);
    expect(e.redoStack.length).toBe(1);
    expect(mockCanvasInstance.loadFromJSON).toHaveBeenCalled();
  });

  it('redo() pops from redoStack and pushes current state to undoStack', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setTool('rect');
    canvasEventHandlers['mouse:down']?.({ e: makeMouseEvent('mousedown'), scenePoint: { x: 10, y: 10 } });
    const e = engine as unknown as { undoStack: string[]; redoStack: string[] };
    engine.undo();
    expect(e.redoStack.length).toBe(1);
    mockCanvasInstance.loadFromJSON.mockClear();
    engine.redo();
    expect(e.redoStack.length).toBe(0);
    expect(e.undoStack.length).toBe(1);
    expect(mockCanvasInstance.loadFromJSON).toHaveBeenCalled();
  });

  it('new action after undo clears redoStack', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setTool('rect');
    canvasEventHandlers['mouse:down']?.({ e: makeMouseEvent('mousedown'), scenePoint: { x: 10, y: 10 } });
    engine.undo();
    const e = engine as unknown as { undoStack: string[]; redoStack: string[] };
    expect(e.redoStack.length).toBe(1);
    // Another mousedown clears redo
    canvasEventHandlers['mouse:down']?.({ e: makeMouseEvent('mousedown'), scenePoint: { x: 20, y: 20 } });
    expect(e.redoStack.length).toBe(0);
  });

  it('stack eviction: after MAX_HISTORY+1 pushes stack length stays at MAX_HISTORY', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setTool('rect');
    const e = engine as unknown as { undoStack: string[]; redoStack: string[]; MAX_HISTORY: number };
    const limit = e.MAX_HISTORY;
    for (let i = 0; i < limit + 5; i++) {
      canvasEventHandlers['mouse:down']?.({ e: makeMouseEvent('mousedown'), scenePoint: { x: i, y: i } });
    }
    expect(e.undoStack.length).toBeLessThanOrEqual(limit);
  });

  it('loadCanvasData clears both stacks', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setTool('rect');
    canvasEventHandlers['mouse:down']?.({ e: makeMouseEvent('mousedown'), scenePoint: { x: 10, y: 10 } });
    const e = engine as unknown as { undoStack: string[]; redoStack: string[] };
    expect(e.undoStack.length).toBeGreaterThan(0);
    engine.loadCanvasData(JSON.stringify({ version: '5', objects: [] }));
    expect(e.undoStack.length).toBe(0);
    expect(e.redoStack.length).toBe(0);
  });
});

// ─── Helpers for touch event simulation ───────────────────────────────────────

/** Create a minimal Touch-like object accepted by our handler. */
function makeTouch(clientX: number, clientY: number): Touch {
  return { clientX, clientY, identifier: Math.random(), target: document.body } as unknown as Touch;
}

/** Build a synthetic TouchEvent with the given touches list. */
function makeTouchEvent(type: string, touches: Touch[], opts: EventInit = {}): TouchEvent {
  // jsdom doesn't support TouchEvent in all versions; use a plain Event cast when needed.
  try {
    return new TouchEvent(type, { touches, changedTouches: touches, ...opts });
  } catch {
    const ev = new Event(type, { cancelable: true, ...opts }) as unknown as TouchEvent;
    Object.defineProperty(ev, 'touches', { value: touches });
    Object.defineProperty(ev, 'changedTouches', { value: touches });
    return ev;
  }
}

// ─── Pinch-to-zoom tests (P085) ───────────────────────────────────────────────

describe('CanvasEngine – pinch-to-zoom (P085)', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  // ── Listener registration ──────────────────────────────────────────────────

  it('init() registers touchstart and touchmove listeners on canvas-wrap', () => {
    const wrap = document.getElementById('canvas-wrap')!;
    const addSpy = vi.spyOn(wrap, 'addEventListener');
    const { engine } = makeEngine();
    engine.init();
    expect(addSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), { passive: false });
    expect(addSpy).toHaveBeenCalledWith('touchmove', expect.any(Function), { passive: false });
  });

  it('destroy() removes touchstart and touchmove listeners from canvas-wrap', () => {
    const wrap = document.getElementById('canvas-wrap')!;
    const removeSpy = vi.spyOn(wrap, 'removeEventListener');
    const { engine } = makeEngine();
    engine.init();
    engine.destroy();
    expect(removeSpy).toHaveBeenCalledWith('touchstart', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('touchmove', expect.any(Function));
  });

  // ── Gesture math ───────────────────────────────────────────────────────────

  it('two-finger pinch out doubles zoom when finger distance doubles', () => {
    const { engine } = makeEngine();
    engine.init();
    mockCanvasInstance.getZoom.mockReturnValue(1);

    const wrap = document.getElementById('canvas-wrap')!;
    // Fingers start 100 px apart.
    const startTouches = [makeTouch(0, 0), makeTouch(100, 0)];
    wrap.dispatchEvent(makeTouchEvent('touchstart', startTouches));

    // Fingers move to 200 px apart → scale = 2 → zoom = 1 * 2 = 2.
    const moveTouches = [makeTouch(0, 0), makeTouch(200, 0)];
    wrap.dispatchEvent(makeTouchEvent('touchmove', moveTouches, { cancelable: true }));

    expect(mockCanvasInstance.zoomToPoint).toHaveBeenCalled();
    const [, zoomArg] = mockCanvasInstance.zoomToPoint.mock.calls[0] as [unknown, number];
    expect(zoomArg).toBeCloseTo(2, 5);
  });

  it('two-finger pinch in halves zoom when finger distance halves', () => {
    const { engine } = makeEngine();
    engine.init();
    mockCanvasInstance.getZoom.mockReturnValue(2);

    const wrap = document.getElementById('canvas-wrap')!;
    const startTouches = [makeTouch(0, 0), makeTouch(200, 0)];
    wrap.dispatchEvent(makeTouchEvent('touchstart', startTouches));

    // Fingers move to 100 px apart → scale = 0.5 → zoom = 2 * 0.5 = 1.
    const moveTouches = [makeTouch(0, 0), makeTouch(100, 0)];
    wrap.dispatchEvent(makeTouchEvent('touchmove', moveTouches, { cancelable: true }));

    expect(mockCanvasInstance.zoomToPoint).toHaveBeenCalled();
    const [, zoomArg] = mockCanvasInstance.zoomToPoint.mock.calls[0] as [unknown, number];
    expect(zoomArg).toBeCloseTo(1, 5);
  });

  it('zoom is clamped to 0.1 at the minimum', () => {
    const { engine } = makeEngine();
    engine.init();
    mockCanvasInstance.getZoom.mockReturnValue(0.11);

    const wrap = document.getElementById('canvas-wrap')!;
    // Start 200 px apart.
    const startTouches = [makeTouch(0, 0), makeTouch(200, 0)];
    wrap.dispatchEvent(makeTouchEvent('touchstart', startTouches));

    // Move to near-zero distance → scale ≈ 0 → raw zoom < 0.1 → clamped to 0.1.
    const moveTouches = [makeTouch(0, 0), makeTouch(11, 0)];
    wrap.dispatchEvent(makeTouchEvent('touchmove', moveTouches, { cancelable: true }));

    expect(mockCanvasInstance.zoomToPoint).toHaveBeenCalled();
    const [, zoomArg] = mockCanvasInstance.zoomToPoint.mock.calls[0] as [unknown, number];
    expect(zoomArg).toBeGreaterThanOrEqual(0.1);
  });

  it('zoom is clamped to 10 at the maximum', () => {
    const { engine } = makeEngine();
    engine.init();
    mockCanvasInstance.getZoom.mockReturnValue(9.5);

    const wrap = document.getElementById('canvas-wrap')!;
    // Start 10 px apart.
    const startTouches = [makeTouch(0, 0), makeTouch(10, 0)];
    wrap.dispatchEvent(makeTouchEvent('touchstart', startTouches));

    // Move to 1000 px apart → scale = 100 → raw zoom = 950 → clamped to 10.
    const moveTouches = [makeTouch(0, 0), makeTouch(1000, 0)];
    wrap.dispatchEvent(makeTouchEvent('touchmove', moveTouches, { cancelable: true }));

    expect(mockCanvasInstance.zoomToPoint).toHaveBeenCalled();
    const [, zoomArg] = mockCanvasInstance.zoomToPoint.mock.calls[0] as [unknown, number];
    expect(zoomArg).toBeLessThanOrEqual(10);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('touchstart with fingers < 10 px apart does NOT initiate pinch (prevents div-by-zero)', () => {
    const { engine } = makeEngine();
    engine.init();

    const wrap = document.getElementById('canvas-wrap')!;
    // Fingers only 5 px apart – below the 10 px epsilon threshold.
    const startTouches = [makeTouch(0, 0), makeTouch(5, 0)];
    wrap.dispatchEvent(makeTouchEvent('touchstart', startTouches));

    // A subsequent move should not call zoomToPoint (touchStartDist is null).
    const moveTouches = [makeTouch(0, 0), makeTouch(200, 0)];
    wrap.dispatchEvent(makeTouchEvent('touchmove', moveTouches, { cancelable: true }));

    expect(mockCanvasInstance.zoomToPoint).not.toHaveBeenCalled();
  });

  it('single-touch start resets pinch state so a following two-finger move is ignored', () => {
    const { engine } = makeEngine();
    engine.init();

    const wrap = document.getElementById('canvas-wrap')!;
    // Valid two-finger start, then interrupted by a single-touch start.
    const twoTouches = [makeTouch(0, 0), makeTouch(100, 0)];
    wrap.dispatchEvent(makeTouchEvent('touchstart', twoTouches));
    const oneTouches = [makeTouch(50, 50)];
    wrap.dispatchEvent(makeTouchEvent('touchstart', oneTouches));

    // Now attempt a two-finger move – should be a no-op since state was reset.
    const moveTouches = [makeTouch(0, 0), makeTouch(200, 0)];
    wrap.dispatchEvent(makeTouchEvent('touchmove', moveTouches, { cancelable: true }));

    expect(mockCanvasInstance.zoomToPoint).not.toHaveBeenCalled();
  });

  it('zoomToPoint is called centred on the midpoint of the two touch points', () => {
    const { engine } = makeEngine();
    engine.init();
    mockCanvasInstance.getZoom.mockReturnValue(1);

    const wrap = document.getElementById('canvas-wrap')!;
    // Fake the wrap's bounding rect so offset calculation is deterministic.
    vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue(
      { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) },
    );

    const startTouches = [makeTouch(0, 0), makeTouch(200, 0)];
    wrap.dispatchEvent(makeTouchEvent('touchstart', startTouches));

    const moveTouches = [makeTouch(0, 0), makeTouch(400, 0)];
    wrap.dispatchEvent(makeTouchEvent('touchmove', moveTouches, { cancelable: true }));

    expect(mockCanvasInstance.zoomToPoint).toHaveBeenCalled();
    // midX = (0 + 400) / 2 = 200, midY = (0 + 0) / 2 = 0  → Point(200, 0)
    const [pointArg] = mockCanvasInstance.zoomToPoint.mock.calls[0] as [{ x: number; y: number }, number];
    expect(pointArg.x).toBeCloseTo(200);
    expect(pointArg.y).toBeCloseTo(0);
  });
});

// ─── New style controls ────────────────────────────────────────────────────────

describe('CanvasEngine – stroke dash', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('setStrokeDash("solid") sets strokeDashType and activates #dash-solid', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setStrokeDash('solid');
    expect(engine.strokeDashType).toBe('solid');
    expect(document.getElementById('dash-solid')!.classList.contains('on')).toBe(true);
    expect(document.getElementById('dash-dashed')!.classList.contains('on')).toBe(false);
  });

  it('setStrokeDash("dashed") applies strokeDashArray to active object', () => {
    const activeObj = makeFabricObject({ strokeWidth: 2 });
    mockCanvasInstance.getActiveObject.mockReturnValue(activeObj);
    const { engine } = makeEngine();
    engine.init();
    engine.setStrokeDash('dashed');
    expect(activeObj.set).toHaveBeenCalledWith('strokeDashArray', expect.arrayContaining([expect.any(Number)]));
  });

  it('setStrokeDash("dotted") applies dotted dash array to active object', () => {
    const activeObj = makeFabricObject({ strokeWidth: 2 });
    mockCanvasInstance.getActiveObject.mockReturnValue(activeObj);
    const { engine } = makeEngine();
    engine.init();
    engine.setStrokeDash('dotted');
    expect(activeObj.set).toHaveBeenCalledWith('strokeDashArray', expect.arrayContaining([expect.any(Number)]));
  });

  it('setStrokeDash("solid") passes null (clears) dash array on active object', () => {
    const activeObj = makeFabricObject({ strokeWidth: 2 });
    mockCanvasInstance.getActiveObject.mockReturnValue(activeObj);
    const { engine } = makeEngine();
    engine.init();
    engine.setStrokeDash('solid');
    expect(activeObj.set).toHaveBeenCalledWith('strokeDashArray', null);
  });
});

describe('CanvasEngine – border radius', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('setBorderRadius("rounded") sets borderRadiusEnabled=true and activates #br-rounded', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setBorderRadius('rounded');
    expect(engine.borderRadiusEnabled).toBe(true);
    expect(document.getElementById('br-rounded')!.classList.contains('on')).toBe(true);
    expect(document.getElementById('br-sharp')!.classList.contains('on')).toBe(false);
  });

  it('setBorderRadius("sharp") sets borderRadiusEnabled=false', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setBorderRadius('rounded');
    engine.setBorderRadius('sharp');
    expect(engine.borderRadiusEnabled).toBe(false);
  });

  it('setBorderRadius("rounded") on a sketch rect path updates _origGeom rx and regenerates path', () => {
    const origGeom = JSON.stringify({ type: 'rect', left: 0, top: 0, width: 100, height: 80, rx: 3 });
    const sketchPath = makeFabricObject({
      type: 'path',
      _origGeom: origGeom,
      _sloppiness: 'artist',
      _id: 'obj_test1',
    });
    mockCanvasInstance.getActiveObject.mockReturnValue(sketchPath);
    const { engine } = makeEngine();
    engine.init();
    engine.setBorderRadius('rounded');
    // _origGeom should have rx updated to 12
    const updatedGeom = JSON.parse((sketchPath as Record<string, unknown>)._origGeom as string) as { rx: number };
    expect(updatedGeom.rx).toBe(12);
    expect(engine.borderRadiusEnabled).toBe(true);
    expect(document.getElementById('br-rounded')!.classList.contains('on')).toBe(true);
  });

  it('setBorderRadius("sharp") on a sketch rect path reverts rx to 3', () => {
    const origGeom = JSON.stringify({ type: 'rect', left: 0, top: 0, width: 100, height: 80, rx: 12 });
    const sketchPath = makeFabricObject({
      type: 'path',
      _origGeom: origGeom,
      _sloppiness: 'cartoonist',
      _id: 'obj_test2',
    });
    mockCanvasInstance.getActiveObject.mockReturnValue(sketchPath);
    const { engine } = makeEngine();
    engine.init();
    engine.setBorderRadius('sharp');
    const updatedGeom = JSON.parse((sketchPath as Record<string, unknown>)._origGeom as string) as { rx: number };
    expect(updatedGeom.rx).toBe(3);
    expect(engine.borderRadiusEnabled).toBe(false);
  });

  it('setBorderRadius ignores non-rect sketch paths (e.g. ellipse origGeom)', () => {
    const origGeom = JSON.stringify({ type: 'ellipse', cx: 50, cy: 40, rx: 50, ry: 40 });
    const sketchPath = makeFabricObject({ type: 'path', _origGeom: origGeom, _sloppiness: 'artist' });
    mockCanvasInstance.getActiveObject.mockReturnValue(sketchPath);
    const { engine, onBroadcastDraw } = makeEngine();
    engine.init();
    engine.setBorderRadius('rounded');
    // Should not call onBroadcastDraw (no change for non-rect origGeom)
    expect(onBroadcastDraw).not.toHaveBeenCalled();
  });
});

describe('CanvasEngine – opacity', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('setOpacity(50) sets opacityValue=50 and updates slider/label', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setOpacity(50);
    expect(engine.opacityValue).toBe(50);
    expect((document.getElementById('opacitySlider') as HTMLInputElement).value).toBe('50');
    expect(document.getElementById('opacityValue')!.textContent).toBe('50%');
  });

  it('setOpacity applies opacity to active object', () => {
    const activeObj = makeFabricObject();
    mockCanvasInstance.getActiveObject.mockReturnValue(activeObj);
    const { engine } = makeEngine();
    engine.init();
    engine.setOpacity(75);
    expect(activeObj.set).toHaveBeenCalledWith('opacity', 0.75);
  });

  it('setOpacity clamps to 0..100', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setOpacity(-10);
    expect(engine.opacityValue).toBe(0);
    engine.setOpacity(200);
    expect(engine.opacityValue).toBe(100);
  });
});

describe('CanvasEngine – sloppiness', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('setSloppiness("architect") sets sloppiness and activates button', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setSloppiness('artist');
    engine.setSloppiness('architect');
    expect(engine.sloppiness).toBe('architect');
    expect(document.getElementById('sloppy-architect')!.classList.contains('on')).toBe(true);
    expect(document.getElementById('sloppy-artist')!.classList.contains('on')).toBe(false);
  });

  it('setSloppiness("cartoonist") applies rounded strokeLineCap to active object', () => {
    const activeObj = makeFabricObject();
    mockCanvasInstance.getActiveObject.mockReturnValue(activeObj);
    const { engine } = makeEngine();
    engine.init();
    engine.setSloppiness('cartoonist');
    expect(activeObj.set).toHaveBeenCalledWith(expect.objectContaining({ strokeLineCap: 'round' }));
  });
});

describe('CanvasEngine – layer controls', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('bringToFront() calls canvas.bringObjectToFront with active object', () => {
    const activeObj = makeFabricObject();
    mockCanvasInstance.getActiveObject.mockReturnValue(activeObj);
    const { engine } = makeEngine();
    engine.init();
    engine.bringToFront();
    expect(mockCanvasInstance.bringObjectToFront).toHaveBeenCalledWith(activeObj);
  });

  it('bringForward() calls canvas.bringObjectForward with active object', () => {
    const activeObj = makeFabricObject();
    mockCanvasInstance.getActiveObject.mockReturnValue(activeObj);
    const { engine } = makeEngine();
    engine.init();
    engine.bringForward();
    expect(mockCanvasInstance.bringObjectForward).toHaveBeenCalledWith(activeObj);
  });

  it('sendBackward() calls canvas.sendObjectBackwards with active object', () => {
    const activeObj = makeFabricObject();
    mockCanvasInstance.getActiveObject.mockReturnValue(activeObj);
    const { engine } = makeEngine();
    engine.init();
    engine.sendBackward();
    expect(mockCanvasInstance.sendObjectBackwards).toHaveBeenCalledWith(activeObj);
  });

  it('sendToBack() calls canvas.sendObjectToBack with active object', () => {
    const activeObj = makeFabricObject();
    mockCanvasInstance.getActiveObject.mockReturnValue(activeObj);
    const { engine } = makeEngine();
    engine.init();
    engine.sendToBack();
    expect(mockCanvasInstance.sendObjectToBack).toHaveBeenCalledWith(activeObj);
  });

  it('bringToFront() is a no-op when no active object', () => {
    mockCanvasInstance.getActiveObject.mockReturnValue(null);
    const { engine } = makeEngine();
    engine.init();
    expect(() => engine.bringToFront()).not.toThrow();
    expect(mockCanvasInstance.bringObjectToFront).not.toHaveBeenCalled();
  });
});

describe('CanvasEngine – object link', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('setObjectLink stores URL on active object', () => {
    const activeObj = makeFabricObject();
    mockCanvasInstance.getActiveObject.mockReturnValue(activeObj);
    const { engine } = makeEngine();
    engine.init();
    engine.setObjectLink('https://example.com');
    expect((activeObj as Record<string, unknown>)._link).toBe('https://example.com');
  });

  it('setObjectLink clears link when empty string passed', () => {
    const activeObj = makeFabricObject();
    (activeObj as Record<string, unknown>)._link = 'https://old.com';
    mockCanvasInstance.getActiveObject.mockReturnValue(activeObj);
    const { engine } = makeEngine();
    engine.init();
    engine.setObjectLink('');
    expect((activeObj as Record<string, unknown>)._link).toBeUndefined();
  });

  it('setObjectLink is a no-op when no active object', () => {
    mockCanvasInstance.getActiveObject.mockReturnValue(null);
    const { engine } = makeEngine();
    engine.init();
    expect(() => engine.setObjectLink('https://example.com')).not.toThrow();
  });
});

describe('CanvasEngine – arrow type & heads', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('setArrowType("curved") updates arrowType and button state', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setArrowType('curved');
    expect(engine.arrowType).toBe('curved');
    expect(document.getElementById('at-curved')!.classList.contains('on')).toBe(true);
    expect(document.getElementById('at-sharp')!.classList.contains('on')).toBe(false);
  });

  it('setArrowHeads("open", "triangle") updates both head state fields', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setArrowHeads('open', 'triangle');
    expect(engine.arrowHeadStart).toBe('open');
    expect(engine.arrowHeadEnd).toBe('triangle');
  });
});

describe('CanvasEngine – setStrokeWidth applies to selected object', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('setStrokeWidth applies to the active canvas object', () => {
    const activeObj = makeFabricObject({ strokeWidth: 1.5 });
    mockCanvasInstance.getActiveObject.mockReturnValue(activeObj);
    const { engine } = makeEngine();
    engine.init();
    engine.setStrokeWidth(5);
    expect(activeObj.set).toHaveBeenCalledWith('strokeWidth', 5);
  });
});

describe('CanvasEngine – new custom properties serialisation', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('init() registers _link, _arrowHeadStart, _arrowHeadEnd, _arrowType, _fillPattern', () => {
    const { engine } = makeEngine();
    (FabricObject as unknown as { customProperties: string[] }).customProperties = [];
    engine.init();
    const props = (FabricObject as unknown as { customProperties: string[] }).customProperties;
    expect(props).toContain('_link');
    expect(props).toContain('_arrowHeadStart');
    expect(props).toContain('_arrowHeadEnd');
    expect(props).toContain('_arrowType');
    expect(props).toContain('_fillPattern');
    expect(props).toContain('_attachedFromAnchorX');
    expect(props).toContain('_attachedFromAnchorY');
    expect(props).toContain('_attachedToAnchorX');
    expect(props).toContain('_attachedToAnchorY');
    expect(props).toContain('_gcx');
    expect(props).toContain('_gcy');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Contextual properties panel: showPropertiesPanelForShape + setTool behavior
// ─────────────────────────────────────────────────────────────────────────────

describe('CanvasEngine – showPropertiesPanelForShape', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('reveals the panel and shows arrow sections only for arrow shape', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.showPropertiesPanelForShape('arrow', false);
    expect(document.getElementById('props-panel')!.classList.contains('hide')).toBe(false);
    expect(document.getElementById('pp-arrow-type-section')!.classList.contains('hide')).toBe(false);
    expect(document.getElementById('pp-arrow-heads-section')!.classList.contains('hide')).toBe(false);
    expect(document.getElementById('pp-fill-pattern-section')!.classList.contains('hide')).toBe(true);
    expect(document.getElementById('pp-border-radius-section')!.classList.contains('hide')).toBe(true);
    expect(document.getElementById('pp-sloppiness-section')!.classList.contains('hide')).toBe(false); // sloppiness now shown for all non-text shapes
  });

  it('shows fill-pattern and border-radius sections for rect', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.showPropertiesPanelForShape('rect', false);
    expect(document.getElementById('pp-fill-pattern-section')!.classList.contains('hide')).toBe(false);
    expect(document.getElementById('pp-border-radius-section')!.classList.contains('hide')).toBe(false);
    expect(document.getElementById('pp-arrow-type-section')!.classList.contains('hide')).toBe(true);
  });

  it('shows fill-pattern but not border-radius for ellipse', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.showPropertiesPanelForShape('ellipse', false);
    expect(document.getElementById('pp-fill-pattern-section')!.classList.contains('hide')).toBe(false);
    expect(document.getElementById('pp-border-radius-section')!.classList.contains('hide')).toBe(true);
  });

  it('shows sloppiness section for all shapes (pen, rect, line, arrow)', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.showPropertiesPanelForShape('pen', false);
    expect(document.getElementById('pp-sloppiness-section')!.classList.contains('hide')).toBe(false);
    engine.showPropertiesPanelForShape('rect', false);
    expect(document.getElementById('pp-sloppiness-section')!.classList.contains('hide')).toBe(false);
    engine.showPropertiesPanelForShape('line', false);
    expect(document.getElementById('pp-sloppiness-section')!.classList.contains('hide')).toBe(false);
    engine.showPropertiesPanelForShape('arrow', false);
    expect(document.getElementById('pp-sloppiness-section')!.classList.contains('hide')).toBe(false);
    // fill-pattern still hidden for arrow
    expect(document.getElementById('pp-fill-pattern-section')!.classList.contains('hide')).toBe(true);
    // sloppiness hidden for text
    engine.showPropertiesPanelForShape('text', false);
    expect(document.getElementById('pp-sloppiness-section')!.classList.contains('hide')).toBe(true);
  });

  it('hides layer and link sections when isObjectSelected=false', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.showPropertiesPanelForShape('rect', false);
    expect(document.getElementById('pp-layer-section')!.classList.contains('hide')).toBe(true);
    expect(document.getElementById('pp-link-section')!.classList.contains('hide')).toBe(true);
  });

  it('shows layer and link sections when isObjectSelected=true', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.showPropertiesPanelForShape('rect', true);
    expect(document.getElementById('pp-layer-section')!.classList.contains('hide')).toBe(false);
    expect(document.getElementById('pp-link-section')!.classList.contains('hide')).toBe(false);
  });

  it('hides stroke-width and stroke-dash for text', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.showPropertiesPanelForShape('text', false);
    expect(document.getElementById('pp-stroke-width-section')!.classList.contains('hide')).toBe(true);
    expect(document.getElementById('pp-stroke-dash-section')!.classList.contains('hide')).toBe(true);
  });
});

describe('CanvasEngine – setTool panel behavior', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('setTool("rect") shows the properties panel', () => {
    const { engine } = makeEngine();
    engine.init();
    // Make sure panel starts hidden
    document.getElementById('props-panel')!.classList.add('hide');
    engine.setTool('rect');
    expect(document.getElementById('props-panel')!.classList.contains('hide')).toBe(false);
  });

  it('setTool("eraser") hides the properties panel', () => {
    const { engine } = makeEngine();
    engine.init();
    document.getElementById('props-panel')!.classList.remove('hide');
    engine.setTool('eraser');
    expect(document.getElementById('props-panel')!.classList.contains('hide')).toBe(true);
  });

  it('setTool("arrow") reveals arrow-specific sections', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setTool('arrow');
    expect(document.getElementById('pp-arrow-type-section')!.classList.contains('hide')).toBe(false);
    expect(document.getElementById('pp-arrow-heads-section')!.classList.contains('hide')).toBe(false);
  });

  it('setTool("select") with no active object hides the panel', () => {
    const { engine } = makeEngine();
    engine.init();
    mockCanvasInstance.getActiveObject.mockReturnValue(null);
    document.getElementById('props-panel')!.classList.remove('hide');
    engine.setTool('select');
    expect(document.getElementById('props-panel')!.classList.contains('hide')).toBe(true);
  });
});

describe('CanvasEngine – setArrowHeadStart / setArrowHeadEnd', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('setArrowHeadStart changes only start head, keeps end unchanged', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setArrowHeads('none', 'open');
    engine.setArrowHeadStart('triangle');
    expect(engine.arrowHeadStart).toBe('triangle');
    expect(engine.arrowHeadEnd).toBe('open');
  });

  it('setArrowHeadEnd changes only end head, keeps start unchanged', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setArrowHeads('open', 'none');
    engine.setArrowHeadEnd('triangle');
    expect(engine.arrowHeadStart).toBe('open');
    expect(engine.arrowHeadEnd).toBe('triangle');
  });
});

// ─── Bug-fix tests ─────────────────────────────────────────────────────────────

describe('CanvasEngine – setFillPattern on existing shapes (bug fix)', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('applies fill pattern when selected object has a non-transparent fill (fillEnabled=false)', () => {
    const { engine, onBroadcastDraw } = makeEngine();
    engine.init();
    expect(engine.fillEnabled).toBe(false);
    const obj = makeFabricObject({ fill: '#ff0000', _fillPattern: 'filled' });
    mockCanvasInstance.getActiveObject.mockReturnValue(obj);
    engine.setFillPattern('striped');
    expect(obj.set).toHaveBeenCalledWith('fill', expect.anything());
    expect(onBroadcastDraw).toHaveBeenCalled();
  });

  it('does NOT apply fill pattern when object has transparent fill and fillEnabled=false', () => {
    const { engine } = makeEngine();
    engine.init();
    const obj = makeFabricObject({ fill: 'transparent' });
    mockCanvasInstance.getActiveObject.mockReturnValue(obj);
    engine.setFillPattern('striped');
    expect(obj.set).not.toHaveBeenCalledWith('fill', expect.anything());
  });
});

describe('CanvasEngine – link double-click (bug fix)', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('registers a mouse:dblclick handler during init()', () => {
    const { engine } = makeEngine();
    engine.init();
    expect(mockCanvasInstance.on).toHaveBeenCalledWith('mouse:dblclick', expect.any(Function));
  });

  it('setObjectLink stores _link on the active object', () => {
    const { engine } = makeEngine();
    engine.init();
    const obj = makeFabricObject({});
    mockCanvasInstance.getActiveObject.mockReturnValue(obj);
    engine.setObjectLink('https://example.com');
    expect((obj as Record<string, unknown>)._link).toBe('https://example.com');
  });

  it('setObjectLink clears _link when empty string is passed', () => {
    const { engine } = makeEngine();
    engine.init();
    const obj = makeFabricObject({ _link: 'https://old.com' });
    mockCanvasInstance.getActiveObject.mockReturnValue(obj);
    engine.setObjectLink('');
    expect((obj as Record<string, unknown>)._link).toBeUndefined();
  });
});

describe('CanvasEngine – sloppiness for all shapes', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('sloppiness section visible for rect, ellipse, line, arrow, pen', () => {
    const { engine } = makeEngine();
    engine.init();
    for (const shape of ['rect', 'ellipse', 'line', 'arrow', 'pen']) {
      engine.showPropertiesPanelForShape(shape, false);
      expect(document.getElementById('pp-sloppiness-section')!.classList.contains('hide')).toBe(false);
    }
  });

  it('sloppiness section hidden for text', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.showPropertiesPanelForShape('text', false);
    expect(document.getElementById('pp-sloppiness-section')!.classList.contains('hide')).toBe(true);
  });

  it('setSloppiness updates button states', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setSloppiness('artist');
    expect(document.getElementById('sloppy-artist')!.classList.contains('on')).toBe(true);
    expect(document.getElementById('sloppy-architect')!.classList.contains('on')).toBe(false);
    engine.setSloppiness('architect');
    expect(document.getElementById('sloppy-architect')!.classList.contains('on')).toBe(true);
  });

  it('setSloppiness("doodle") activates only the doodle button', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setSloppiness('doodle');
    expect(document.getElementById('sloppy-doodle')!.classList.contains('on')).toBe(true);
    expect(document.getElementById('sloppy-architect')!.classList.contains('on')).toBe(false);
    expect(document.getElementById('sloppy-artist')!.classList.contains('on')).toBe(false);
    expect(document.getElementById('sloppy-cartoonist')!.classList.contains('on')).toBe(false);
    expect(engine.sloppiness).toBe('doodle');
  });
});

describe('CanvasEngine – sketch path helpers', () => {
  it('seedFromId returns a stable non-negative integer', () => {
    const eng = (CanvasEngine as unknown as Record<string, unknown>);
    const fn = eng.seedFromId as (id: string) => number;
    expect(fn('obj_abc123')).toBe(fn('obj_abc123'));
    expect(fn('obj_abc123')).toBeGreaterThanOrEqual(0);
  });

  it('sloppinessAmplitude: 0 for architect, positive for artist, larger for cartoonist, between artist and cartoonist for doodle', () => {
    const eng = (CanvasEngine as unknown as Record<string, unknown>);
    const fn = eng.sloppinessAmplitude as (s: string, sw: number) => number;
    expect(fn('architect', 2)).toBe(0);
    expect(fn('artist', 2)).toBeGreaterThan(0);
    expect(fn('doodle', 2)).toBeGreaterThan(fn('artist', 2));
    expect(fn('cartoonist', 2)).toBeGreaterThan(fn('doodle', 2));
  });

  it('makeSketchyPath: rounded rect path contains Q commands and closes', () => {
    const eng = (CanvasEngine as unknown as Record<string, unknown>);
    const engine = new CanvasEngine(vi.fn(), vi.fn());
    const makeSketchyPath = (engine as unknown as Record<string, unknown>).makeSketchyPath as
      (geom: Record<string, unknown>, amp: number, seed: number) => string;
    const geom = { type: 'rect', left: 10, top: 10, width: 100, height: 80, rx: 12 };
    const path = makeSketchyPath.call(engine, geom, 3, 42);
    expect(path).toContain('Q');
    expect(path).toContain('L');
    expect(path.trim().endsWith('Z')).toBe(true);
  });

  it('makeSketchyPath: sharp rect path (rx=0) uses only Q commands to connect corners', () => {
    const engine = new CanvasEngine(vi.fn(), vi.fn());
    const makeSketchyPath = (engine as unknown as Record<string, unknown>).makeSketchyPath as
      (geom: Record<string, unknown>, amp: number, seed: number) => string;
    const geom = { type: 'rect', left: 10, top: 10, width: 100, height: 80, rx: 0 };
    const path = makeSketchyPath.call(engine, geom, 3, 42);
    expect(path).toContain('Q');
    expect(path).not.toContain('L');
    expect(path.trim().endsWith('Z')).toBe(true);
  });

  it('getObjectShapeType: sketch path with rect _origGeom returns "rect"', () => {
    const engine = new CanvasEngine(vi.fn(), vi.fn());
    const getObjectShapeType = (engine as unknown as Record<string, unknown>).getObjectShapeType as
      (o: Record<string, unknown>) => string;
    const sketchRect = { type: 'path', _origGeom: JSON.stringify({ type: 'rect', left: 0, top: 0, width: 100, height: 80, rx: 3 }) };
    expect(getObjectShapeType.call(engine, sketchRect)).toBe('rect');
    const sketchEllipse = { type: 'path', _origGeom: JSON.stringify({ type: 'ellipse', cx: 50, cy: 40, rx: 50, ry: 40 }) };
    expect(getObjectShapeType.call(engine, sketchEllipse)).toBe('ellipse');
    const sketchLine = { type: 'path', _origGeom: JSON.stringify({ type: 'line', x1: 0, y1: 0, x2: 100, y2: 100 }) };
    expect(getObjectShapeType.call(engine, sketchLine)).toBe('line');
    const penPath = { type: 'path' };  // no _origGeom → freehand pen
    expect(getObjectShapeType.call(engine, penPath)).toBe('pen');
  });
});

// ─── Bug-fix: toggleFill applies fill immediately to selected object ──────────

describe('CanvasEngine – toggleFill applies fill to active object (bug fix)', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('toggleFill() enabling fill applies current fillColor to the selected object', () => {
    const { engine, onBroadcastDraw } = makeEngine();
    engine.init();
    // Set fill color directly on engine state (avoids depending on updateFillColor internals)
    engine.fillColor = '#ff0000';
    const obj = makeFabricObject({ fill: 'transparent' });
    mockCanvasInstance.getActiveObject.mockReturnValue(obj);
    engine.toggleFill(); // enable fill
    expect(engine.fillEnabled).toBe(true);
    expect(obj.set).toHaveBeenCalledWith('fill', '#ff0000');
    expect(onBroadcastDraw).toHaveBeenCalled();
  });

  it('toggleFill() disabling fill sets object fill to transparent', () => {
    const { engine, onBroadcastDraw } = makeEngine();
    engine.init();
    const obj = makeFabricObject({ fill: '#ff0000' });
    mockCanvasInstance.getActiveObject.mockReturnValue(obj);
    // Sync engine state: object has a fill so fillEnabled should be true
    engine['fillEnabled'] = true;
    (obj.set as ReturnType<typeof vi.fn>).mockClear();
    engine.toggleFill(); // disable fill
    expect(engine.fillEnabled).toBe(false);
    expect(obj.set).toHaveBeenCalledWith('fill', 'transparent');
    expect(onBroadcastDraw).toHaveBeenCalled();
  });

  it('toggleFill() with no active object only updates flag and button', () => {
    const { engine, onBroadcastDraw } = makeEngine();
    engine.init();
    mockCanvasInstance.getActiveObject.mockReturnValue(null);
    engine.toggleFill();
    expect(engine.fillEnabled).toBe(true);
    expect(onBroadcastDraw).not.toHaveBeenCalled();
  });
});

// ─── Bug-fix: strokeUniform=true on new shapes ────────────────────────────────

describe('CanvasEngine – strokeUniform on new shapes (bug fix)', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('rect shape is created with strokeUniform=true', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setTool('rect');
    canvasEventHandlers['mouse:down']?.({ scenePoint: { x: 10, y: 10 } });
    const [opts] = (Rect as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [Record<string, unknown>];
    expect(opts.strokeUniform).toBe(true);
  });

  it('ellipse shape is created with strokeUniform=true', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setTool('ellipse');
    canvasEventHandlers['mouse:down']?.({ scenePoint: { x: 10, y: 10 } });
    const [opts] = (Ellipse as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [Record<string, unknown>];
    expect(opts.strokeUniform).toBe(true);
  });

  it('line shape is created with strokeUniform=true', () => {
    const { engine } = makeEngine();
    engine.init();
    engine.setTool('line');
    canvasEventHandlers['mouse:down']?.({ scenePoint: { x: 10, y: 10 } });
    const [, opts] = (Line as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown[], Record<string, unknown>];
    expect(opts.strokeUniform).toBe(true);
  });
});

// ─── Bug-fix: applyStrokeUniformToAll called after loadCanvasData ─────────────

describe('CanvasEngine – applyStrokeUniformToAll on canvas load (bug fix)', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('loadCanvasData calls applyStrokeUniformToAll to set strokeUniform on existing objects', async () => {
    const obj = makeFabricObject({ strokeUniform: false });
    mockCanvasInstance.getObjects.mockReturnValue([obj]);
    const { engine } = makeEngine();
    engine.init();
    engine.loadCanvasData(JSON.stringify({ version: '5', objects: [] }));
    // Wait for the mocked promise to resolve
    await Promise.resolve();
    expect(obj.set).toHaveBeenCalledWith('strokeUniform', true);
  });
});

// ─── Connector / attachment tests ─────────────────────────────────────────────

describe('CanvasEngine – connector snapping and following', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('object:moving on a shape triggers rebuild of an attached arrow group', () => {
    const { engine, onBroadcastDraw } = makeEngine();
    engine.init();

    // A shape that will be moved.
    const shape = makeFabricObject({ _id: 'shape-1', left: 100, top: 100, width: 80, height: 60 });

    // An arrow group whose start is attached to shape-1.
    const arrowGroup = makeFabricObject({
      _isArrow: true,
      _attachedFrom: 'shape-1',
      _x1: 0, _y1: 0, _x2: 50, _y2: 50,
      _arrowHeadStart: 'none', _arrowHeadEnd: 'open', _arrowType: 'sharp',
      getObjects: vi.fn().mockReturnValue([]),
    });

    mockCanvasInstance.getObjects.mockReturnValue([shape, arrowGroup]);
    mockCanvasInstance.getActiveObject.mockReturnValue(shape);

    (Group as unknown as ReturnType<typeof vi.fn>).mockClear();
    mockCanvasInstance.remove.mockClear();

    // Simulate the user dragging shape-1.
    canvasEventHandlers['object:moving']?.({ target: shape });

    // The old arrow group should be removed and a new Group built.
    expect(mockCanvasInstance.remove).toHaveBeenCalledWith(arrowGroup);
    expect(Group).toHaveBeenCalled();

    // The newly added group should carry the same _attachedFrom ID.
    const addCalls = mockCanvasInstance.add.mock.calls;
    const lastAdded = addCalls[addCalls.length - 1]?.[0] as Record<string, unknown>;
    expect(lastAdded?._attachedFrom).toBe('shape-1');
  });

  it('object:moving on a shape updates the _x1/_y1 endpoint of the rebuilt arrow group', () => {
    const { engine } = makeEngine();
    engine.init();

    const shape = makeFabricObject({ _id: 'shape-2', left: 200, top: 150, width: 100, height: 80 });
    // getCenterPoint: { x: 200 + 100/2, y: 150 + 80/2 } = { x: 250, y: 190 }

    const arrowGroup = makeFabricObject({
      _isArrow: true,
      _attachedTo: 'shape-2',
      _x1: 10, _y1: 10, _x2: 200, _y2: 150,
      _arrowHeadStart: 'none', _arrowHeadEnd: 'open', _arrowType: 'sharp',
      getObjects: vi.fn().mockReturnValue([]),
    });

    mockCanvasInstance.getObjects.mockReturnValue([shape, arrowGroup]);
    mockCanvasInstance.getActiveObject.mockReturnValue(shape);

    canvasEventHandlers['object:moving']?.({ target: shape });

    // The rebuilt group should have _x2/_y2 snapped to the shape's new center.
    const addCalls = mockCanvasInstance.add.mock.calls;
    const lastAdded = addCalls[addCalls.length - 1]?.[0] as Record<string, unknown>;
    expect(lastAdded?._x2).toBe(250); // center.x
    expect(lastAdded?._y2).toBe(190); // center.y
    // The non-attached endpoint should be unchanged.
    expect(lastAdded?._x1).toBe(10);
    expect(lastAdded?._y1).toBe(10);
  });

  it('active selection is restored after arrow group is rebuilt during shape move', () => {
    const { engine } = makeEngine();
    engine.init();

    const shape = makeFabricObject({ _id: 'shape-3', left: 0, top: 0, width: 10, height: 10 });
    const arrowGroup = makeFabricObject({
      _isArrow: true, _attachedFrom: 'shape-3',
      _x1: 0, _y1: 0, _x2: 50, _y2: 50,
      _arrowHeadStart: 'none', _arrowHeadEnd: 'open', _arrowType: 'sharp',
      getObjects: vi.fn().mockReturnValue([]),
    });

    mockCanvasInstance.getObjects.mockReturnValue([shape, arrowGroup]);
    mockCanvasInstance.getActiveObject.mockReturnValue(shape);
    mockCanvasInstance.setActiveObject.mockClear();

    canvasEventHandlers['object:moving']?.({ target: shape });

    // After rebuild, the dragged shape should be re-selected (not the new arrow group).
    const setActiveCalls = mockCanvasInstance.setActiveObject.mock.calls;
    const lastSetActive = setActiveCalls[setActiveCalls.length - 1]?.[0];
    expect(lastSetActive).toBe(shape);
  });

  it('arrow group rebuild during shape move does NOT call setActiveObject with the new group', () => {
    // Bug fix: previously buildArrowGroup always called canvas.setActiveObject(newGroup)
    // which disrupted Fabric.js drag-tracking for the shape being moved.
    const { engine } = makeEngine();
    engine.init();

    const shape = makeFabricObject({ _id: 'shape-drag', left: 0, top: 0, width: 10, height: 10 });
    const arrowGroup = makeFabricObject({
      _isArrow: true, _attachedFrom: 'shape-drag',
      _x1: 0, _y1: 0, _x2: 50, _y2: 50,
      _arrowHeadStart: 'none', _arrowHeadEnd: 'open', _arrowType: 'sharp',
      getObjects: vi.fn().mockReturnValue([]),
    });

    mockCanvasInstance.getObjects.mockReturnValue([shape, arrowGroup]);
    mockCanvasInstance.getActiveObject.mockReturnValue(shape);
    (Group as unknown as ReturnType<typeof vi.fn>).mockClear();
    mockCanvasInstance.setActiveObject.mockClear();

    canvasEventHandlers['object:moving']?.({ target: shape });

    // The new group should have been added to the canvas.
    expect(Group).toHaveBeenCalled();
    const newGroup = (Group as unknown as ReturnType<typeof vi.fn>).mock.results[0]?.value as Record<string, unknown>;

    // setActiveObject must NEVER be called with the new arrow group — only with the
    // moving shape (to restore drag tracking).
    const setActiveCalls = mockCanvasInstance.setActiveObject.mock.calls as unknown[][];
    const calledWithNewGroup = setActiveCalls.some((args) => args[0] === newGroup);
    expect(calledWithNewGroup).toBe(false);
  });

  it('object:moving arrow rebuild does NOT nullify this.activeObj (drawing in progress)', () => {
    // Bug fix: buildArrowGroup used to always set this.activeObj = null.  When called
    // via rebuildArrowForMove (triggered by object:moving while drawing arrow 2), this
    // cleared the drawing-line reference, causing onMouseMove and onMouseUp to bail
    // early and silently discard the in-progress arrow.
    const { engine } = makeEngine();
    engine.init();
    engine.setTool('arrow');

    // Start drawing a second arrow: the engine creates a Line and stores it in activeObj.
    canvasEventHandlers['mouse:down']?.({ e: new MouseEvent('mousedown'), scenePoint: { x: 50, y: 50 } });

    // Verify activeObj was set by onMouseDown.
    const eng = engine as unknown as { activeObj: unknown };
    const drawingLine = eng.activeObj;
    expect(drawingLine).not.toBeNull();

    // While drawing arrow 2, simulate object:moving for a shape that has arrow 1 attached.
    const shape = makeFabricObject({ _id: 'attached-shape', left: 10, top: 10, width: 20, height: 20 });
    const arrowGroup = makeFabricObject({
      _isArrow: true, _attachedFrom: 'attached-shape',
      _x1: 0, _y1: 0, _x2: 30, _y2: 30,
      _arrowHeadStart: 'none', _arrowHeadEnd: 'open', _arrowType: 'sharp',
      getObjects: vi.fn().mockReturnValue([]),
    });
    mockCanvasInstance.getObjects.mockReturnValue([shape, arrowGroup, drawingLine as Record<string, unknown>]);
    mockCanvasInstance.getActiveObject.mockReturnValue(shape);

    canvasEventHandlers['object:moving']?.({ target: shape });

    // activeObj must still be the drawing line — NOT null.
    expect(eng.activeObj).toBe(drawingLine);
  });

  it('object:moving does not rebuild arrow groups that are not attached to the moved shape', () => {
    const { engine } = makeEngine();
    engine.init();

    const shape = makeFabricObject({ _id: 'shape-4', left: 0, top: 0, width: 10, height: 10 });
    // Arrow attached to a different shape (shape-99), NOT shape-4.
    const unrelated = makeFabricObject({
      _isArrow: true, _attachedFrom: 'shape-99',
      _x1: 0, _y1: 0, _x2: 50, _y2: 50,
      getObjects: vi.fn().mockReturnValue([]),
    });

    mockCanvasInstance.getObjects.mockReturnValue([shape, unrelated]);
    mockCanvasInstance.getActiveObject.mockReturnValue(shape);
    (Group as unknown as ReturnType<typeof vi.fn>).mockClear();
    mockCanvasInstance.remove.mockClear();

    canvasEventHandlers['object:moving']?.({ target: shape });

    // Unrelated arrow group must NOT be removed or rebuilt.
    expect(mockCanvasInstance.remove).not.toHaveBeenCalledWith(unrelated);
    expect(Group).not.toHaveBeenCalled();
  });

  it('rebuildSelectedArrow preserves _attachedFrom and _attachedTo on the new group', () => {
    const { engine } = makeEngine();
    engine.init();

    // An arrow group with attachment IDs.
    const arrowGroup = makeFabricObject({
      _isArrow: true,
      _attachedFrom: 'shape-A',
      _attachedTo: 'shape-B',
      _x1: 0, _y1: 0, _x2: 100, _y2: 100,
      _arrowHeadStart: 'none', _arrowHeadEnd: 'open', _arrowType: 'sharp',
      getObjects: vi.fn().mockReturnValue([]),
    });
    mockCanvasInstance.getActiveObject.mockReturnValue(arrowGroup);
    mockCanvasInstance.add.mockClear();

    // Trigger a rebuild (e.g. changing arrow type).
    engine.setArrowType('curved');

    // The newly added group must carry the preserved attachment IDs.
    const addCalls = mockCanvasInstance.add.mock.calls;
    const lastAdded = addCalls[addCalls.length - 1]?.[0] as Record<string, unknown>;
    expect(lastAdded?._attachedFrom).toBe('shape-A');
    expect(lastAdded?._attachedTo).toBe('shape-B');
  });

  it('arrow groups are excluded from snapLineAttachment snap candidates', () => {
    const { engine } = makeEngine();
    engine.init();

    // Put an arrow group very close to (0, 0) — it must NOT be snapped to.
    const arrowGroup = makeFabricObject({
      _isArrow: true,
      left: 0, top: 0, width: 10, height: 10,
      _id: 'arrow-nearby',
    });
    // A real shape slightly further away but still within snap radius.
    const realShape = makeFabricObject({
      left: 20, top: 0, width: 10, height: 10,
      _id: 'real-shape',
    });
    mockCanvasInstance.getObjects.mockReturnValue([arrowGroup, realShape]);

    // Call the private method via type assertion.
    const eng = engine as unknown as {
      snapLineAttachment: (line: unknown) => void;
    };

    // Create a Line-like object that passes instanceof Line.
    const lineProto = (Line as unknown as { prototype: object }).prototype;
    const testLine = Object.assign(
      Object.create(lineProto) as Record<string, unknown>,
      makeFabricObject({ x1: 5, y1: 5, x2: 200, y2: 200, _id: 'test-line' }),
    );

    eng.snapLineAttachment(testLine);

    // Arrow group must NOT have been snapped to.
    expect(testLine._attachedFrom).not.toBe('arrow-nearby');
    // Real shape at center (25, 5) is within 30px of (5, 5) → should be snapped.
    expect(testLine._attachedFrom).toBe('real-shape');
  });

  // ── Border-snapping tests ──────────────────────────────────────────────────

  it('snapLineAttachment snaps endpoint near the border (not just center)', () => {
    const { engine } = makeEngine();
    engine.init();

    // Shape: 100×80 at (100, 100) → center (140, 130), bbox [100,100,180,160].
    // Place line endpoint 10px outside the right edge at (190, 130):
    // dist to bbox = 10 < SNAP_RADIUS=30 → should snap.
    const shape = makeFabricObject({ left: 100, top: 100, width: 80, height: 60, _id: 'border-shape' });
    mockCanvasInstance.getObjects.mockReturnValue([shape]);

    const lineProto = (Line as unknown as { prototype: object }).prototype;
    const testLine = Object.assign(
      Object.create(lineProto) as Record<string, unknown>,
      makeFabricObject({ x1: 190, y1: 130, x2: 300, y2: 300, _id: 'my-line' }),
    );

    const eng = engine as unknown as { snapLineAttachment: (l: unknown) => void };
    eng.snapLineAttachment(testLine);

    expect(testLine._attachedFrom).toBe('border-shape');
  });

  it('snapLineAttachment snaps endpoint inside a shape to nearest border', () => {
    const { engine } = makeEngine();
    engine.init();

    // Shape: 100×80 at (100, 100). Endpoint at (150, 115) is inside the shape.
    // dist to bbox = 0 < 30 → snaps.
    const shape = makeFabricObject({ left: 100, top: 100, width: 100, height: 80, _id: 'inner-shape' });
    mockCanvasInstance.getObjects.mockReturnValue([shape]);

    const lineProto = (Line as unknown as { prototype: object }).prototype;
    const testLine = Object.assign(
      Object.create(lineProto) as Record<string, unknown>,
      makeFabricObject({ x1: 150, y1: 115, x2: 0, y2: 0, _id: 'my-line-2' }),
    );

    const eng = engine as unknown as { snapLineAttachment: (l: unknown) => void };
    eng.snapLineAttachment(testLine);

    expect(testLine._attachedFrom).toBe('inner-shape');
    // Endpoint should be projected to the nearest edge.
    // center=(150,140), bbox=[100,100,200,180]. Nearest edge to (150,115) is top (y=100), dist=15.
    expect(testLine.x1).toBe(150); // x stays (projected to top edge)
    expect(testLine.y1).toBe(100); // projected to top edge
  });

  it('snapLineAttachment stores anchor offset from shape center', () => {
    const { engine } = makeEngine();
    engine.init();

    // Shape: 100×80 at (0, 0) → center (50, 40), bbox [0,0,100,80].
    // Endpoint at (110, 40): 10px right of the right edge.
    // Nearest border point = (100, 40), offset from center = (+50, 0).
    const shape = makeFabricObject({ left: 0, top: 0, width: 100, height: 80, _id: 'anchor-shape' });
    mockCanvasInstance.getObjects.mockReturnValue([shape]);

    const lineProto = (Line as unknown as { prototype: object }).prototype;
    const testLine = Object.assign(
      Object.create(lineProto) as Record<string, unknown>,
      makeFabricObject({ x1: 0, y1: 0, x2: 110, y2: 40, _id: 'anchor-line' }),
    );

    const eng = engine as unknown as { snapLineAttachment: (l: unknown) => void };
    eng.snapLineAttachment(testLine);

    // x2/y2 should snap to nearest border point (100, 40).
    expect(testLine.x2).toBe(100);
    expect(testLine.y2).toBe(40);
    // Anchor offset from center (50, 40) → (50, 0).
    expect(testLine._attachedToAnchorX).toBe(50);
    expect(testLine._attachedToAnchorY).toBe(0);
  });

  it('updateAttachedLines uses anchor offset to place line endpoint on shape border', () => {
    const { engine, onBroadcastDraw } = makeEngine();
    engine.init();

    // Shape moves to center (200, 150).
    const shape = makeFabricObject({ _id: 'offset-shape', left: 150, top: 110, width: 100, height: 80 });
    // line end is attached to 'offset-shape' with anchor (+50, 0) (right border).
    const lineProto = (Line as unknown as { prototype: object }).prototype;
    const attachedLine = Object.assign(
      Object.create(lineProto) as Record<string, unknown>,
      makeFabricObject({ x1: 0, y1: 0, x2: 0, y2: 0, _id: 'offset-line',
        _attachedTo: 'offset-shape',
        _attachedToAnchorX: 50, _attachedToAnchorY: 0 }),
    );

    mockCanvasInstance.getObjects.mockReturnValue([shape, attachedLine]);
    mockCanvasInstance.getActiveObject.mockReturnValue(null);

    canvasEventHandlers['object:moving']?.({ target: shape });

    // center of shape = (150 + 50, 110 + 40) = (200, 150). Endpoint = center + anchor = (250, 150).
    const setArgs = (attachedLine.set as ReturnType<typeof vi.fn>).mock.calls
      .find((args: unknown[]) => typeof args[0] === 'object' && 'x2' in (args[0] as object));
    expect(setArgs?.[0]).toMatchObject({ x2: 250, y2: 150 });
    expect(onBroadcastDraw).toHaveBeenCalled();
  });

  // ── nearestPointOnBounds helper ────────────────────────────────────────────

  it('nearestPointOnBounds: point outside returns clamped border point', () => {
    const eng = CanvasEngine as unknown as {
      nearestPointOnBounds: (px: number, py: number, l: number, t: number, r: number, b: number) => { x: number; y: number };
    };
    // Point to the right of the box.
    expect(eng.nearestPointOnBounds(120, 50, 0, 0, 100, 100)).toEqual({ x: 100, y: 50 });
    // Point above the box.
    expect(eng.nearestPointOnBounds(50, -20, 0, 0, 100, 100)).toEqual({ x: 50, y: 0 });
    // Point to the bottom-right corner region.
    expect(eng.nearestPointOnBounds(110, 110, 0, 0, 100, 100)).toEqual({ x: 100, y: 100 });
  });

  it('nearestPointOnBounds: point inside is projected to nearest edge', () => {
    const eng = CanvasEngine as unknown as {
      nearestPointOnBounds: (px: number, py: number, l: number, t: number, r: number, b: number) => { x: number; y: number };
    };
    // Closest to top edge (y=0, dist=5).
    expect(eng.nearestPointOnBounds(50, 5, 0, 0, 100, 100)).toEqual({ x: 50, y: 0 });
    // Closest to left edge (x=0, dist=3).
    expect(eng.nearestPointOnBounds(3, 50, 0, 0, 100, 100)).toEqual({ x: 0, y: 50 });
    // Closest to right edge (x=100, dist=4).
    expect(eng.nearestPointOnBounds(96, 50, 0, 0, 100, 100)).toEqual({ x: 100, y: 50 });
    // Closest to bottom edge (y=100, dist=2).
    expect(eng.nearestPointOnBounds(50, 98, 0, 0, 100, 100)).toEqual({ x: 50, y: 100 });
  });

  // ── Artist / cartoonist style snap ─────────────────────────────────────────

  it('tryConvertToSketch preserves attachment properties when converting a snapped Line to a Path', () => {
    const { engine } = makeEngine();
    engine.init();

    // Build a Line-like source object with attachment metadata + origGeom so
    // tryConvertToSketch can convert it.
    const lineObj = makeFabricObject({
      type: 'line',
      _id: 'conv-line', _sloppiness: 'artist',
      _origGeom: JSON.stringify({ type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 }),
      _attachedFrom: 'shape-A', _attachedTo: 'shape-B',
      _attachedFromAnchorX: -50, _attachedFromAnchorY: 0,
      _attachedToAnchorX:    50, _attachedToAnchorY: 0,
      stroke: '#fff', strokeWidth: 2, fill: 'transparent', opacity: 1,
    });

    mockCanvasInstance.add.mockClear();
    const eng = engine as unknown as {
      tryConvertToSketch: (obj: unknown, sloppiness: string) => unknown;
    };
    const result = eng.tryConvertToSketch(lineObj, 'artist') as Record<string, unknown> | null;

    expect(result).not.toBeNull();
    expect(result?._attachedFrom).toBe('shape-A');
    expect(result?._attachedTo).toBe('shape-B');
    expect(result?._attachedFromAnchorX).toBe(-50);
    expect(result?._attachedFromAnchorY).toBe(0);
    expect(result?._attachedToAnchorX).toBe(50);
    expect(result?._attachedToAnchorY).toBe(0);
  });

  it('object:moving on a shape triggers rebuild of an attached sketch-path connector', () => {
    const { engine, onBroadcastDraw } = makeEngine();
    engine.init();

    // Shape that will be moved: 100×80 at (0,0) → center (50,40).
    const shape = makeFabricObject({ _id: 'sketch-shape', left: 0, top: 0, width: 100, height: 80 });

    // Sketch-path connector attached to the shape's right border (anchorX=+50, anchorY=0).
    const sketchPath = makeFabricObject({
      type: 'path',
      _id: 'sketch-connector',
      _sloppiness: 'artist',
      _origGeom: JSON.stringify({ type: 'line', x1: 0, y1: 0, x2: 100, y2: 40 }),
      _attachedTo: 'sketch-shape',
      _attachedToAnchorX: 50, _attachedToAnchorY: 0,
      stroke: '#fff', strokeWidth: 2, fill: 'transparent', opacity: 1,
    });

    mockCanvasInstance.getObjects.mockReturnValue([shape, sketchPath]);
    mockCanvasInstance.getActiveObject.mockReturnValue(null);
    mockCanvasInstance.add.mockClear();
    mockCanvasInstance.remove.mockClear();
    (Path as unknown as ReturnType<typeof vi.fn>).mockClear();

    canvasEventHandlers['object:moving']?.({ target: shape });

    // The old sketch path should be removed from canvas.
    expect(mockCanvasInstance.remove).toHaveBeenCalledWith(sketchPath);
    // A new Path should have been added (the rebuilt sketch path).
    expect(Path).toHaveBeenCalled();
    expect(mockCanvasInstance.add).toHaveBeenCalled();
    expect(onBroadcastDraw).toHaveBeenCalled();
  });

  it('rebuildSketchPathForMove updates _origGeom and adds rebuilt path preserving attachment IDs', () => {
    const { engine } = makeEngine();
    engine.init();

    const sketchPath = makeFabricObject({
      type: 'path',
      _id: 'sp-1', _sloppiness: 'artist',
      _origGeom: JSON.stringify({ type: 'line', x1: 0, y1: 0, x2: 50, y2: 50 }),
      _attachedFrom: 'shA', _attachedTo: 'shB',
      _attachedFromAnchorX: -30, _attachedFromAnchorY: 0,
      _attachedToAnchorX:    30, _attachedToAnchorY: 0,
      stroke: '#fff', strokeWidth: 2, fill: 'transparent', opacity: 1,
    });

    mockCanvasInstance.getActiveObject.mockReturnValue(null);
    mockCanvasInstance.add.mockClear();
    mockCanvasInstance.remove.mockClear();
    (Path as unknown as ReturnType<typeof vi.fn>).mockClear();

    const eng = engine as unknown as {
      rebuildSketchPathForMove: (p: unknown, x1: number, y1: number, x2: number, y2: number) => void;
    };
    eng.rebuildSketchPathForMove(sketchPath, 10, 20, 80, 90);

    // Old path removed, new one added.
    expect(mockCanvasInstance.remove).toHaveBeenCalledWith(sketchPath);
    expect(Path).toHaveBeenCalled();
    expect(mockCanvasInstance.add).toHaveBeenCalled();

    // The rebuilt path should carry attachment metadata (set by copyCustom).
    const addCalls = mockCanvasInstance.add.mock.calls;
    const added = addCalls[addCalls.length - 1]?.[0] as Record<string, unknown>;
    expect(added?._attachedFrom).toBe('shA');
    expect(added?._attachedTo).toBe('shB');
    expect(added?._attachedFromAnchorX).toBe(-30);
    expect(added?._attachedToAnchorX).toBe(30);
  });

  // ── Re-snap on object:modified (snap existing lines/arrows) ────────────────

  it('object:modified on a Line clears stale attachment and re-snaps to a nearby shape', () => {
    // A Line previously attached to 'old-shape' is moved so its endpoint is
    // now near 'new-shape'.  object:modified should detach from 'old-shape'
    // and attach to 'new-shape'.
    const { engine } = makeEngine();
    engine.init();

    const newShape = makeFabricObject({ _id: 'new-shape', left: 100, top: 90, width: 60, height: 60 });
    // center of newShape = (130, 120); bbox = [100,90,160,150]

    const lineProto = (Line as unknown as { prototype: object }).prototype;
    const existingLine = Object.assign(
      Object.create(lineProto) as Record<string, unknown>,
      makeFabricObject({
        _id: 'existing-line',
        x1: 0, y1: 0,
        // x2/y2 close to newShape right border (dist < 30)
        x2: 165, y2: 120,
        // stale attachment from previous position
        _attachedTo: 'old-shape',
        _attachedToAnchorX: 50, _attachedToAnchorY: 0,
      }),
    );

    mockCanvasInstance.getObjects.mockReturnValue([newShape, existingLine]);

    // Fire object:modified as if the user just finished dragging the line.
    canvasEventHandlers['object:modified']?.({ target: existingLine });

    // Old attachment cleared, new attachment set.
    expect(existingLine._attachedTo).toBe('new-shape');
    // x2/y2 should be snapped to the nearest border point of newShape at (165,120)
    // → right border at (160,120).
    const setArgs = (existingLine.set as ReturnType<typeof vi.fn>).mock.calls
      .find((args: unknown[]) => typeof args[0] === 'object' && 'x2' in (args[0] as object));
    expect(setArgs?.[0]).toMatchObject({ x2: 160, y2: 120 });
  });

  it('object:modified on a Line clears attachment when moved away from shape (no re-snap)', () => {
    const { engine } = makeEngine();
    engine.init();

    const shape = makeFabricObject({ _id: 'far-shape', left: 0, top: 0, width: 20, height: 20 });
    // center = (10,10), bbox = [0,0,20,20]

    const lineProto = (Line as unknown as { prototype: object }).prototype;
    const existingLine = Object.assign(
      Object.create(lineProto) as Record<string, unknown>,
      makeFabricObject({
        _id: 'moved-away',
        // endpoint is now 200px away — outside SNAP_RADIUS
        x1: 200, y1: 200, x2: 300, y2: 300,
        _attachedFrom: 'far-shape',
        _attachedFromAnchorX: 10, _attachedFromAnchorY: 0,
      }),
    );

    mockCanvasInstance.getObjects.mockReturnValue([shape, existingLine]);
    canvasEventHandlers['object:modified']?.({ target: existingLine });

    // Stale attachment should have been cleared (no shape is nearby).
    expect(existingLine._attachedFrom).toBeUndefined();
  });

  it('object:modified on an arrow group updates _x1/_y1/_x2/_y2 and snaps endpoint to nearby shape', () => {
    // Arrow group was at center (50, 50) when built (_gcx/_gcy=50,50;
    // _x1/_y1=0,0; _x2/_y2=100,100).
    // User moves the group 20px right, 30px down → new center (70,80).
    // New endpoints: x1=20,y1=30; x2=120,y2=130.
    // shape-X has its border 15px away from (20,30) → should snap.
    const { engine } = makeEngine();
    engine.init();

    // Shape whose border is close to the moved x1/y1=(20,30).
    // left=0,top=0,width=10,height=10 → center=(5,5), bbox=[0,0,10,10]
    // dist from (20,30) to bbox = hypot(10,20) ≈ 22.4 which is < 30 → snaps.
    const shape = makeFabricObject({ _id: 'snap-shape', left: 0, top: 0, width: 10, height: 10 });

    const arrowGroup = makeFabricObject({
      _isArrow: true,
      _x1: 0, _y1: 0, _x2: 100, _y2: 100,
      _gcx: 50, _gcy: 50,
      _arrowHeadStart: 'none', _arrowHeadEnd: 'open', _arrowType: 'sharp',
      getObjects: vi.fn().mockReturnValue([]),
    });
    // Simulate the group having been dragged: new center = (70, 80).
    (arrowGroup.getCenterPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 70, y: 80 });

    mockCanvasInstance.getObjects.mockReturnValue([shape, arrowGroup]);
    mockCanvasInstance.getActiveObject.mockReturnValue(null);
    (Group as unknown as ReturnType<typeof vi.fn>).mockClear();
    mockCanvasInstance.remove.mockClear();

    canvasEventHandlers['object:modified']?.({ target: arrowGroup });

    // Arrow must be rebuilt (old group removed, Group constructor called).
    expect(mockCanvasInstance.remove).toHaveBeenCalledWith(arrowGroup);
    expect(Group).toHaveBeenCalled();

    // The rebuilt group should have _attachedFrom set to 'snap-shape'.
    const addCalls = mockCanvasInstance.add.mock.calls;
    const rebuilt = addCalls[addCalls.length - 1]?.[0] as Record<string, unknown>;
    expect(rebuilt?._attachedFrom).toBe('snap-shape');
  });

  it('object:modified on an arrow group with no nearby shapes updates _x1/_y1 without rebuilding', () => {
    const { engine } = makeEngine();
    engine.init();

    // No shapes on canvas.
    const arrowGroup = makeFabricObject({
      _isArrow: true,
      _x1: 0, _y1: 0, _x2: 100, _y2: 100,
      _gcx: 50, _gcy: 50,
      _arrowHeadStart: 'none', _arrowHeadEnd: 'open', _arrowType: 'sharp',
      getObjects: vi.fn().mockReturnValue([]),
    });
    // Simulate group moved 10px right, 5px down.
    (arrowGroup.getCenterPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 60, y: 55 });

    mockCanvasInstance.getObjects.mockReturnValue([arrowGroup]);
    (Group as unknown as ReturnType<typeof vi.fn>).mockClear();
    mockCanvasInstance.remove.mockClear();

    canvasEventHandlers['object:modified']?.({ target: arrowGroup });

    // No rebuild when no snap occurred.
    expect(mockCanvasInstance.remove).not.toHaveBeenCalledWith(arrowGroup);
    expect(Group).not.toHaveBeenCalled();

    // Stored endpoints should be updated to the new absolute positions.
    expect(arrowGroup._x1).toBe(10);  // 0 + (60-50)
    expect(arrowGroup._y1).toBe(5);   // 0 + (55-50)
    expect(arrowGroup._x2).toBe(110); // 100 + (60-50)
    expect(arrowGroup._y2).toBe(105); // 100 + (55-50)
    // Stored center should be updated for future deltas.
    expect(arrowGroup._gcx).toBe(60);
    expect(arrowGroup._gcy).toBe(55);
  });

  // ── snapLineAttachment: closest candidate wins ──────────────────────────────

  it('snapLineAttachment snaps to the closest shape when two shapes are within SNAP_RADIUS', () => {
    // Two shapes both within SNAP_RADIUS of x1/y1. Only the closer one should win.
    const { engine } = makeEngine();
    engine.init();

    // shapeA: center (20, 0), bbox [15,−5,25,5]. dist from (0,0) to bbox ≈ 15.0
    const shapeA = makeFabricObject({ _id: 'close-shape', left: 15, top: -5, width: 10, height: 10 });
    // shapeB: center (22, 0), bbox [17,−5,27,5]. dist from (0,0) to bbox ≈ 17.0
    const shapeB = makeFabricObject({ _id: 'far-shape',   left: 17, top: -5, width: 10, height: 10 });

    const lineProto = (Line as unknown as { prototype: object }).prototype;
    const testLine = Object.assign(
      Object.create(lineProto) as Record<string, unknown>,
      makeFabricObject({ x1: 0, y1: 0, x2: 999, y2: 999, _id: 'line-closest' }),
    );
    // Both shapes are in SNAP_RADIUS for x1/y1 = (0,0). shapeA is slightly closer.
    mockCanvasInstance.getObjects.mockReturnValue([shapeB, shapeA]); // shapeB first to confirm order doesn't win

    const eng = engine as unknown as { snapLineAttachment: (l: unknown) => void };
    eng.snapLineAttachment(testLine);

    // The closest shape (shapeA) should be chosen, not the last one in iteration order.
    expect(testLine._attachedFrom).toBe('close-shape');
  });

  // ── reSnapOnModified: arrow group selection restoration ─────────────────────

  it('object:modified on an arrow group that was active re-selects the rebuilt group', () => {
    const { engine } = makeEngine();
    engine.init();

    const arrowGroup = makeFabricObject({
      _isArrow: true, _id: 'ag-reselect',
      _x1: 0, _y1: 0, _x2: 100, _y2: 100,
      _gcx: 50, _gcy: 50,
      _arrowHeadStart: 'none', _arrowHeadEnd: 'open', _arrowType: 'sharp',
      getObjects: vi.fn().mockReturnValue([]),
    });
    // Shape nearby x1/y1 after move.
    const shape = makeFabricObject({ _id: 'rs-shape', left: 0, top: 0, width: 10, height: 10 });
    // Group moves so x1/y1 ends up within SNAP_RADIUS of shape.
    (arrowGroup.getCenterPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 55, y: 55 });

    // Track objects in canvas so the find()-by-_id lookup works.
    const objectsInCanvas: unknown[] = [shape, arrowGroup];
    mockCanvasInstance.add.mockImplementation((obj: unknown) => objectsInCanvas.push(obj));
    mockCanvasInstance.remove.mockImplementation((obj: unknown) => {
      const idx = objectsInCanvas.indexOf(obj);
      if (idx !== -1) objectsInCanvas.splice(idx, 1);
    });
    mockCanvasInstance.getObjects.mockImplementation(() => [...objectsInCanvas]);

    // The arrow group itself is the active object when object:modified fires.
    mockCanvasInstance.getActiveObject.mockReturnValue(arrowGroup);
    (Group as unknown as ReturnType<typeof vi.fn>).mockClear();
    mockCanvasInstance.setActiveObject.mockClear();

    canvasEventHandlers['object:modified']?.({ target: arrowGroup });

    // A rebuild must have occurred.
    expect(Group).toHaveBeenCalled();

    // setActiveObject should have been called to re-select the rebuilt group
    // (the newly-added group, not the old arrowGroup that was removed).
    const setActiveCalls = mockCanvasInstance.setActiveObject.mock.calls as unknown[][];
    expect(setActiveCalls.length).toBeGreaterThan(0);
    const lastSetArg = setActiveCalls[setActiveCalls.length - 1]?.[0] as Record<string, unknown>;
    expect(lastSetArg?._id).toBe('ag-reselect');
    // The re-selected object must be the newly rebuilt group, not the original.
    expect(lastSetArg).not.toBe(arrowGroup);
  });

  // ── reSnapOnModified: sketch-path connector ─────────────────────────────────

  it('object:modified on a sketch-path connector snaps and rebuilds it', () => {
    // A sketch-path connector (artist mode) was drawn between (0,0) and (100,0).
    // After being moved so its center is at (60, 0), the logical endpoints become:
    //   x1 = 60 - (100-0)/2 = 10,  y1 = 0
    //   x2 = 60 + (100-0)/2 = 110, y2 = 0
    // A shape is placed at [0,−5,20,5] (center 10,0), so dist(10,0) = 0 < 30 → snaps.
    const { engine } = makeEngine();
    engine.init();

    const shape = makeFabricObject({ _id: 'sp-snap-shape', left: 0, top: -5, width: 20, height: 10 });

    // Build a sketch-path-like object (type='path' with _origGeom).
    const sketchPath = makeFabricObject({
      type: 'path', _id: 'sp-mod',
      _origGeom: JSON.stringify({ type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 }),
      _sloppiness: 'artist',
      stroke: '#fff', strokeWidth: 2, fill: 'transparent', opacity: 1,
    });
    // After drag the path center is at (60, 0).
    (sketchPath.getCenterPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 60, y: 0 });

    mockCanvasInstance.getObjects.mockReturnValue([shape, sketchPath]);
    mockCanvasInstance.getActiveObject.mockReturnValue(null);
    (Path as unknown as ReturnType<typeof vi.fn>).mockClear();
    mockCanvasInstance.remove.mockClear();

    canvasEventHandlers['object:modified']?.({ target: sketchPath });

    // Old path removed, new path added (rebuilt via rebuildSketchPathForMove).
    expect(mockCanvasInstance.remove).toHaveBeenCalledWith(sketchPath);
    expect(Path).toHaveBeenCalled();

    // The rebuilt path should carry the attachment to sp-snap-shape.
    const addCalls = mockCanvasInstance.add.mock.calls;
    const rebuilt = addCalls[addCalls.length - 1]?.[0] as Record<string, unknown>;
    expect(rebuilt?._attachedFrom).toBe('sp-snap-shape');
  });

  it('object:modified on a sketch-path connector moved away clears attachment', () => {
    const { engine } = makeEngine();
    engine.init();

    // Shape far from all endpoints.
    const shape = makeFabricObject({ _id: 'sp-far-shape', left: 0, top: 0, width: 10, height: 10 });

    const sketchPath = makeFabricObject({
      type: 'path', _id: 'sp-mod-away',
      _origGeom: JSON.stringify({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }),
      _sloppiness: 'artist',
      _attachedFrom: 'sp-far-shape',
      _attachedFromAnchorX: 5, _attachedFromAnchorY: 0,
      stroke: '#fff', strokeWidth: 2, fill: 'transparent', opacity: 1,
    });
    // Move far away — both endpoints will be at ~(500, 0) and ~(510, 0), > 30 from shape.
    (sketchPath.getCenterPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 505, y: 0 });

    mockCanvasInstance.getObjects.mockReturnValue([shape, sketchPath]);
    (Path as unknown as ReturnType<typeof vi.fn>).mockClear();
    mockCanvasInstance.remove.mockClear();

    canvasEventHandlers['object:modified']?.({ target: sketchPath });

    // No snap: path should not be rebuilt.
    expect(mockCanvasInstance.remove).not.toHaveBeenCalledWith(sketchPath);
    expect(Path).not.toHaveBeenCalled();
    // Stale attachment cleared.
    expect(sketchPath._attachedFrom).toBeUndefined();
  });

  // ── scheduleAttachmentUpdate: rAF throttling ────────────────────────────────

  it('scheduleAttachmentUpdate processes the last target when multiple object:moving events fire', () => {
    // With synchronous requestAnimationFrame stub, each fire processes immediately.
    // Verify the correct shape is processed by checking that attached lines update.
    const { engine } = makeEngine();
    engine.init();

    const shape1 = makeFabricObject({ _id: 'throttle-s1', left: 100, top: 100, width: 100, height: 80 });
    const lineProto = (Line as unknown as { prototype: object }).prototype;
    const attachedLine = Object.assign(
      Object.create(lineProto) as Record<string, unknown>,
      makeFabricObject({
        x1: 0, y1: 0, x2: 0, y2: 0,
        _attachedTo: 'throttle-s1',
        _attachedToAnchorX: 50, _attachedToAnchorY: 0,
      }),
    );

    mockCanvasInstance.getObjects.mockReturnValue([shape1, attachedLine]);

    // Two rapid object:moving events — with synchronous RAF each runs immediately.
    canvasEventHandlers['object:moving']?.({ target: shape1 });
    canvasEventHandlers['object:moving']?.({ target: shape1 });

    // Line must have been updated (attached endpoint moved with shape).
    const setArgs = (attachedLine.set as ReturnType<typeof vi.fn>).mock.calls
      .find((args: unknown[]) => typeof args[0] === 'object' && 'x2' in (args[0] as object));
    expect(setArgs?.[0]).toMatchObject({ x2: 200, y2: 140 });
  });
});
