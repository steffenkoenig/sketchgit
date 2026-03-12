import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma before importing the module under test
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    verificationToken: {
      upsert: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

import { createUser, verifyCredentials, createPasswordResetToken, resetPassword } from './userRepository';
import { prisma } from '@/lib/db/prisma';
import bcrypt from 'bcryptjs';

const mockPrismaUser = {
  findUnique: prisma.user.findUnique as ReturnType<typeof vi.fn>,
  create: prisma.user.create as ReturnType<typeof vi.fn>,
  update: prisma.user.update as ReturnType<typeof vi.fn>,
};
const mockVerificationToken = {
  upsert: prisma.verificationToken.upsert as ReturnType<typeof vi.fn>,
  create: prisma.verificationToken.create as ReturnType<typeof vi.fn>,
  findFirst: prisma.verificationToken.findFirst as ReturnType<typeof vi.fn>,
  deleteMany: prisma.verificationToken.deleteMany as ReturnType<typeof vi.fn>,
};
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
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

describe('createPasswordResetToken (P040)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when email is not registered', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(null);
    const token = await createPasswordResetToken('unknown@example.com');
    expect(token).toBeNull();
    expect(mockVerificationToken.create).not.toHaveBeenCalled();
  });

  it('returns a 64-char hex string when user exists', async () => {
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'usr_1', email: 'alice@example.com' });
    mockVerificationToken.deleteMany.mockResolvedValue({ count: 0 });
    mockVerificationToken.create.mockResolvedValue({});
    const token = await createPasswordResetToken('alice@example.com');
    expect(typeof token).toBe('string');
    expect(token!.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(token!)).toBe(true);
  });

  it('stores the token in verificationToken after deleting old tokens', async () => {
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'usr_1', email: 'alice@example.com' });
    mockVerificationToken.deleteMany.mockResolvedValue({ count: 1 });
    mockVerificationToken.create.mockResolvedValue({});
    await createPasswordResetToken('alice@example.com');
    expect(mockVerificationToken.deleteMany).toHaveBeenCalledWith({ where: { identifier: 'alice@example.com' } });
    expect(mockVerificationToken.create).toHaveBeenCalledTimes(1);
  });
});

describe('resetPassword (P040)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns false when token is invalid or expired', async () => {
    mockVerificationToken.findFirst.mockResolvedValue(null);
    const result = await resetPassword('bad-token', 'NewPassword123!');
    expect(result).toBe(false);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('returns true and updates password when token is valid', async () => {
    mockVerificationToken.findFirst.mockResolvedValue({
      identifier: 'alice@example.com',
      token: 'valid_token',
      expires: new Date(Date.now() + 60_000),
    });
    mockBcrypt.hash.mockResolvedValue('new_hash');
    mockTransaction.mockImplementation(async (ops: Promise<unknown>[]) => {
      return Promise.all(ops);
    });
    mockPrismaUser.update.mockResolvedValue({});
    mockVerificationToken.deleteMany.mockResolvedValue({ count: 1 });
    const result = await resetPassword('valid_token', 'NewPassword123!');
    expect(result).toBe(true);
    expect(mockBcrypt.hash).toHaveBeenCalledWith('NewPassword123!', expect.any(Number));
    expect(mockTransaction).toHaveBeenCalled();
  });
});
