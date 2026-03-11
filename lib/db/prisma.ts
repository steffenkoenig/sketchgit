import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prevent multiple Prisma Client instances during Next.js hot reloads in development.
// https://www.prisma.io/docs/guides/performance-and-optimization/connection-management

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  // Fall back to a non-connecting placeholder URL at build time when DATABASE_URL
  // is not set. Any real query will fail with a connection error, not an
  // env-missing error, which allows the Next.js build to complete successfully.
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://placeholder@placeholder/placeholder";
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
