import { describe, it, expect } from 'vitest';
import { computeCanvasDelta, replayCanvasDelta } from './canvasDelta';

const obj1 = { _id: 'id1', type: 'rect', left: 10, top: 20 };
const obj2 = { _id: 'id2', type: 'circle', left: 50, top: 60 };
const obj3 = { _id: 'id3', type: 'text', left: 100, top: 200 };

function canvas(objects: unknown[]): string {
  return JSON.stringify({ version: '5.3.1', objects });
}

describe('computeCanvasDelta', () => {
  it('detects added objects', () => {
    const prev = canvas([obj1]);
    const next = canvas([obj1, obj2]);
    const delta = computeCanvasDelta(prev, next);
    expect(delta.added).toHaveLength(1);
    expect(delta.added[0]._id).toBe('id2');
    expect(delta.modified).toHaveLength(0);
    expect(delta.removed).toHaveLength(0);
  });

  it('detects removed objects', () => {
    const prev = canvas([obj1, obj2]);
    const next = canvas([obj1]);
    const delta = computeCanvasDelta(prev, next);
    expect(delta.removed).toContain('id2');
    expect(delta.added).toHaveLength(0);
    expect(delta.modified).toHaveLength(0);
  });

  it('detects modified objects', () => {
    const modified = { ...obj1, left: 99 };
    const prev = canvas([obj1]);
    const next = canvas([modified]);
    const delta = computeCanvasDelta(prev, next);
    expect(delta.modified).toHaveLength(1);
    expect((delta.modified[0] as { left: number }).left).toBe(99);
    expect(delta.added).toHaveLength(0);
    expect(delta.removed).toHaveLength(0);
  });

  it('returns empty delta for identical canvases', () => {
    const c = canvas([obj1, obj2]);
    const delta = computeCanvasDelta(c, c);
    expect(delta.added).toHaveLength(0);
    expect(delta.modified).toHaveLength(0);
    expect(delta.removed).toHaveLength(0);
  });

  it('ignores objects without _id', () => {
    const noId = { type: 'line', left: 0, top: 0 };
    const prev = canvas([noId]);
    const next = canvas([noId]);
    const delta = computeCanvasDelta(prev, next);
    expect(delta.added).toHaveLength(0);
    expect(delta.modified).toHaveLength(0);
    expect(delta.removed).toHaveLength(0);
  });
});

describe('replayCanvasDelta', () => {
  it('applies additions', () => {
    const base = canvas([obj1]);
    const delta = { added: [obj2], modified: [], removed: [] };
    const result = JSON.parse(replayCanvasDelta(base, delta)) as { objects: Array<{ _id: string }> };
    expect(result.objects).toHaveLength(2);
    expect(result.objects.map((o) => o._id)).toContain('id2');
  });

  it('applies removals', () => {
    const base = canvas([obj1, obj2]);
    const delta = { added: [], modified: [], removed: ['id2'] };
    const result = JSON.parse(replayCanvasDelta(base, delta)) as { objects: Array<{ _id: string }> };
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0]._id).toBe('id1');
  });

  it('applies modifications', () => {
    const base = canvas([obj1]);
    const updated = { ...obj1, left: 999 };
    const delta = { added: [], modified: [updated], removed: [] };
    const result = JSON.parse(replayCanvasDelta(base, delta)) as { objects: Array<{ _id: string; left: number }> };
    expect(result.objects[0].left).toBe(999);
  });

  it('preserves canvas metadata (version, etc)', () => {
    const base = canvas([obj1]);
    const delta = { added: [], modified: [], removed: [] };
    const result = JSON.parse(replayCanvasDelta(base, delta)) as { version: string };
    expect(result.version).toBe('5.3.1');
  });

  it('handles invalid base JSON gracefully', () => {
    const delta = { added: [obj1], modified: [], removed: [] };
    const result = JSON.parse(replayCanvasDelta('not-json', delta)) as { objects: unknown[] };
    expect(result.objects).toHaveLength(1);
  });

  it('roundtrip: computeCanvasDelta + replayCanvasDelta reconstructs target', () => {
    const prev = canvas([obj1, obj2]);
    const next = canvas([obj1, obj3]);
    const delta = computeCanvasDelta(prev, next);
    const reconstructed = JSON.parse(replayCanvasDelta(prev, delta)) as { objects: Array<{ _id: string }> };
    const ids = reconstructed.objects.map((o) => o._id).sort();
    expect(ids).toEqual(['id1', 'id3'].sort());
  });
});
