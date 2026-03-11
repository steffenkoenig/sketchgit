import { describe, it, expect } from 'vitest';
import {
  WsDrawSchema,
  WsDrawDeltaSchema,
  WsCommitSchema,
  WsCursorSchema,
  WsProfileSchema,
  WsPingSchema,
  WsPongSchema,
  InboundWsMessageSchema,
} from './wsSchemas';

describe('WsDrawSchema', () => {
  it('accepts valid draw message', () => {
    expect(WsDrawSchema.safeParse({ type: 'draw', canvas: '{}' }).success).toBe(true);
  });

  it('rejects missing canvas', () => {
    expect(WsDrawSchema.safeParse({ type: 'draw' }).success).toBe(false);
  });

  it('rejects canvas that is too short', () => {
    expect(WsDrawSchema.safeParse({ type: 'draw', canvas: '{' }).success).toBe(false);
  });
});

describe('WsDrawDeltaSchema', () => {
  it('accepts valid draw-delta message', () => {
    const msg = { type: 'draw-delta', added: [], modified: [], removed: [] };
    expect(WsDrawDeltaSchema.safeParse(msg).success).toBe(true);
  });

  it('rejects when added exceeds 500 items', () => {
    const msg = { type: 'draw-delta', added: Array(501).fill({}), modified: [], removed: [] };
    expect(WsDrawDeltaSchema.safeParse(msg).success).toBe(false);
  });
});

describe('WsCommitSchema', () => {
  const valid = {
    type: 'commit',
    sha: 'abc12345',
    branch: 'main',
    message: 'Initial commit',
    canvas: '{}',
  };

  it('accepts valid commit', () => {
    expect(WsCommitSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects sha that is too short', () => {
    expect(WsCommitSchema.safeParse({ ...valid, sha: 'short' }).success).toBe(false);
  });

  it('rejects empty message', () => {
    expect(WsCommitSchema.safeParse({ ...valid, message: '' }).success).toBe(false);
  });

  it('rejects empty branch', () => {
    expect(WsCommitSchema.safeParse({ ...valid, branch: '' }).success).toBe(false);
  });

  it('accepts optional isMerge field', () => {
    expect(WsCommitSchema.safeParse({ ...valid, isMerge: true }).success).toBe(true);
  });

  it('accepts optional parents array', () => {
    expect(WsCommitSchema.safeParse({ ...valid, parents: ['abc12345', 'def67890'] }).success).toBe(true);
  });
});

describe('WsCursorSchema', () => {
  it('accepts valid cursor', () => {
    expect(WsCursorSchema.safeParse({ type: 'cursor', x: 100, y: 200 }).success).toBe(true);
  });

  it('rejects non-finite numbers', () => {
    expect(WsCursorSchema.safeParse({ type: 'cursor', x: Infinity, y: 0 }).success).toBe(false);
  });

  it('rejects missing coordinates', () => {
    expect(WsCursorSchema.safeParse({ type: 'cursor' }).success).toBe(false);
  });
});

describe('WsProfileSchema', () => {
  it('accepts profile with name and color', () => {
    expect(WsProfileSchema.safeParse({ type: 'profile', name: 'Alice', color: '#ff0000' }).success).toBe(true);
  });

  it('accepts profile with no fields', () => {
    expect(WsProfileSchema.safeParse({ type: 'profile' }).success).toBe(true);
  });
});

describe('WsPingSchema / WsPongSchema', () => {
  it('accepts ping', () => {
    expect(WsPingSchema.safeParse({ type: 'ping' }).success).toBe(true);
  });

  it('accepts pong', () => {
    expect(WsPongSchema.safeParse({ type: 'pong' }).success).toBe(true);
  });
});

describe('InboundWsMessageSchema discriminated union', () => {
  it('dispatches to correct schema by type', () => {
    const result = InboundWsMessageSchema.safeParse({ type: 'ping' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.type).toBe('ping');
  });

  it('rejects unknown type', () => {
    expect(InboundWsMessageSchema.safeParse({ type: 'unknown-type' }).success).toBe(false);
  });

  it('rejects missing type', () => {
    expect(InboundWsMessageSchema.safeParse({ canvas: '{}' }).success).toBe(false);
  });

  it('rejects commit missing required fields', () => {
    expect(InboundWsMessageSchema.safeParse({ type: 'commit', sha: 'abc12345' }).success).toBe(false);
  });
});
