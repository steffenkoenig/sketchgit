import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma before importing the module under test
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

import { createUser, verifyCredentials } from './userRepository';
import { prisma } from '@/lib/db/prisma';
import bcrypt from 'bcryptjs';

const mockPrismaUser = {
  findUnique: prisma.user.findUnique as ReturnType<typeof vi.fn>,
  create: prisma.user.create as ReturnType<typeof vi.fn>,
};
const mockBcrypt = {
  hash: bcrypt.hash as ReturnType<typeof vi.fn>,
  compare: bcrypt.compare as ReturnType<typeof vi.fn>,
};

describe('createUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws EMAIL_IN_USE when email already exists', async () => {
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(
      createUser({ email: 'taken@example.com', password: 'pass', name: 'Alice' }),
    ).rejects.toThrow('EMAIL_IN_USE');
  });

  it('creates a new user with a hashed password', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(null);
    mockBcrypt.hash.mockResolvedValue('hash_abc');
    const now = new Date();
    mockPrismaUser.create.mockResolvedValue({
      id: 'usr_1',
      email: 'alice@example.com',
      name: 'Alice',
      image: null,
      createdAt: now,
    });

    const result = await createUser({
      email: 'alice@example.com',
      password: 'secret',
      name: 'Alice',
    });

    expect(mockBcrypt.hash).toHaveBeenCalledWith('secret', 12);
    expect(mockPrismaUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'alice@example.com',
          name: 'Alice',
          passwordHash: 'hash_abc',
        }),
      }),
    );
    expect(result.id).toBe('usr_1');
    expect(result.email).toBe('alice@example.com');
  });
});

describe('verifyCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when user does not exist', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(null);
    mockBcrypt.compare.mockResolvedValue(false);
    const result = await verifyCredentials('unknown@example.com', 'pass');
    expect(result).toBeNull();
    // P054: bcrypt.compare must always be called (constant-time defence)
    expect(mockBcrypt.compare).toHaveBeenCalledTimes(1);
  });

  it('returns null when user has no password hash', async () => {
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'u1', passwordHash: null });
    mockBcrypt.compare.mockResolvedValue(false);
    const result = await verifyCredentials('u1@example.com', 'pass');
    expect(result).toBeNull();
    // P054: bcrypt.compare must always be called (constant-time defence)
    expect(mockBcrypt.compare).toHaveBeenCalledTimes(1);
  });

  it('returns null when password does not match', async () => {
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'u1', passwordHash: 'hash' });
    mockBcrypt.compare.mockResolvedValue(false);
    const result = await verifyCredentials('u1@example.com', 'wrong');
    expect(result).toBeNull();
  });

  it('returns public user when credentials are valid', async () => {
    const now = new Date();
    mockPrismaUser.findUnique.mockResolvedValue({
      id: 'usr_1',
      email: 'alice@example.com',
      name: 'Alice',
      image: null,
      createdAt: now,
      passwordHash: 'hash_abc',
    });
    mockBcrypt.compare.mockResolvedValue(true);

    const result = await verifyCredentials('alice@example.com', 'secret');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('usr_1');
    expect(result!.email).toBe('alice@example.com');
    expect(result!.name).toBe('Alice');
    expect(result!.createdAt).toBe(now);
  });
});
