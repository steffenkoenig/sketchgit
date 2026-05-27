import { describe, it, expect, vi } from "vitest";
import { checkDbHealth } from "./health";
import { PrismaClient } from "@prisma/client";

describe("checkDbHealth", () => {
  it("should return true when database query succeeds", async () => {
    const mockPrisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    } as unknown as PrismaClient;

    const result = await checkDbHealth(mockPrisma);
    expect(result).toBe(true);
    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
  });

  it("should return false when database query throws an error", async () => {
    const mockPrisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error("Database connection failed")),
    } as unknown as PrismaClient;

    const result = await checkDbHealth(mockPrisma);
    expect(result).toBe(false);
    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
  });
});
