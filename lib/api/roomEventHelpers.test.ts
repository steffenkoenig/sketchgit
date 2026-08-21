import { describe, it, expect } from 'vitest';
import { ClientIdSchema } from './roomEventHelpers';

describe('ClientIdSchema', () => {
  it('accepts valid clientId', () => {
    const data = { clientId: 'abc-123_456' };
    const result = ClientIdSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clientId).toBe(data.clientId);
    }
  });

  it('rejects missing clientId', () => {
    const result = ClientIdSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects clientId that is too short', () => {
    const result = ClientIdSchema.safeParse({ clientId: '' });
    expect(result.success).toBe(false);
  });

  it('rejects clientId that is too long', () => {
    const result = ClientIdSchema.safeParse({ clientId: 'a'.repeat(65) });
    expect(result.success).toBe(false);
  });

  it('accepts clientId that is exactly 64 characters long', () => {
    const data = { clientId: 'a'.repeat(64) };
    const result = ClientIdSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clientId).toBe(data.clientId);
    }
  });

  it('rejects incorrect type for clientId', () => {
    const result = ClientIdSchema.safeParse({ clientId: 123 });
    expect(result.success).toBe(false);
  });
});
