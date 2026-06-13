/* eslint-disable max-lines-per-function */


import { CanvasEngine } from './canvasEngine.js';
import { FabricObject, Pattern } from 'fabric';

interface ArrowGroupExt extends FabricObject {
  _isArrow?: boolean;
  _arrowType?: string;
  _arrowHeadStart?: string;
  _arrowHeadEnd?: string;
}

export class UISyncManager {
  private engine: CanvasEngine;

  constructor(engine: CanvasEngine) {
    this.engine = engine;
  }

  public syncPropertiesPanelToSelection(): void {
    const o = this.engine.canvas?.getActiveObject();
    const panel = document.getElementById('props-panel');
    if (!panel) return;

    if (!o) {
      if (this.engine.currentTool === 'select') panel.classList.add('hide');
      return;
    }

    const shapeType = this.engine.getObjectShapeType(o);
    this.engine.showPropertiesPanelForShape(shapeType, true);

    this.syncOpacity(o);
    this.syncStroke(o);
    this.syncStrokeWidth(o);
    this.syncDashType(o);
    this.syncLink(o);
    this.syncMermaid(o);
    this.syncFill(o);
    this.syncFont(o);
    this.syncSloppiness(o);
    this.syncBorderRadius(o, shapeType);
    this.syncArrowType(o);
  }

  private syncOpacity(o: FabricObject): void {
    const opacity = ((o.get('opacity') as number) ?? 1) * 100;
    const slider = document.getElementById('opacitySlider') as HTMLInputElement | null;
    if (slider) slider.value = String(Math.round(opacity));
    const opLabel = document.getElementById('opacityValue');
    if (opLabel) opLabel.textContent = `${Math.round(opacity)}%`;
  }

  private syncStroke(o: FabricObject): void {
    const stroke = (o.get('stroke') as string) ?? this.engine.strokeColor;
    this.engine.strokeColor = stroke;
    const strokeDot = document.getElementById('strokeDot');
    if (strokeDot) strokeDot.style.background = stroke;
    const strokeColorInput = document.getElementById('strokeColorInput') as HTMLInputElement | null;
    if (strokeColorInput) strokeColorInput.value = stroke;
  }

  private syncStrokeWidth(o: FabricObject): void {
    const sw = (o.get('strokeWidth') as number) ?? 1.5;
    this.engine.strokeWidth = sw;
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
  }

  private syncDashType(o: FabricObject): void {
    const da = o.get('strokeDashArray') as number[] | null;
    const dashType = this.engine.getDashTypeFromArray(da);
    this.engine.strokeDashType = dashType;
    ['dash-solid', 'dash-dashed', 'dash-dotted'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('on');
      el.setAttribute('aria-pressed', 'false');
    });
    const dashEl = document.getElementById(`dash-${dashType}`);
    dashEl?.classList.add('on');
    dashEl?.setAttribute('aria-pressed', 'true');
  }

  private syncLink(o: FabricObject): void {
    const link = (o as FabricObject & { _link?: string })._link ?? '';
    const linkInput = document.getElementById('linkInput') as HTMLInputElement | null;
    if (linkInput) linkInput.value = link;
  }

  private syncMermaid(o: FabricObject): void {
    const mermaidCode = (o as FabricObject & { _mermaidCode?: string })._mermaidCode ?? '';
    const mermaidInput = document.getElementById('mermaidCodeInput') as HTMLTextAreaElement | null;
    if (mermaidInput) mermaidInput.value = mermaidCode;
  }

  private syncFill(o: FabricObject): void {
    const fillVal2 = o.get('fill');
    const objHasFill = fillVal2 !== 'transparent' && fillVal2 != null;
    this.engine.fillEnabled = !!objHasFill;
    const fillToggle = document.getElementById('tfillToggle');
    if (fillToggle) {
      fillToggle.textContent = this.engine.fillEnabled ? '⊠' : '⊡';
      fillToggle.setAttribute('aria-pressed', this.engine.fillEnabled ? 'true' : 'false');
    }

    const objFillColorStored = (o as FabricObject & { _fillColor?: string })._fillColor ?? this.engine.fillColor;
    const fillDot = document.getElementById('fillDot');
    if (fillDot) {
      if (typeof fillVal2 === 'string' && fillVal2 !== 'transparent') {
        fillDot.style.background = fillVal2;
      } else if (fillVal2 instanceof Pattern || (fillVal2 !== null && typeof fillVal2 === 'object')) {
        fillDot.style.background = objFillColorStored;
      } else {
        fillDot.style.background = 'transparent';
      }
    }
    const fillColorInput = document.getElementById('fillColorInput') as HTMLInputElement | null;
    if (fillColorInput) fillColorInput.value = objFillColorStored;
    this.engine.fillColor = objFillColorStored;

    const objFillPattern = ((o as FabricObject & { _fillPattern?: string })._fillPattern ?? 'filled') as 'filled' | 'striped' | 'crossed';
    ['fp-filled', 'fp-striped', 'fp-crossed'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('on');
      el.setAttribute('aria-pressed', 'false');
    });
    const fpActive = `fp-${objFillPattern}`;
    document.getElementById(fpActive)?.classList.add('on');
    document.getElementById(fpActive)?.setAttribute('aria-pressed', 'true');
  }

  private syncFont(o: FabricObject): void {
    const ff = (o.get('fontFamily') as string) ?? (this.engine as unknown as { fontFamily: string }).fontFamily;
    (this.engine as unknown as { fontFamily: string }).fontFamily = ff;
    ['font-sans', 'font-serif', 'font-mono'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('on');
      el.setAttribute('aria-pressed', 'false');
    });
    let fId = 'font-sans';
    if (ff.includes('serif')) fId = 'font-serif';
    else if (ff.includes('mono')) fId = 'font-mono';
    const fEl = document.getElementById(fId);
    fEl?.classList.add('on');
    fEl?.setAttribute('aria-pressed', 'true');
  }

  private syncSloppiness(o: FabricObject): void {
    const objSloppiness = ((o as FabricObject & { _sloppiness?: string })._sloppiness ?? 'architect') as 'architect' | 'artist' | 'cartoonist' | 'doodle';
    ['sloppy-architect', 'sloppy-artist', 'sloppy-cartoonist', 'sloppy-doodle'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('on');
      el.setAttribute('aria-pressed', 'false');
    });
    document.getElementById(`sloppy-${objSloppiness}`)?.classList.add('on');
    document.getElementById(`sloppy-${objSloppiness}`)?.setAttribute('aria-pressed', 'true');
  }

  private syncBorderRadius(o: FabricObject, shapeType: string): void {
    if (shapeType === 'rect') {
      let objRx: number;
      if (o.isType('rect')) {
        objRx = (o.get('rx') as number) ?? 0;
      } else {
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
      this.engine.borderRadiusEnabled = brType === 'rounded';
    }
  }

  private syncArrowType(o: FabricObject): void {
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
}
