import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => {
  const client = {
    featureFlag: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  // P088 – prismaRead/prismaWrite alias the same mock client.
  return { prisma: client, prismaRead: client, prismaWrite: client };
});

import {
  getFeatureFlag,
  listFeatureFlags,
  createFeatureFlag,
  updateFeatureFlag,
} from "./featureFlagRepository";
import { prisma } from "@/lib/db/prisma";
import { makeFeatureFlag } from "../test/factories";

const mock = {
  findUnique: prisma.featureFlag.findUnique as ReturnType<typeof vi.fn>,
  findMany: prisma.featureFlag.findMany as ReturnType<typeof vi.fn>,
  create: prisma.featureFlag.create as ReturnType<typeof vi.fn>,
  update: prisma.featureFlag.update as ReturnType<typeof vi.fn>,
};

describe("featureFlagRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getFeatureFlag queries by unique name", async () => {
    mock.findUnique.mockResolvedValue(makeFeatureFlag({ name: "my-flag" }));
    const flag = await getFeatureFlag("my-flag");
    expect(mock.findUnique).toHaveBeenCalledWith({ where: { name: "my-flag" } });
    expect(flag?.name).toBe("my-flag");
  });

  it("listFeatureFlags orders by name ascending", async () => {
    mock.findMany.mockResolvedValue([]);
    await listFeatureFlags();
    expect(mock.findMany).toHaveBeenCalledWith({ orderBy: { name: "asc" } });
  });

  it("createFeatureFlag passes through all fields", async () => {
    mock.create.mockResolvedValue(makeFeatureFlag());
    await createFeatureFlag("new-flag", "desc", true, { userIds: ["usr_1"] });
    expect(mock.create).toHaveBeenCalledWith({
      data: { name: "new-flag", description: "desc", enabled: true, targetScope: { userIds: ["usr_1"] } },
    });
  });

  it("updateFeatureFlag only includes provided fields", async () => {
    mock.update.mockResolvedValue(makeFeatureFlag());
    await updateFeatureFlag("my-flag", { enabled: true });
    expect(mock.update).toHaveBeenCalledWith({
      where: { name: "my-flag" },
      data: { enabled: true },
    });
  });

  it("updateFeatureFlag returns null when the flag doesn't exist", async () => {
    mock.update.mockRejectedValue(new Error("Record to update not found"));
    const result = await updateFeatureFlag("missing-flag", { enabled: true });
    expect(result).toBeNull();
  });
});
