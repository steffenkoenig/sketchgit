import { describe, it, expect } from 'vitest';
import { ensureObjId, buildObjMap, extractProps, propsEqual } from './objectIdTracker';

describe('ensureObjId', () => {
  it('assigns a new _id when the object has none', () => {
    const obj: Record<string, unknown> = { type: 'rect' };
    const id = ensureObjId(obj);
    expect(id).toMatch(/^obj_/);
    expect(obj._id).toBe(id);
  });

  it('returns the existing _id unchanged', () => {
    const obj: Record<string, unknown> = { type: 'rect', _id: 'obj_abc123' };
    const id = ensureObjId(obj);
    expect(id).toBe('obj_abc123');
    expect(obj._id).toBe('obj_abc123');
  });

  it('generates unique ids for different objects', () => {
    const a: Record<string, unknown> = {};
    const b: Record<string, unknown> = {};
    expect(ensureObjId(a)).not.toBe(ensureObjId(b));
  });
});

describe('buildObjMap', () => {
  const makeCanvas = (objects: Record<string, unknown>[]) =>
    JSON.stringify({ version: '5.3.1', objects, background: '#000' });

  it('builds a map of id → object for objects with _id', () => {
    const objs = [
      { type: 'rect', _id: 'obj_aaa' },
      { type: 'ellipse', _id: 'obj_bbb' },
    ];
    const map = buildObjMap(makeCanvas(objs));
    expect(Object.keys(map)).toHaveLength(2);
    expect(map['obj_aaa'].type).toBe('rect');
    expect(map['obj_bbb'].type).toBe('ellipse');
  });

  it('excludes objects without _id', () => {
    const objs = [{ type: 'rect' }, { type: 'ellipse', _id: 'obj_ccc' }];
    const map = buildObjMap(makeCanvas(objs));
    expect(Object.keys(map)).toHaveLength(1);
    expect(map['obj_ccc']).toBeDefined();
  });

  it('returns empty map for canvas with no objects', () => {
    const map = buildObjMap(makeCanvas([]));
    expect(map).toEqual({});
  });

  it('accepts a pre-parsed object instead of a JSON string', () => {
    const parsed = { objects: [{ _id: 'obj_x', type: 'line' }] };
    const map = buildObjMap(parsed as Record<string, unknown>);
    expect(map['obj_x'].type).toBe('line');
  });
});

describe('extractProps', () => {
  it('extracts only MERGE_PROPS fields', () => {
    const obj: Record<string, unknown> = {
      type: 'rect',
      _id: 'obj_aaa',
      fill: '#ff0000',
      left: 10,
      top: 20,
      nonMergeProp: 'ignored',
    };
    const props = extractProps(obj);
    expect(props.fill).toBe('#ff0000');
    expect(props.left).toBe(10);
    expect(props.top).toBe(20);
    expect(props['nonMergeProp']).toBeUndefined();
    expect(props['type']).toBeUndefined();
    expect(props['_id']).toBeUndefined();
  });

  it('includes _groupObjects for group types', () => {
    const sub = [{ type: 'rect' }];
    const obj: Record<string, unknown> = { type: 'group', objects: sub };
    const props = extractProps(obj);
    expect(props._groupObjects).toBe(JSON.stringify(sub));
  });

  it('does not include _groupObjects when objects field is absent', () => {
    const obj: Record<string, unknown> = { type: 'rect', fill: 'blue' };
    const props = extractProps(obj);
    expect(props._groupObjects).toBeUndefined();
  });

  it('omits undefined MERGE_PROPS', () => {
    const obj: Record<string, unknown> = { fill: '#fff' };
    const props = extractProps(obj);
    expect(Object.keys(props)).toEqual(['fill']);
  });
});

describe('propsEqual', () => {
  it('returns true for identical objects', () => {
    const a = { fill: '#fff', left: 5 };
    const b = { fill: '#fff', left: 5 };
    expect(propsEqual(a, b)).toBe(true);
  });

  it('returns false when a value differs', () => {
    const a = { fill: '#fff', left: 5 };
    const b = { fill: '#000', left: 5 };
    expect(propsEqual(a, b)).toBe(false);
  });

  it('returns false when keys differ', () => {
    const a = { fill: '#fff' };
    const b = { fill: '#fff', left: 5 };
    expect(propsEqual(a, b)).toBe(false);
  });

  it('handles nested values via JSON serialization', () => {
    const a = { path: [[1, 2], [3, 4]] };
    const b = { path: [[1, 2], [3, 4]] };
    const c = { path: [[1, 2], [3, 5]] };
    expect(propsEqual(a, b)).toBe(true);
    expect(propsEqual(a, c)).toBe(false);
  });
});
