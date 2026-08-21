import { describe, it, expect } from 'vitest';
import { ExportQuerySchema, ExportBodySchema } from './exportSchema';

describe('ExportQuerySchema', () => {
  it('parses valid inputs with default values', () => {
    const result = ExportQuerySchema.parse({});
    expect(result).toEqual({ format: 'png', theme: 'dark' });
  });

  it('parses valid inputs overriding defaults', () => {
    const result = ExportQuerySchema.parse({
      format: 'svg',
      theme: 'light',
      sha: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    });
    expect(result).toEqual({
      format: 'svg',
      theme: 'light',
      sha: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    });
  });

  it('fails if format is invalid', () => {
    const result = ExportQuerySchema.safeParse({ format: 'jpg' });
    expect(result.success).toBe(false);
  });

  it('fails if theme is invalid', () => {
    const result = ExportQuerySchema.safeParse({ theme: 'blue' });
    expect(result.success).toBe(false);
  });

  it('fails if sha is too long', () => {
    const result = ExportQuerySchema.safeParse({ sha: 'a'.repeat(65) });
    expect(result.success).toBe(false);
  });
});

describe('ExportBodySchema', () => {
  it('parses valid inputs with default values', () => {
    const result = ExportBodySchema.parse({ canvasJson: { objects: [] } });
    expect(result).toEqual({ canvasJson: { objects: [] }, format: 'png', theme: 'dark' });
  });

  it('parses valid inputs overriding defaults', () => {
    const result = ExportBodySchema.parse({
      canvasJson: { objects: [{ type: 'rect' }] },
      format: 'pdf',
      theme: 'light',
    });
    expect(result).toEqual({
      canvasJson: { objects: [{ type: 'rect' }] },
      format: 'pdf',
      theme: 'light',
    });
  });

  it('fails if canvasJson is missing', () => {
    const result = ExportBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('fails if canvasJson is not an object', () => {
    const result = ExportBodySchema.safeParse({ canvasJson: 'not-an-object' });
    expect(result.success).toBe(false);
  });

  it('fails if canvasJson lacks objects array', () => {
    const result = ExportBodySchema.safeParse({ canvasJson: { notObjects: [] } });
    expect(result.success).toBe(false);
  });

  it('fails if format is invalid', () => {
    const result = ExportBodySchema.safeParse({ canvasJson: { objects: [] }, format: 'jpg' });
    expect(result.success).toBe(false);
  });

  it('fails if theme is invalid', () => {
    const result = ExportBodySchema.safeParse({ canvasJson: { objects: [] }, theme: 'blue' });
    expect(result.success).toBe(false);
  });
});
