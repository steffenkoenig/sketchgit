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
      ...opts,
      set: vi.fn(function (this: Record<string, unknown>, key: string | Record<string, unknown>, val?: unknown) {
        if (typeof key === 'object') { Object.assign(this, key); } else { this[key] = val; }
        return this;
      }),
      containsPoint: vi.fn().mockReturnValue(false),
      enterEditing: vi.fn(),
      selectAll: vi.fn(),
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
    dispose: vi.fn(),
    getZoom: vi.fn().mockReturnValue(1),
    setZoom: vi.fn(),
    zoomToPoint: vi.fn(),
    setWidth: vi.fn(),
    setHeight: vi.fn(),
    getPointer: vi.fn().mockReturnValue({ x: 10, y: 20 }),
    loadFromJSON: vi.fn((_data: unknown, cb?: () => void) => cb && cb()),
    toJSON: vi.fn().mockReturnValue({ version: '5', objects: [] }),
    isDrawingMode: false,
    selection: true,
    defaultCursor: 'default',
    viewportTransform: [1, 0, 0, 1, 0, 0] as number[],
  };

  return { mockCanvasInstance, canvasEventHandlers, makeFabricObject };
});

vi.mock('fabric', () => ({
  fabric: {
    // Use regular functions (not arrow functions) so they can be called with `new`
    Canvas: vi.fn(function FabricCanvas() { return mockCanvasInstance; }),
    Rect: vi.fn(function FabricRect(opts: Record<string, unknown>) { return makeFabricObject(opts); }),
    Ellipse: vi.fn(function FabricEllipse(opts: Record<string, unknown>) { return makeFabricObject(opts); }),
    Line: vi.fn(function FabricLine(opts: Record<string, unknown>) { return makeFabricObject(opts); }),
    Path: vi.fn(function FabricPath(_d: string, opts: Record<string, unknown>) { return makeFabricObject(opts); }),
    IText: vi.fn(function FabricIText(_t: string, opts: Record<string, unknown>) { return makeFabricObject(opts); }),
    Polygon: vi.fn(function FabricPolygon(_pts: unknown[], opts: Record<string, unknown>) { return makeFabricObject(opts); }),
    Group: vi.fn(function FabricGroup(_items: unknown[], opts: Record<string, unknown>) { return makeFabricObject(opts); }),
  },
}));

