import { describe, it, expect, vi } from 'vitest';
import { validate } from './validate';
import { z } from 'zod';

// Mock NextResponse so we can test without a Next.js runtime
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({ body, init }),
  },
}));

const TestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  age: z.number().int().positive('Age must be a positive integer'),
});

describe('validate', () => {
  it('returns success with parsed data for a valid input', () => {
    const result = validate(TestSchema, { name: 'Alice', age: 30 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Alice');
      expect(result.data.age).toBe(30);
    }
  });

  it('returns failure response for invalid input', () => {
    const result = validate(TestSchema, { name: '', age: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const response = result.response as unknown as { body: { errors: { field: string; message: string }[] }; init: ResponseInit };
      expect(response.body.errors).toBeInstanceOf(Array);
      expect(response.body.errors.length).toBeGreaterThan(0);
      expect(response.init.status).toBe(422);
    }
  });

  it('returns failure response for null input', () => {
    const result = validate(TestSchema, null);
    expect(result.success).toBe(false);
  });

  it('includes field paths in errors', () => {
    const result = validate(TestSchema, { name: 'Alice', age: 'not-a-number' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const response = result.response as unknown as { body: { errors: { field: string }[] } };
      const fields = response.body.errors.map((e) => e.field);
      expect(fields).toContain('age');
    }
  });
});
