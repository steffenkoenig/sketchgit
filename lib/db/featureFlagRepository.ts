/**
 * featureFlagRepository – server-side data access for feature flags (P090).
 */
import { prisma } from "@/lib/db/prisma";
import type { FeatureFlag } from "@prisma/client";

export interface TargetScope {
  userIds?: string[];
  roomIds?: string[];
}

export async function getFeatureFlag(name: string): Promise<FeatureFlag | null> {
  return prisma.featureFlag.findUnique({ where: { name } });
}

export async function listFeatureFlags(): Promise<FeatureFlag[]> {
  return prisma.featureFlag.findMany({ orderBy: { name: "asc" } });
}

export async function createFeatureFlag(
  name: string,
  description: string,
  enabled: boolean,
  targetScope: TargetScope = {},
): Promise<FeatureFlag> {
  return prisma.featureFlag.create({
    data: { name, description, enabled, targetScope: targetScope as object },
  });
}

export async function updateFeatureFlag(
  name: string,
  updates: { description?: string; enabled?: boolean; targetScope?: TargetScope },
): Promise<FeatureFlag | null> {
  try {
    return await prisma.featureFlag.update({
      where: { name },
      data: {
        ...(updates.description !== undefined ? { description: updates.description } : {}),
        ...(updates.enabled !== undefined ? { enabled: updates.enabled } : {}),
        ...(updates.targetScope !== undefined ? { targetScope: updates.targetScope as object } : {}),
      },
    });
  } catch {
    // Prisma throws P2025 when the record doesn't exist; the route maps this to 404.
    return null;
  }
}