import { fabric as fabricLib } from 'fabric';
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
  `;
}

function makeEngine() {
  const onBroadcastDraw = vi.fn();
  const onBroadcastCursor = vi.fn();
  const engine = new CanvasEngine(onBroadcastDraw, onBroadcastCursor);
  return { engine, onBroadcastDraw, onBroadcastCursor };
}

function resetMocks() {
  // Clear call histories (NOT implementations) on fabric constructors
  [fabricLib.Canvas, fabricLib.Rect, fabricLib.Ellipse, fabricLib.Line,
    fabricLib.Path, fabricLib.IText, fabricLib.Polygon, fabricLib.Group,
  ].forEach((f) => (f as unknown as ReturnType<typeof vi.fn>).mockClear());

  // Clear and restore mockCanvasInstance method state
  mockCanvasInstance.add.mockClear();
  mockCanvasInstance.remove.mockClear();
  mockCanvasInstance.setActiveObject.mockClear();
  mockCanvasInstance.renderAll.mockClear();
  mockCanvasInstance.dispose.mockClear();
  mockCanvasInstance.setZoom.mockClear();
  mockCanvasInstance.zoomToPoint.mockClear();
  mockCanvasInstance.setWidth.mockClear();
  mockCanvasInstance.setHeight.mockClear();

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
  mockCanvasInstance.getPointer.mockReset();
  mockCanvasInstance.getPointer.mockReturnValue({ x: 10, y: 20 });
  mockCanvasInstance.toJSON.mockReset();
  mockCanvasInstance.toJSON.mockReturnValue({ version: '5', objects: [] });
  mockCanvasInstance.loadFromJSON.mockReset();
  mockCanvasInstance.loadFromJSON.mockImplementation((_d: unknown, cb?: () => void) => cb && cb());

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
    const fabric = fabricLib;
    expect(fabric.Canvas).toHaveBeenCalled();
    expect(mockCanvasInstance.on).toHaveBeenCalledWith('mouse:down', expect.any(Function));
    expect(mockCanvasInstance.on).toHaveBeenCalledWith('mouse:move', expect.any(Function));
    expect(mockCanvasInstance.on).toHaveBeenCalledWith('mouse:up', expect.any(Function));
  });

  it('init() does nothing when canvas-wrap is absent', async () => {
    document.body.innerHTML = '';
    const { engine } = makeEngine();
    const fabric = fabricLib;
    (fabric.Canvas as unknown as ReturnType<typeof vi.fn>).mockClear();
    engine.init();
    expect(fabric.Canvas).not.toHaveBeenCalled();
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
});

describe('CanvasEngine – serialisation', () => {
  beforeEach(() => { setupDom(); resetMocks(); });

  it('getCanvasData() returns a JSON string', () => {
    const { engine } = makeEngine();
    engine.init();
    const data = engine.getCanvasData();
    expect(() => JSON.parse(data)).not.toThrow();
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
    expect(mockCanvasInstance.renderAll).toHaveBeenCalled();
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

  function fireMouseDown(tool: string, engine: CanvasEngine) {
    engine.setTool(tool);
    canvasEventHandlers['mouse:down']?.({ e: new MouseEvent('mousedown') });
  }

  it('mouse:down with "select" does not add any object', () => {
    const { engine } = makeEngine();
    engine.init();
    fireMouseDown('select', engine);
    expect(mockCanvasInstance.add).not.toHaveBeenCalled();
  });

  it('mouse:down with "rect" creates a Rect', async () => {
    const fabric = fabricLib;
    const { engine } = makeEngine();
    engine.init();
    fireMouseDown('rect', engine);
    expect(fabric.Rect).toHaveBeenCalled();
    expect(mockCanvasInstance.add).toHaveBeenCalled();
  });

  it('mouse:down with "ellipse" creates an Ellipse', async () => {
    const fabric = fabricLib;
    const { engine } = makeEngine();
    engine.init();
    fireMouseDown('ellipse', engine);
    expect(fabric.Ellipse).toHaveBeenCalled();
  });

  it('mouse:down with "line" creates a Line', async () => {
    const fabric = fabricLib;
    const { engine } = makeEngine();
    engine.init();
    fireMouseDown('line', engine);
    expect(fabric.Line).toHaveBeenCalled();
  });

  it('mouse:down with "arrow" creates a Line (arrow variant)', async () => {
    const fabric = fabricLib;
    const { engine } = makeEngine();
    engine.init();
    fireMouseDown('arrow', engine);
    expect(fabric.Line).toHaveBeenCalled();
  });

  it('mouse:down with "text" creates IText and enters editing', async () => {
    const fabric = fabricLib;
    (fabric.IText as unknown as ReturnType<typeof vi.fn>).mockClear();
    const { engine } = makeEngine();
    engine.init();
    fireMouseDown('text', engine);
    expect(fabric.IText).toHaveBeenCalled();
    const iTextInst = (fabric.IText as unknown as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value;
    expect(iTextInst?.enterEditing).toHaveBeenCalled();
  });

  it('mouse:down with "pen" starts path drawing', async () => {
    const fabric = fabricLib;
    (fabric.Path as unknown as ReturnType<typeof vi.fn>).mockClear();
    const { engine } = makeEngine();
    engine.init();
    fireMouseDown('pen', engine);
    expect(fabric.Path).toHaveBeenCalled();
  });

  it('mouse:move broadcasts cursor position', () => {
    const { engine, onBroadcastCursor } = makeEngine();
    engine.init();
    canvasEventHandlers['mouse:move']?.({ e: new MouseEvent('mousemove') });
    expect(onBroadcastCursor).toHaveBeenCalled();
  });

  it('mouse:move with "eraser" removes objects at pointer', () => {
    const obj = makeFabricObject();
    (obj.containsPoint as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
    mockCanvasInstance.getObjects.mockReturnValue([obj]);
    const { engine } = makeEngine();
    engine.init();
    engine.setTool('eraser');
    canvasEventHandlers['mouse:down']?.({ e: new MouseEvent('mousedown') });
    canvasEventHandlers['mouse:move']?.({ e: new MouseEvent('mousemove') });
    expect(mockCanvasInstance.remove).toHaveBeenCalledWith(obj);
  });

  it('mouse:move with "pen" updates the path while drawing', async () => {
    const fabric = fabricLib;
    (fabric.Path as unknown as ReturnType<typeof vi.fn>).mockClear();
    const { engine } = makeEngine();
    engine.init();
    fireMouseDown('pen', engine);
    canvasEventHandlers['mouse:move']?.({ e: new MouseEvent('mousemove') });
    // A new Path should have been created during the move
    expect(fabric.Path).toHaveBeenCalledTimes(2);
  });

  it('mouse:up finalises a shape that was dragged far enough', () => {
    mockCanvasInstance.getPointer
      .mockReturnValueOnce({ x: 10, y: 20 })
      .mockReturnValueOnce({ x: 100, y: 120 });
    const { engine, onBroadcastDraw } = makeEngine();
    engine.init();
    fireMouseDown('rect', engine);
    canvasEventHandlers['mouse:up']?.({ e: new MouseEvent('mouseup') });
    expect(onBroadcastDraw).toHaveBeenCalled();
  });

  it('mouse:up removes a zero-size shape (accidental click)', () => {
    mockCanvasInstance.getPointer.mockReturnValue({ x: 10, y: 20 });
    const { engine } = makeEngine();
    engine.init();
    fireMouseDown('rect', engine);
    canvasEventHandlers['mouse:up']?.({ e: new MouseEvent('mouseup') });
    expect(mockCanvasInstance.remove).toHaveBeenCalled();
  });

  it('mouse:up finalises a pen stroke', () => {
    const { engine, onBroadcastDraw } = makeEngine();
    engine.init();
    fireMouseDown('pen', engine);
    canvasEventHandlers['mouse:move']?.({ e: new MouseEvent('mousemove') });
    canvasEventHandlers['mouse:up']?.({ e: new MouseEvent('mouseup') });
    expect(onBroadcastDraw).toHaveBeenCalled();
  });

  it('mouse:wheel zooms the canvas', () => {
    const { engine } = makeEngine();
    engine.init();
    const wheelEvent = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    canvasEventHandlers['mouse:wheel']?.({ e: wheelEvent });
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
