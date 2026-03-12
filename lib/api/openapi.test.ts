/**
 * P062 – Unit tests for lib/api/openapi.ts
 *
 * We test `buildOpenApiSpec()` in isolation by mocking the route modules
 * so the tests do not require a database or Next.js runtime.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { z } from 'zod';

// ─── Stub the route modules that export Zod schemas ──────────────────────────

vi.mock('@/app/api/auth/register/route', () => ({
  RegisterSchema: z.object({ email: z.string().email(), password: z.string(), name: z.string() }),
}));
vi.mock('@/app/api/auth/reset-password/route', () => ({
  ResetPasswordSchema: z.object({ token: z.string(), password: z.string() }),
}));
vi.mock('@/app/api/rooms/[roomId]/route', () => ({
  PatchRoomSchema: z.object({ slug: z.string().nullable() }),
}));
vi.mock('@/app/api/rooms/[roomId]/commits/route', () => ({
  CommitsQuerySchema: z.object({ cursor: z.string().optional(), take: z.number().default(50) }),
}));
vi.mock('@/app/api/rooms/[roomId]/export/route', () => ({
  ExportQuerySchema: z.object({ format: z.enum(['png', 'svg']).default('png'), sha: z.string().optional() }),
}));

import { buildOpenApiSpec } from './openapi';

describe('buildOpenApiSpec (P062)', () => {
  let spec: ReturnType<typeof buildOpenApiSpec> & Record<string, unknown>;

  beforeAll(() => {
    spec = buildOpenApiSpec() as typeof spec;
  });

  it('returns an OpenAPI 3.1 document with the correct openapi version', () => {
    expect(spec.openapi).toBe('3.1.0');
  });

  it('includes SketchGit API title and version in info', () => {
    const info = spec.info as Record<string, string>;
    expect(info.title).toBe('SketchGit API');
    expect(info.version).toBe('1.0.0');
  });

  it('includes all expected API paths', () => {
    const paths = spec.paths as Record<string, unknown>;
    expect(paths).toHaveProperty('/api/auth/register');
    expect(paths).toHaveProperty('/api/auth/forgot-password');
    expect(paths).toHaveProperty('/api/auth/reset-password');
    expect(paths).toHaveProperty('/api/auth/account');
    expect(paths).toHaveProperty('/api/rooms/{roomId}');
    expect(paths).toHaveProperty('/api/rooms/{roomId}/commits');
    expect(paths).toHaveProperty('/api/rooms/{roomId}/export');
  });

  it('includes ApiError in components/schemas', () => {
    const schemas = (spec.components as Record<string, unknown>).schemas as Record<string, unknown>;
    expect(schemas).toHaveProperty('ApiError');
    const apiError = schemas.ApiError as Record<string, unknown>;
    expect(apiError.type).toBe('object');
    expect((apiError.required as string[])).toContain('code');
    expect((apiError.required as string[])).toContain('message');
  });

  it('includes Zod-derived RegisterRequest schema in components', () => {
    const schemas = (spec.components as Record<string, unknown>).schemas as Record<string, unknown>;
    expect(schemas).toHaveProperty('RegisterRequest');
    const reg = schemas.RegisterRequest as Record<string, unknown>;
    expect(reg.type).toBe('object');
  });

  it('cookieAuth security scheme is defined', () => {
    const schemes = (spec.components as Record<string, unknown>).securitySchemes as Record<string, unknown>;
    expect(schemes).toHaveProperty('cookieAuth');
    const auth = schemes.cookieAuth as Record<string, unknown>;
    expect(auth.type).toBe('apiKey');
    expect(auth.in).toBe('cookie');
  });

  it('/api/auth/register POST references RegisterRequest schema', () => {
    const paths = spec.paths as Record<string, Record<string, unknown>>;
    const post = paths['/api/auth/register'].post as Record<string, unknown>;
    expect(post.operationId).toBe('registerUser');
    const body = post.requestBody as Record<string, unknown>;
    const content = (body.content as Record<string, unknown>)['application/json'] as Record<string, unknown>;
    const schemaRef = content.schema as Record<string, string>;
    expect(schemaRef.$ref).toBe('#/components/schemas/RegisterRequest');
  });
});
