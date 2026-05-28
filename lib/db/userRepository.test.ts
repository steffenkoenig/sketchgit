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

// P065 – mock argon2 (primary hashing algorithm)
vi.mock('argon2', () => ({
  default: {
    argon2id: 2,
    hash: vi.fn(),
    verify: vi.fn(),
  },
}));

// P065 – keep bcryptjs mock for legacy hash detection tests
vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
  },
}));

import { createUser, verifyCredentials, createPasswordResetToken, resetPassword } from './userRepository';
import { prisma } from '@/lib/db/prisma';
import argon2 from 'argon2';
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
const mockArgon2 = {
  hash: argon2.hash as ReturnType<typeof vi.fn>,
  verify: argon2.verify as ReturnType<typeof vi.fn>,
};
const mockBcrypt = {
  compare: bcrypt.compare as ReturnType<typeof vi.fn>,
};

describe('createUser (P065)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws EMAIL_IN_USE when email already exists', async () => {
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(
      createUser({ email: 'taken@example.com', password: 'pass', name: 'Alice' }),
    ).rejects.toThrow('EMAIL_IN_USE');
  });

  it('creates a new user with an Argon2id-hashed password', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(null);
    mockArgon2.hash.mockResolvedValue('$argon2id$v=19$m=65536,t=3,p=4$hash');
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

    expect(mockArgon2.hash).toHaveBeenCalledWith('secret', expect.objectContaining({ type: 2 }));
    expect(mockPrismaUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'alice@example.com',
          name: 'Alice',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
        }),
      }),
    );
    expect(result.id).toBe('usr_1');
    expect(result.email).toBe('alice@example.com');
  });
});

describe('verifyCredentials (P065)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when user does not exist (constant-time guard)', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(null);
    // The DUMMY_HASH is an Argon2id hash, so argon2.verify is called.
    mockArgon2.verify.mockResolvedValue(false);
    const result = await verifyCredentials('unknown@example.com', 'pass');
    expect(result).toBeNull();
    // Constant-time guard: always verify, even for unknown emails.
    expect(mockArgon2.verify).toHaveBeenCalledTimes(1);
  });

  it('returns null when user has no password hash', async () => {
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'u1', passwordHash: null });
    mockArgon2.verify.mockResolvedValue(false);
    const result = await verifyCredentials('u1@example.com', 'pass');
    expect(result).toBeNull();
  });

  it('returns null when Argon2id password does not match', async () => {
    mockPrismaUser.findUnique.mockResolvedValue({
      id: 'u1',
      passwordHash: '$argon2id$v=19$m=65536$hash',
    });
    mockArgon2.verify.mockResolvedValue(false);
    const result = await verifyCredentials('u1@example.com', 'wrong');
    expect(result).toBeNull();
  });

  it('returns public user when Argon2id credentials are valid', async () => {
    const now = new Date();
    mockPrismaUser.findUnique.mockResolvedValue({
      id: 'usr_1',
      email: 'alice@example.com',
      name: 'Alice',
      image: null,
      createdAt: now,
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
    });
    mockArgon2.verify.mockResolvedValue(true);
    // No re-hash needed (already Argon2id)
    mockArgon2.hash.mockResolvedValue('$argon2id$new');

    const result = await verifyCredentials('alice@example.com', 'secret');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('usr_1');
    expect(result!.email).toBe('alice@example.com');
    expect(result!.name).toBe('Alice');
    expect(result!.createdAt).toBe(now);
    // Already Argon2id: no re-hash
    expect(mockArgon2.hash).not.toHaveBeenCalled();
  });

  it('verifies legacy bcrypt hash and triggers transparent re-hash', async () => {
    const now = new Date();
    const bcryptHash = '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW';
    mockPrismaUser.findUnique.mockResolvedValue({
      id: 'usr_2',
      email: 'bob@example.com',
      name: 'Bob',
      image: null,
      createdAt: now,
      passwordHash: bcryptHash,
    });
    // Legacy path: bcrypt.compare
    mockBcrypt.compare.mockResolvedValue(true);
    // Re-hash
    mockArgon2.hash.mockResolvedValue('$argon2id$v=19$m=65536$newhash');
    mockPrismaUser.update.mockResolvedValue({});

    const result = await verifyCredentials('bob@example.com', 'secret');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('usr_2');
    // bcrypt path used for legacy hash
    expect(mockBcrypt.compare).toHaveBeenCalledWith('secret', bcryptHash);
    expect(mockArgon2.verify).not.toHaveBeenCalled();
  });

  it('does not re-hash when bcrypt check fails', async () => {
    const bcryptHash = '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW';
    mockPrismaUser.findUnique.mockResolvedValue({
      id: 'usr_2',
      email: 'bob@example.com',
      name: 'Bob',
      image: null,
      createdAt: new Date(),
      passwordHash: bcryptHash,
    });
    mockBcrypt.compare.mockResolvedValue(false);

    const result = await verifyCredentials('bob@example.com', 'wrong');
    expect(result).toBeNull();
    expect(mockArgon2.hash).not.toHaveBeenCalled();
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

describe('resetPassword (P040 + P065)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns false when token is invalid or expired', async () => {
    mockVerificationToken.findFirst.mockResolvedValue(null);
    const result = await resetPassword('bad-token', 'NewPassword123!');
    expect(result).toBe(false);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('returns true and updates password with Argon2id when token is valid', async () => {
    mockVerificationToken.findFirst.mockResolvedValue({
      identifier: 'alice@example.com',
      token: 'valid_token',
      expires: new Date(Date.now() + 60_000),
    });
    mockArgon2.hash.mockResolvedValue('$argon2id$new_hash');
    mockTransaction.mockImplementation(async (ops: Promise<unknown>[]) => {
      return Promise.all(ops);
    });
    mockPrismaUser.update.mockResolvedValue({});
    mockVerificationToken.deleteMany.mockResolvedValue({ count: 1 });

    const result = await resetPassword('valid_token', 'NewPassword123!');

    expect(result).toBe(true);
    expect(mockArgon2.hash).toHaveBeenCalledWith('NewPassword123!', expect.objectContaining({ type: 2 }));
    expect(mockTransaction).toHaveBeenCalled();
  });
});
