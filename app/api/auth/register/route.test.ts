/**
 * Tests for POST /api/auth/register
 *
 * Uses vi.mock to stub the Prisma-backed userRepository so that no real
 * database connection is needed.  The tests cover:
 *  - 201 Created on valid input
 *  - 409 Conflict when email is already in use
 *  - 422 Unprocessable Entity for validation failures (bad email, short
 *    password, missing name)
 *  - 400 Bad Request for malformed JSON body
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the userRepository so no DB is required ──────────────────────────────

vi.mock('@/lib/db/userRepository', () => ({
  createUser: vi.fn(),
}));

import { POST } from './route';
import { createUser } from '@/lib/db/userRepository';

const mockCreateUser = createUser as ReturnType<typeof vi.fn>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('returns 201 with public user data on valid input', async () => {
    const createdAt = new Date('2025-01-01T00:00:00Z');
    mockCreateUser.mockResolvedValue({
      id: 'usr_1',
      email: 'alice@example.com',
      name: 'Alice',
      image: null,
      createdAt,
    });

    const res = await POST(makeRequest({
      email: 'alice@example.com',
      password: 'securepass1234',
      name: 'Alice',
    }) as Parameters<typeof POST>[0]);

    expect(res.status).toBe(201);
    const json = await res.json() as Record<string, unknown>;
    expect(json).toMatchObject({ id: 'usr_1', email: 'alice@example.com', name: 'Alice' });
  });

  it('lower-cases the email before calling createUser', async () => {
    const createdAt = new Date();
    mockCreateUser.mockResolvedValue({
      id: 'usr_2',
      email: 'bob@example.com',
      name: 'Bob',
      image: null,
      createdAt,
    });

    await POST(makeRequest({
      email: 'BOB@EXAMPLE.COM',
      password: 'securepwd1234',
      name: 'Bob',
    }) as Parameters<typeof POST>[0]);

    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'bob@example.com' }),
    );
  });

  // ── Conflict ────────────────────────────────────────────────────────────────

  it('returns 409 when the email is already registered', async () => {
    mockCreateUser.mockRejectedValue(new Error('EMAIL_IN_USE'));

    const res = await POST(makeRequest({
      email: 'taken@example.com',
      password: 'securepass1234',
      name: 'Taken',
    }) as Parameters<typeof POST>[0]);

    expect(res.status).toBe(409);
    const json = await res.json() as Record<string, unknown>;
    expect(json).toHaveProperty('error');
  });

  // ── Validation failures (422) ───────────────────────────────────────────────

  it('returns 422 for an invalid email address', async () => {
    const res = await POST(makeRequest({
      email: 'not-an-email',
      password: 'securepass1234',
      name: 'Test',
    }) as Parameters<typeof POST>[0]);

    expect(res.status).toBe(422);
    const json = await res.json() as { errors: { field: string; message: string }[] };
    expect(json.errors.some((e) => e.field === 'email')).toBe(true);
  });

  it('returns 422 when password is shorter than 12 characters', async () => {
    const res = await POST(makeRequest({
      email: 'test@example.com',
      password: 'short',
      name: 'Test',
    }) as Parameters<typeof POST>[0]);

    expect(res.status).toBe(422);
    const json = await res.json() as { errors: { field: string; message: string }[] };
    expect(json.errors.some((e) => e.field === 'password')).toBe(true);
  });

  it('returns 422 when name is empty', async () => {
    const res = await POST(makeRequest({
      email: 'test@example.com',
      password: 'securepass1234',
      name: '',
    }) as Parameters<typeof POST>[0]);

    expect(res.status).toBe(422);
  });

  it('returns 422 when required fields are missing', async () => {
    const res = await POST(makeRequest({
      email: 'test@example.com',
    }) as Parameters<typeof POST>[0]);

    expect(res.status).toBe(422);
  });

  // ── Malformed request ───────────────────────────────────────────────────────

  it('returns 400 for a non-JSON body', async () => {
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not json',
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });

  // ── Server errors ───────────────────────────────────────────────────────────

  it('returns 500 for unexpected createUser errors', async () => {
    mockCreateUser.mockRejectedValue(new Error('DB connection refused'));

    const res = await POST(makeRequest({
      email: 'test@example.com',
      password: 'securepass1234',
      name: 'Test',
    }) as Parameters<typeof POST>[0]);

    expect(res.status).toBe(500);
  });
});
