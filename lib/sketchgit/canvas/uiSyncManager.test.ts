// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UISyncManager } from './uiSyncManager.js';
import { CanvasEngine } from './canvasEngine.js';
import { FabricObject, Pattern } from 'fabric';

describe('UISyncManager', () => {
  let mockEngine: any;
  let manager: UISyncManager;

  beforeEach(() => {
    // Setup DOM elements expected by UISyncManager
    document.body.innerHTML = `
      <div id="props-panel"></div>
      <input id="opacitySlider" />
      <span id="opacityValue"></span>
      <div id="strokeDot"></div>
      <input id="strokeColorInput" />
      <button id="sz1"></button>
      <button id="sz3"></button>
      <button id="sz5"></button>
      <button id="dash-solid"></button>
      <button id="dash-dashed"></button>
      <button id="dash-dotted"></button>
      <input id="linkInput" />
      <textarea id="mermaidCodeInput"></textarea>
      <button id="tfillToggle"></button>
      <div id="fillDot"></div>
      <input id="fillColorInput" />
      <button id="fp-filled"></button>
      <button id="fp-striped"></button>
      <button id="fp-crossed"></button>
      <button id="font-sans"></button>
      <button id="font-serif"></button>
      <button id="font-mono"></button>
      <button id="sloppy-architect"></button>
      <button id="sloppy-artist"></button>
      <button id="sloppy-cartoonist"></button>
      <button id="sloppy-doodle"></button>
      <button id="br-sharp"></button>
      <button id="br-rounded"></button>
      <button id="at-sharp"></button>
      <button id="at-curved"></button>
      <button id="at-elbow"></button>
      <button id="ahs-none"></button>
      <button id="ahs-open"></button>
      <button id="ahs-triangle"></button>
      <button id="ahs-triangleoutline"></button>
      <button id="ahe-none"></button>
      <button id="ahe-open"></button>
      <button id="ahe-triangle"></button>
      <button id="ahe-triangleoutline"></button>
    `;

    mockEngine = {
      canvas: {
        getActiveObject: vi.fn(),
      },
      currentTool: 'select',
      getObjectShapeType: vi.fn().mockReturnValue('rect'),
      showPropertiesPanelForShape: vi.fn(),
      getDashTypeFromArray: vi.fn().mockReturnValue('solid'),
      strokeColor: '#000000',
      strokeWidth: 1,
      strokeDashType: 'solid',
      fillEnabled: true,
      fillColor: '#ffffff',
      borderRadiusEnabled: false,
    };

    manager = new UISyncManager(mockEngine as unknown as CanvasEngine);
  });

  const createMockFabricObject = (props: Record<string, any> = {}) => {
    return {
      get: vi.fn((key: string) => props[key]),
      isType: vi.fn((type: string) => props.type === type),
      ...props
    } as unknown as FabricObject;
  };

  describe('syncPropertiesPanelToSelection', () => {
    it('returns early if props-panel is missing', () => {
      document.body.innerHTML = '';
      mockEngine.canvas.getActiveObject.mockReturnValue(createMockFabricObject());
      manager.syncPropertiesPanelToSelection();
      expect(mockEngine.getObjectShapeType).not.toHaveBeenCalled();
    });

    it('hides the properties panel if no active object and tool is select', () => {
      mockEngine.canvas.getActiveObject.mockReturnValue(null);
      manager.syncPropertiesPanelToSelection();

      const panel = document.getElementById('props-panel');
      expect(panel?.classList.contains('hide')).toBe(true);
    });

    it('does not hide properties panel if no active object but tool is not select', () => {
      mockEngine.currentTool = 'rect';
      mockEngine.canvas.getActiveObject.mockReturnValue(null);
      manager.syncPropertiesPanelToSelection();

      const panel = document.getElementById('props-panel');
      expect(panel?.classList.contains('hide')).toBe(false);
    });

    it('syncs properties when an active object is present with all properties', () => {
      const mockObj = createMockFabricObject({
        opacity: 0.5,
        stroke: '#ff0000',
        strokeWidth: 2,
        strokeDashArray: null,
        _link: 'https://example.com',
        _mermaidCode: 'graph TD',
        fill: '#00ff00',
        _fillColor: '#00ff00',
        _fillPattern: 'striped',
        fontFamily: 'serif',
        _sloppiness: 'artist',
        type: 'rect',
        rx: 5,
        _isArrow: true,
        _arrowType: 'curved',
        _arrowHeadStart: 'triangle',
        _arrowHeadEnd: 'open',
      });

      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj);
      mockEngine.getObjectShapeType.mockReturnValue('rect');
      mockEngine.getDashTypeFromArray.mockReturnValue('solid');

      manager.syncPropertiesPanelToSelection();

      // Opacity
      expect((document.getElementById('opacitySlider') as HTMLInputElement).value).toBe('50');
      expect(document.getElementById('opacityValue')?.textContent).toBe('50%');

      // Stroke
      expect(document.getElementById('strokeDot')?.style.background).toContain('rgb(255, 0, 0)'); // jsdom uses rgb
      expect((document.getElementById('strokeColorInput') as HTMLInputElement).value).toBe('#ff0000');

      // Stroke Width
      expect(document.getElementById('sz1')?.classList.contains('on')).toBe(true);
      expect(mockEngine.strokeWidth).toBe(2);

      // Dash Type
      expect(document.getElementById('dash-solid')?.classList.contains('on')).toBe(true);

      // Link
      expect((document.getElementById('linkInput') as HTMLInputElement).value).toBe('https://example.com');

      // Mermaid
      expect((document.getElementById('mermaidCodeInput') as HTMLTextAreaElement).value).toBe('graph TD');

      // Fill
      expect(mockEngine.fillEnabled).toBe(true);
      expect(document.getElementById('tfillToggle')?.textContent).toBe('⊠');
      expect(document.getElementById('fillDot')?.style.background).toContain('rgb(0, 255, 0)');
      expect((document.getElementById('fillColorInput') as HTMLInputElement).value).toBe('#00ff00');
      expect(document.getElementById('fp-striped')?.classList.contains('on')).toBe(true);

      // Font
      expect(document.getElementById('font-serif')?.classList.contains('on')).toBe(true);

      // Sloppiness
      expect(document.getElementById('sloppy-artist')?.classList.contains('on')).toBe(true);

      // Border Radius
      expect(document.getElementById('br-rounded')?.classList.contains('on')).toBe(true);
      expect(mockEngine.borderRadiusEnabled).toBe(true);

      // Arrow
      expect(document.getElementById('at-curved')?.classList.contains('on')).toBe(true);
      expect(document.getElementById('ahs-triangle')?.classList.contains('on')).toBe(true);
      expect(document.getElementById('ahe-open')?.classList.contains('on')).toBe(true);
    });

    it('syncs default properties when object properties are undefined or transparent', () => {
      const mockObj = createMockFabricObject({
        type: 'rect',
        fill: 'transparent'
      });

      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj);
      mockEngine.getObjectShapeType.mockReturnValue('rect');
      mockEngine.getDashTypeFromArray.mockReturnValue('dashed');
      mockEngine.fillColor = '#cccccc';
      mockEngine.strokeColor = '#333333';

      manager.syncPropertiesPanelToSelection();

      // Opacity
      expect((document.getElementById('opacitySlider') as HTMLInputElement).value).toBe('100');
      expect(document.getElementById('opacityValue')?.textContent).toBe('100%');

      // Stroke
      expect(document.getElementById('strokeDot')?.style.background).toContain('rgb(51, 51, 51)'); // #333333

      // Stroke Width
      expect(document.getElementById('sz1')?.classList.contains('on')).toBe(true); // default 1.5
      expect(mockEngine.strokeWidth).toBe(1.5);

      // Dash Type
      expect(document.getElementById('dash-dashed')?.classList.contains('on')).toBe(true);

      // Fill
      expect(mockEngine.fillEnabled).toBe(false);
      expect(document.getElementById('tfillToggle')?.textContent).toBe('⊡');
      expect(document.getElementById('fillDot')?.style.background).toContain('transparent');
      expect((document.getElementById('fillColorInput') as HTMLInputElement).value).toBe('#cccccc');
      expect(document.getElementById('fp-filled')?.classList.contains('on')).toBe(true); // default 'filled'

      // Font (should not set anything if undefined)
      expect(document.getElementById('font-sans')?.classList.contains('on')).toBe(false);

      // Sloppiness
      expect(document.getElementById('sloppy-architect')?.classList.contains('on')).toBe(true);

      // Border Radius
      expect(document.getElementById('br-sharp')?.classList.contains('on')).toBe(true); // default rx = 0
    });

    it('syncs border radius properties when shape is rect', () => {
      const mockObj = createMockFabricObject({
        type: 'rect',
        rx: 0
      });
      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj);
      mockEngine.getObjectShapeType.mockReturnValue('rect');

      manager.syncPropertiesPanelToSelection();
      expect(document.getElementById('br-sharp')?.classList.contains('on')).toBe(true);

      const mockObjRounded = createMockFabricObject({
        type: 'rect',
        rx: 5
      });
      mockEngine.canvas.getActiveObject.mockReturnValue(mockObjRounded);

      manager.syncPropertiesPanelToSelection();
      expect(document.getElementById('br-rounded')?.classList.contains('on')).toBe(true);
    });

    it('does not sync border radius properties when shape is not rect', () => {
      const mockObj = createMockFabricObject({
        type: 'circle',
        rx: 5
      });
      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj);
      mockEngine.getObjectShapeType.mockReturnValue('circle');

      manager.syncPropertiesPanelToSelection();
      expect(document.getElementById('br-rounded')?.classList.contains('on')).toBe(false);
      expect(document.getElementById('br-sharp')?.classList.contains('on')).toBe(false);
    });

    it('handles stroke widths sz3 and sz5 correctly', () => {
      const mockObj3 = createMockFabricObject({ strokeWidth: 3, type: 'rect' });
      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj3);
      manager.syncPropertiesPanelToSelection();
      expect(document.getElementById('sz3')?.classList.contains('on')).toBe(true);

      const mockObj5 = createMockFabricObject({ strokeWidth: 5, type: 'rect' });
      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj5);
      manager.syncPropertiesPanelToSelection();
      expect(document.getElementById('sz5')?.classList.contains('on')).toBe(true);
    });

    it('handles object fill as Pattern', () => {
      // Mocking an Image element since Node.js/jsdom might lack full canvas Image implementation
      const imgMock = new Image();
      imgMock.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const patternMock = new Pattern({ source: imgMock });
      const mockObj = createMockFabricObject({
        fill: patternMock,
        _fillColor: '#888888',
        type: 'rect'
      });

      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj);
      manager.syncPropertiesPanelToSelection();

      expect(document.getElementById('fillDot')?.style.background).toContain('rgb(136, 136, 136)'); // #888888
    });

    it('handles object fill as object (gradient/pattern)', () => {
      const mockObj = createMockFabricObject({
        fill: { type: 'linear' },
        _fillColor: '#777777',
        type: 'rect'
      });

      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj);
      manager.syncPropertiesPanelToSelection();

      expect(document.getElementById('fillDot')?.style.background).toContain('rgb(119, 119, 119)'); // #777777
    });

    it('handles fonts sans, serif, mono correctly', () => {
      const mockObjSans = createMockFabricObject({ fontFamily: 'Arial', type: 'text' });
      mockEngine.canvas.getActiveObject.mockReturnValue(mockObjSans);
      manager.syncPropertiesPanelToSelection();
      expect(document.getElementById('font-sans')?.classList.contains('on')).toBe(true);

      const mockObjSerif = createMockFabricObject({ fontFamily: 'Times New Roman, serif', type: 'text' });
      mockEngine.canvas.getActiveObject.mockReturnValue(mockObjSerif);
      manager.syncPropertiesPanelToSelection();
      expect(document.getElementById('font-serif')?.classList.contains('on')).toBe(true);

      const mockObjMono = createMockFabricObject({ fontFamily: 'Courier New, mono', type: 'text' });
      mockEngine.canvas.getActiveObject.mockReturnValue(mockObjMono);
      manager.syncPropertiesPanelToSelection();
      expect(document.getElementById('font-mono')?.classList.contains('on')).toBe(true);
    });

    it('handles border radius correctly from _origGeom if not rect type', () => {
      const mockObj = createMockFabricObject({
        type: 'path', // Not a rect natively, maybe a rounded rect path
        _origGeom: JSON.stringify({ rx: 10 })
      });
      mockObj.isType = vi.fn().mockReturnValue(false); // To hit the else branch

      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj);
      mockEngine.getObjectShapeType.mockReturnValue('rect'); // But conceptually a rect in our UI
      manager.syncPropertiesPanelToSelection();

      expect(document.getElementById('br-rounded')?.classList.contains('on')).toBe(true);
      expect(mockEngine.borderRadiusEnabled).toBe(true);
    });

    it('handles border radius correctly from _origGeom failing to parse', () => {
      const mockObj = createMockFabricObject({
        type: 'path',
        _origGeom: 'invalid json'
      });
      mockObj.isType = vi.fn().mockReturnValue(false);

      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj);
      mockEngine.getObjectShapeType.mockReturnValue('rect');
      manager.syncPropertiesPanelToSelection();

      expect(document.getElementById('br-sharp')?.classList.contains('on')).toBe(true);
      expect(mockEngine.borderRadiusEnabled).toBe(false);
    });

    it('handles border radius correctly from _origGeom failing gracefully when rx is undefined', () => {
      const mockObj = createMockFabricObject({
        type: 'path',
        _origGeom: JSON.stringify({ }) // Valid JSON, missing rx
      });
      mockObj.isType = vi.fn().mockReturnValue(false);

      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj);
      mockEngine.getObjectShapeType.mockReturnValue('rect');
      manager.syncPropertiesPanelToSelection();

      expect(document.getElementById('br-sharp')?.classList.contains('on')).toBe(true);
      expect(mockEngine.borderRadiusEnabled).toBe(false);
    });

    it('syncs arrow properties with triangle-outline suffix formatting correctly', () => {
      const mockObj = createMockFabricObject({
        type: 'path',
        _isArrow: true,
        _arrowType: 'elbow',
        _arrowHeadStart: 'triangle-outline',
        _arrowHeadEnd: 'none',
      });
      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj);
      manager.syncPropertiesPanelToSelection();

      expect(document.getElementById('at-elbow')?.classList.contains('on')).toBe(true);
      // 'triangle-outline' should toggle 'ahs-triangleoutline' (suffix replaces '-' with '')
      expect(document.getElementById('ahs-triangleoutline')?.classList.contains('on')).toBe(true);
      expect(document.getElementById('ahe-none')?.classList.contains('on')).toBe(true);
    });

    it('tolerates missing DOM elements for sub-properties safely', () => {
      // Remove an element that syncFill expects
      document.getElementById('tfillToggle')?.remove();

      const mockObj = createMockFabricObject({
        type: 'rect',
        fill: '#000000'
      });
      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj);

      // Should run without throwing
      expect(() => manager.syncPropertiesPanelToSelection()).not.toThrow();
    });

    it('tolerates missing other DOM elements safely', () => {
      document.getElementById('sz3')?.remove();
      document.getElementById('dash-dashed')?.remove();
      document.getElementById('fp-striped')?.remove();
      document.getElementById('font-serif')?.remove();
      document.getElementById('sloppy-artist')?.remove();
      document.getElementById('br-rounded')?.remove();

      const mockObj = createMockFabricObject({
        type: 'rect',
        strokeWidth: 3,
        strokeDashArray: null, // solid, won't hit dashed but test checks for loop skipping
        _fillPattern: 'striped',
        fontFamily: 'serif',
        _sloppiness: 'artist',
        rx: 5
      });
      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj);
      mockEngine.getObjectShapeType.mockReturnValue('rect');

      expect(() => manager.syncPropertiesPanelToSelection()).not.toThrow();
    });

    it('syncs arrow type when it is arrow but no properties specified', () => {
      const mockObj = createMockFabricObject({
        type: 'path',
        _isArrow: true
      });
      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj);
      manager.syncPropertiesPanelToSelection();

      expect(document.getElementById('at-sharp')?.classList.contains('on')).toBe(true); // default sharp
      expect(document.getElementById('ahs-none')?.classList.contains('on')).toBe(true); // default none
      expect(document.getElementById('ahe-open')?.classList.contains('on')).toBe(true); // default open
    });

    it('syncs arrow type and tolerates missing dom node', () => {
      document.getElementById('ahs-open')?.remove();
      const mockObj = createMockFabricObject({
        type: 'path',
        _isArrow: true,
        _arrowHeadStart: 'open'
      });
      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj);

      expect(() => manager.syncPropertiesPanelToSelection()).not.toThrow();
    });

    it('syncs strokeDashArray correctly', () => {
      const mockObj = createMockFabricObject({
        type: 'rect',
        strokeDashArray: [5, 5]
      });
      mockEngine.getDashTypeFromArray.mockReturnValue('dashed');
      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj);

      manager.syncPropertiesPanelToSelection();

      expect(document.getElementById('dash-dashed')?.classList.contains('on')).toBe(true);
    });

    it('syncPropertiesPanelToSelection early return if obj is empty', () => {
      mockEngine.canvas = null; // No canvas

      expect(() => manager.syncPropertiesPanelToSelection()).not.toThrow();
    });

    it('tolerates DOM element missing in opacity', () => {
      document.getElementById('opacitySlider')?.remove();
      document.getElementById('opacityValue')?.remove();
      const mockObj = createMockFabricObject({ opacity: 0.5 });
      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj);
      expect(() => manager.syncPropertiesPanelToSelection()).not.toThrow();
    });

    it('tolerates DOM element missing in stroke', () => {
      document.getElementById('strokeDot')?.remove();
      document.getElementById('strokeColorInput')?.remove();
      const mockObj = createMockFabricObject({ stroke: '#000000' });
      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj);
      expect(() => manager.syncPropertiesPanelToSelection()).not.toThrow();
    });

    it('tolerates DOM element missing in link', () => {
      document.getElementById('linkInput')?.remove();
      const mockObj = createMockFabricObject({ _link: 'url' });
      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj);
      expect(() => manager.syncPropertiesPanelToSelection()).not.toThrow();
    });

    it('tolerates DOM element missing in mermaid', () => {
      document.getElementById('mermaidCodeInput')?.remove();
      const mockObj = createMockFabricObject({ _mermaidCode: 'code' });
      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj);
      expect(() => manager.syncPropertiesPanelToSelection()).not.toThrow();
    });

    it('tolerates DOM element missing in fill', () => {
      document.getElementById('fillDot')?.remove();
      document.getElementById('fillColorInput')?.remove();
      const mockObj = createMockFabricObject({ fill: '#000' });
      mockEngine.canvas.getActiveObject.mockReturnValue(mockObj);
      expect(() => manager.syncPropertiesPanelToSelection()).not.toThrow();
    });
  });
});
