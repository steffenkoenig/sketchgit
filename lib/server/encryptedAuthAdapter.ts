/**
 * encryptedAuthAdapter – GAP-014. Wraps the Prisma client passed to
 * `PrismaAdapter()` so `Account.access_token` / `refresh_token` / `id_token`
 * are transparently encrypted on write and decrypted on read, without
 * touching the shared `prismaWrite`/`prismaRead` singletons (see
 * lib/db/prisma.ts) that every repository depends on — this extension is
 * scoped to exactly the `account` model operations NextAuth's adapter
 * performs, isolated from the P088 read-replica-fallback Proxy machinery.
 *
 * NextAuth's own PrismaAdapter never reads these fields back itself for a
 * JWT-session app like this one (verified: nothing in this codebase reads
 * account.access_token/refresh_token/id_token outside this extension and
 * the GAP-014 revocation flow) — decrypt-on-read exists so a future
 * consumer (or NextAuth internals) reading an Account row transparently
 * gets a usable value rather than ciphertext.
 */
import type { PrismaClient } from "@prisma/client";
import { encryptToken, decryptTokenSafe } from "@/lib/tokenEncryption";

const TOKEN_FIELDS = ["access_token", "refresh_token", "id_token"] as const;

function encryptAccountFields(data: Record<string, unknown>): void {
  for (const field of TOKEN_FIELDS) {
    const value = data[field];
    if (typeof value === "string" && value.length > 0) {
      data[field] = encryptToken(value);
    }
  }
}

function decryptAccountFields<T extends Record<string, unknown>>(account: T): T {
  for (const field of TOKEN_FIELDS) {
    const value = account[field];
    if (typeof value === "string") {
      (account as Record<string, unknown>)[field] = decryptTokenSafe(value);
    }
  }
  return account;
}

/**
 * Returns a Prisma Client Extension wrapping `client`'s `account` model
 * operations with transparent token encryption. Pass the result to
 * `PrismaAdapter()` instead of the raw client.
 */
export function withEncryptedAccountTokens(client: PrismaClient) {
  return client.$extends({
    name: "oauth-token-encryption",
    query: {
      account: {
        async create({ args, query }) {
          if (args.data) encryptAccountFields(args.data as Record<string, unknown>);
          return query(args);
        },
        async update({ args, query }) {
          if (args.data) encryptAccountFields(args.data as Record<string, unknown>);
          return query(args);
        },
        async upsert({ args, query }) {
          if (args.create) encryptAccountFields(args.create as Record<string, unknown>);
          if (args.update) encryptAccountFields(args.update as Record<string, unknown>);
          return query(args);
        },
        async findUnique({ args, query }) {
          const result = await query(args);
          return result ? decryptAccountFields(result as Record<string, unknown>) : result;
        },
        async findFirst({ args, query }) {
          const result = await query(args);
          return result ? decryptAccountFields(result as Record<string, unknown>) : result;
        },
        async findMany({ args, query }) {
          const results = await query(args);
          return (results as Record<string, unknown>[]).map(decryptAccountFields);
        },
      },
    },
  });
}
