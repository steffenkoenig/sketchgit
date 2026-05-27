import { PrismaClient } from "@prisma/client";

/**
 * P023 – lightweight DB health probe (SELECT 1)
 */
export async function checkDbHealth(prisma: PrismaClient): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
